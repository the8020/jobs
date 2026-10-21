import { assertRejects } from "@std/assert";
import { authDatabase } from "/p/the8020/auth/src/test_support.ts";

Deno.test("running a program as a job requires run for that program", async () => {
  const fixture = await authDatabase();
  const { guardedJobs } = await import("./guard.ts");
  const users = await import("/p/the8020/users/src/admin.ts");
  try {
    await users.add("alice");
    fixture.asUser("alice");
    await assertRejects(
      () =>
        guardedJobs.submit(
          {
            programId: "the8020/demo/echo",
            arguments: [],
            username: "alice",
            sandboxGroup: "",
            node: "any",
          } as unknown as Parameters<typeof guardedJobs.submit>[0],
        ),
      Error,
      "Permission denied: the8020.jobs.job.run",
    );
  } finally {
    fixture.close();
  }
});
