import { jobInfo, scheduleId } from "../src/fields.ts";
import {
  type Row,
  type Selectable,
  t,
  table,
  type TableDatabase,
} from "/p/the8020/db/mod.ts";
import { programId } from "/p/the8020/packages/types/program.ts";

const Schedules = table("the8020__jobs__schedules", {
  id: t.from(scheduleId).primaryKey(),
  name: t.from(jobInfo.shape.name),
  programId: t.from(programId),
  arguments: t.json(),
  username: t.from(jobInfo.shape.runAs),
  sandboxGroup: t.from(jobInfo.shape.sandboxGroup),
  node: t.from(jobInfo.shape.node).default("any"),
  schedule: t.json(),
  enabled: t.from(jobInfo.shape.enabled).default(true),
  revision: t.integer(),
  firstRunAt: t.datetime().nullable(),
  createdAt: t.datetime().defaultNow(),
  updatedAt: t.datetime().defaultNow(),
}, {
  indexes: [
    { columns: ["enabled", "node", "firstRunAt", "id"] },
    { columns: ["createdAt", "id"] },
  ],
});

declare module "/p/the8020/db/types.ts" {
  interface Database extends TableDatabase<typeof Schedules> {}
}

export type ScheduleRow = Selectable<Row<typeof Schedules>>;
export default Schedules;
