import {
  type Row,
  type Selectable,
  t,
  table,
  type TableDatabase,
} from "/p/the8020/db/mod.ts";

const Schedules = table("the8020__jobs__schedules", {
  id: t.text().primaryKey(),
  name: t.text(),
  programId: t.text(),
  arguments: t.json(),
  username: t.text(),
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
