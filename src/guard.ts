import { context } from "@the8020/context";
import { filter, requirePermission } from "/p/the8020/auth/mod.ts";
import { jobStore } from "./store.ts";
import type { SaveJobInput } from "./types.ts";

const VIEW = "the8020.jobs.job.view";
const EDIT = "the8020.jobs.job.edit";
const RUN = "the8020.jobs.job.run";

/** Keep rows whose program the current user may view; never audits. */
function viewable<T extends { programId: string }>(items: T[]): Promise<T[]> {
  return filter(
    context.username,
    items,
    { programId: VIEW } as Partial<Record<keyof T, string>>,
  );
}

/**
 * The Jobs screens' view of the store. Permissions use the job's program ID.
 * `jobStore` (`mod.ts`) stays the trusted API for packages that schedule their
 * own maintenance under their own permissions.
 */
export const guardedJobs = {
  async list(...args: Parameters<typeof jobStore.list>) {
    const page = await jobStore.list(...args);
    return { ...page, items: await viewable(page.items) };
  },
  async inspect(id: string) {
    const job = await jobStore.inspect(id);
    await requirePermission(VIEW, job.input.programId);
    return job;
  },
  async save(request: SaveJobInput) {
    await requirePermission(EDIT, request.input.programId);
    if (request.id) {
      await requirePermission(
        EDIT,
        (await jobStore.inspect(request.id)).input.programId,
      );
    }
    return await jobStore.save(request);
  },
  async submit(input: Parameters<typeof jobStore.submit>[0]) {
    await requirePermission(RUN, input.programId);
    return await jobStore.submit(input);
  },
  async runNow(id: string) {
    await requirePermission(RUN, (await jobStore.inspect(id)).input.programId);
    return await jobStore.runNow(id);
  },
  runs: {
    async list(...args: Parameters<typeof jobStore.runs.list>) {
      const page = await jobStore.runs.list(...args);
      return { ...page, items: await viewable(page.items) };
    },
    async inspect(id: string) {
      const run = await jobStore.runs.inspect(id);
      await requirePermission(VIEW, run.programId);
      return run;
    },
  },
};
