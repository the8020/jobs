import { assert, assertEquals } from "@std/assert";
import type { NativeBrowserFixtureContext } from "../uui/browser_e2e.ts";

/** Boot indexing, ordinary scheduling, obsolete-session cleanup, and its UI. */
export default async function verify(context: NativeBrowserFixtureContext) {
  const { page, clickRow, clickButton, waitForScreen } = context;
  await clickRow(page, "the8020/jobs/jobs");
  await waitForScreen(page, "Jobs");
  await clickButton(page, "Static jobs");
  await waitForScreen(page, "Static jobs");
  await clickRow(page, "Clean up obsolete UUI sessions");
  await waitForScreen(page, "Clean up obsolete UUI sessions");
  assert(
    await page.evaluate<boolean>(`(() => {
      const control = [...document.querySelectorAll('[data-bind="programId"]')]
        .find(element => element.getClientRects().length && !element.closest('[inert]'));
      const screen = control?.closest('.screen');
      return control?.readOnly &&
        ![...screen.querySelectorAll('button')].some(button =>
          ['Save', 'Run now', 'Delete'].includes(button.textContent.trim()));
    })()`),
    "static details are read-only",
  );
  const sessionId = page.websocketFrames.map((frame) => {
    try {
      return JSON.parse(frame.payloadData).sessionId as string | undefined;
    } catch {
      return undefined;
    }
  }).findLast(Boolean);
  assert(sessionId);
  const source = `
    import { newId } from '@the8020/kernel';
    import { jobStore } from '/p/the8020/jobs/src/store.ts';
    import { scan } from '/p/the8020/jobs/src/runner.ts';
    import Sessions from '/p/the8020/uui/tables/sessions.ts';
    export default async function () {
      const job = (await jobStore.list(0, true)).items.find(job =>
        job.programId === 'the8020/uui/sessions-cleanup');
      if (!job?.nextRunAt) throw new Error('Static job was not boot-indexed');
      const live = await Sessions.selectAll().where(Sessions.sessionId, '=',
        ${JSON.stringify(sessionId)}).executeTakeFirstOrThrow();
      const old = new Date(Date.now() - 7 * 86400000);
      const obsolete = newId('uis');
      await Sessions.insert({ ...live, sessionId: obsolete,
        workerId: newId('wrk'), updatedAt: old }).execute();
      await Sessions.update({ updatedAt: old })
        .where(Sessions.sessionId, '=', live.sessionId).execute();
      // Short scheduler locks defer contention to the next scan.
      for (let tick = 0; tick < 5; tick++) {
        await scan(new Date(job.nextRunAt));
        if ((await jobStore.runs.list(job.id)).items.some(run =>
          run.state !== 'queued')) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      const missing = await Sessions.selectAll()
        .where(Sessions.sessionId, '=', obsolete).executeTakeFirst();
      const retained = await Sessions.selectAll()
        .where(Sessions.sessionId, '=', live.sessionId).executeTakeFirst();
      const runs = (await jobStore.runs.list(job.id)).items;
      return { jobId: job.id, at: job.nextRunAt, removed: !missing,
        retained: !!retained, state: runs[0]?.state, count: runs.length,
        run: runs[0] ? await jobStore.runs.inspect(runs[0].id) : null };
    }`;
  const evaluate = (code: string, other = false) =>
    (other ? context.otherAdmin : context.admin)([
      "runtime",
      "eval",
      code,
      "--read=/workspace/packages,/opt/runtime",
      "--timeout-ms=120000",
    ]);
  const first = (await evaluate(source)).result as {
    jobId: string;
    at: string;
    removed: boolean;
    retained: boolean;
    state: string;
    count: number;
  };
  assert(
    first.removed,
    `missing Worker metadata was removed: ${JSON.stringify(first)}`,
  );
  assert(first.retained, "old metadata for the live browser was retained");
  assertEquals(first.state, "succeeded");
  const second = await evaluate(
    `
    import { scan } from '/p/the8020/jobs/src/runner.ts';
    import { jobStore } from '/p/the8020/jobs/src/store.ts';
    export default async function () {
      await scan(new Date(${JSON.stringify(first.at)}));
      return (await jobStore.runs.list(${
      JSON.stringify(first.jobId)
    })).items.length;
    }`,
    true,
  );
  assertEquals(second.result, first.count, "Any runs once across both nodes");
  await clickButton(page, "Refresh");
  await context.waitForPage(
    page,
    `document.querySelector('[data-bind="lastState"]')?.value === 'succeeded'`,
    "static job displays its latest result",
  );
  await clickButton(page, "Run history");
  await waitForScreen(page, "Run history");
  await clickRow(page, "Clean up obsolete UUI sessions");
  await waitForScreen(page, "Run Clean up obsolete UUI sessions");
  await context.waitForPage(
    page,
    `document.querySelector('[data-bind="output"]')?.value.includes('"removed": 1')`,
    "scheduled cleanup output is retained in ordinary history",
  );
}
