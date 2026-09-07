import {
  type Row,
  type Selectable,
  t,
  table,
  type TableDatabase,
} from "/p/the8020/db/mod.ts";
import { programId } from "/p/the8020/packages/types/program.ts";
import { username } from "/p/the8020/users/types/user.ts";

const Schedules = table("the8020__jobs__schedules", {
  id: t.text().primaryKey(),
  name: t.text(),
  programId: t.from(programId),
  arguments: t.json(),
  username: t.from(username),
  sandboxGroup: t.text(),
  node: t.text().default("any"),
  schedule: t.json(),
  enabled: t.boolean().default(true),
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
