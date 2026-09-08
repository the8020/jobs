import { sourceInfo } from "/p/the8020/packages/types/source.ts";
import { jobInfo, runId, scheduleId } from "../src/fields.ts";
import {
  type Row,
  type Selectable,
  t,
  table,
  type TableDatabase,
} from "/p/the8020/db/mod.ts";
import { programId } from "/p/the8020/packages/types/program.ts";

import { sandboxId, workerId } from "/p/the8020/admin-core/types/runtime.ts";

const Runs = table("the8020__jobs__runs", {
  id: t.from(runId).primaryKey(),
  scheduleId: t.from(scheduleId),
  occurrenceId: t.text(),
  name: t.from(jobInfo.shape.name),
  programId: t.from(programId),
  username: t.from(jobInfo.shape.runAs),
  targetNode: t.from(jobInfo.shape.node),
  nodeId: t.text(),
  state: t.from(jobInfo.shape.state),
  scheduledAt: t.datetime(),
  createdAt: t.datetime().defaultNow(),
  startedAt: t.datetime().nullable(),
  finishedAt: t.datetime().nullable(),
  deadlineAt: t.datetime().nullable(),
  input: t.json(),
  executionId: t.from(jobInfo.shape.executionId),
  sandboxId: t.from(sandboxId),
  workerId: t.from(workerId),
  contextId: t.from(jobInfo.shape.contextId),
  parentContextId: t.text(),
  logPosition: t.text(),
  packageCommit: t.from(sourceInfo.shape.commit),
  result: t.json().nullable(),
  failure: t.from(jobInfo.shape.failure),
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
