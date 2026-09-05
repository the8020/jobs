import {
  type Row,
  type Selectable,
  t,
  table,
  type TableDatabase,
} from "/p/the8020/db/mod.ts";

// Each node advances only its own calendar cursor. All has no shared cursor.
const Cursors = table("the8020__jobs__cursors", {
  id: t.text().primaryKey(),
  scheduleId: t.text(),
  nodeId: t.text(),
  revision: t.integer(),
  nextRunAt: t.datetime().nullable(),
}, {
  indexes: [
    { columns: ["scheduleId", "nodeId"], unique: true },
    { columns: ["nodeId", "nextRunAt", "scheduleId"] },
  ],
});
declare module "/p/the8020/db/types.ts" {
  interface Database extends TableDatabase<typeof Cursors> {}
}
export type CursorRow = Selectable<Row<typeof Cursors>>;
export default Cursors;
