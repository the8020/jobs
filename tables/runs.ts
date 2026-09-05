import {
  type Row,
  type Selectable,
  t,
  table,
  type TableDatabase,
} from "/p/the8020/db/mod.ts";

const Runs = table("the8020__jobs__runs", {
  id: t.text().primaryKey(),
  scheduleId: t.text(),
  occurrenceId: t.text(),
  name: t.text(),
  programId: t.text(),
  username: t.text(),
  targetNode: t.text(),
  nodeId: t.text(),
  state: t.enum(
    ["queued", "running", "succeeded", "failed", "interrupted"] as const,
  ),
  scheduledAt: t.datetime(),
  createdAt: t.datetime().defaultNow(),
  startedAt: t.datetime().nullable(),
  finishedAt: t.datetime().nullable(),
  deadlineAt: t.datetime().nullable(),
  input: t.json(),
  executionId: t.text(),
  packageCommit: t.text(),
  result: t.json().nullable(),
  logs: t.json(),
  failure: t.text(),
  truncated: t.boolean(),
}, {
  indexes: [
    { columns: ["state", "targetNode", "createdAt", "id"] },
    { columns: ["state", "deadlineAt"] },
    { columns: ["scheduleId", "createdAt", "id"] },
    { columns: ["createdAt", "id"] },
    { columns: ["occurrenceId", "targetNode"], unique: true },
  ],
});

declare module "/p/the8020/db/types.ts" {
  interface Database extends TableDatabase<typeof Runs> {}
}

export type RunRow = Selectable<Row<typeof Runs>>;
export default Runs;
