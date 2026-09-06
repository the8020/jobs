import { assertEquals } from "@std/assert";
import { kernelDatabaseBackendSymbol } from "@the8020/kernel";

(globalThis as unknown as Record<symbol, unknown>)[
  kernelDatabaseBackendSymbol
] = "sqlite";
const { descriptorOf } = await import("/p/the8020/db/mod.ts");
const Schedules = (await import("./schedules.ts")).default;
const Runs = (await import("./runs.ts")).default;
const Cursors = (await import("./cursors.ts")).default;

Deno.test("job tables index due schedules, node queues, deadlines, and history", () => {
  assertEquals(
    descriptorOf(Cursors).indexes.some((index) =>
      index.unique && index.columns.join(",") === "scheduleId,nodeId"
    ),
    true,
  );
  assertEquals(Schedules.table, "the8020__jobs__schedules");
  assertEquals(Runs.table, "the8020__jobs__runs");
  const schedules = descriptorOf(Schedules), runs = descriptorOf(Runs);
  assertEquals(runs.columns.some((column) => column.name === "logs"), false);
  for (
    const name of [
      "nodeId",
      "executionId",
      "sandboxId",
      "workerId",
      "contextId",
      "logPosition",
    ]
  ) {
    assertEquals(runs.columns.some((column) => column.name === name), true);
  }
  assertEquals(
    schedules.indexes.some((index) =>
      index.columns.join(",") === "enabled,node,firstRunAt,id"
    ),
    true,
  );
  assertEquals(
    runs.indexes.some((index) =>
      index.columns.join(",") === "state,targetNode,createdAt,id"
    ),
    true,
  );
  assertEquals(
    runs.indexes.some((index) =>
      index.unique && index.columns.join(",") === "occurrenceId,targetNode"
    ),
    true,
  );
  assertEquals(
    runs.columns.find((column) => column.name === "result")?.nullable,
    true,
  );
  assertEquals(
    schedules.columns.some((column) =>
      /scaling|workers|parallelism/i.test(column.name)
    ),
    false,
  );
});
