import { fieldMetadata } from "/p/the8020/db/fields.ts";
import { jobInfo, nodeField } from "./fields.ts";
import { assert, assertEquals, assertThrows } from "@std/assert";
import { editorModel, inputFromModel, nodeOptions } from "./form.ts";

Deno.test("new jobs default to Any and every month and weekday", () => {
  const model = editorModel("robot");
  assertEquals(model.node, "any");
  assertEquals(model.username, "robot");
  assertEquals(Object.values(model.months), Array(12).fill(true));
  assertEquals(Object.values(model.weekdays), Array(7).fill(true));
  assertEquals(nodeOptions(["node-b", "node-a", "node-a"]), [
    { value: "any", label: "Any" },
    { value: "all", label: "All" },
    { value: "node:node-a", label: "node-a" },
    { value: "node:node-b", label: "node-b" },
  ]);
});

Deno.test("exact nodes named any or all remain independently selectable", () => {
  assertEquals(nodeOptions(["any", "all"]).map((option) => option.value), [
    "any",
    "all",
    "node:all",
    "node:any",
  ]);
});

Deno.test("form combines explicit appointments with yearly month/date/time recurrence", () => {
  const model = editorModel("robot");
  Object.assign(model, {
    name: "Annual report",
    programId: "the8020/jobs/echo",
    arguments: '[{"value":42},true]',
    datetimes: "2026-09-15 09:00\n2026-10-16T14:30Z",
    recurring: true,
    startDate: "2026-09-04",
    dayMode: "dates",
    dates: "1, 15, 31",
    times: "09:00, 14:30",
    node: "all",
  });
  for (const month of Object.keys(model.months)) {
    model.months[month] = month === "m9" || month === "m12";
  }
  const input = inputFromModel(model, true);
  assertEquals(input.arguments, [{ value: 42 }, true]);
  assertEquals(input.schedule, {
    datetimes: ["2026-09-15T09:00:00.000Z", "2026-10-16T14:30:00.000Z"],
    recurrence: {
      startDate: "2026-09-04",
      months: [9, 12],
      dayMode: "dates",
      dates: [1, 15, 31],
      weekdays: [],
      times: ["09:00", "14:30"],
    },
  });
  const roundTrip = editorModel("another", {
    id: "job-1",
    input,
    enabled: true,
    revision: 1,
    nextRunAt: null,
    createdAt: "",
    updatedAt: "",
  });
  assertEquals(inputFromModel(roundTrip, true), input);
});

Deno.test("manual runs ignore calendar fields and reject invalid JSON arguments", () => {
  const model = editorModel("robot");
  Object.assign(model, {
    name: "Example",
    programId: "the8020/jobs/echo",
    arguments: "[]",
    datetimes: "bad",
    recurring: true,
    dates: "bad",
    dayMode: "dates",
  });
  assertEquals(inputFromModel(model, false).schedule, {
    datetimes: [],
    recurrence: null,
  });
  model.arguments = "{}";
  assertThrows(() => inputFromModel(model, false), TypeError, "JSON array");
  model.arguments = "[";
  assertThrows(() => inputFromModel(model, false), TypeError, "valid JSON");
  model.arguments = "[]";
  model.recurring = false;
  model.datetimes = "2026-02-30 12:00";
  assertThrows(() => inputFromModel(model, true), TypeError, "invalid");
});

Deno.test("job fields carry help and node lookup preserves exact target values", async () => {
  for (const [name, schema] of Object.entries(jobInfo.shape)) {
    assert(fieldMetadata(schema)?.label, `${name} needs a label`);
    assert(fieldMetadata(schema)?.description, `${name} needs help`);
  }
  const help = fieldMetadata(nodeField(nodeOptions(["any", "other"])))
    ?.valueHelp;
  assert(help);
  const query = { search: " ANY ", filters: {}, sort: null };
  const first = await help({ query, offset: 0, limit: 1 });
  assertEquals(first.rows, [{ value: "any", label: "Any" }]);
  assertEquals([first.more, first.totalItems], [true, 2]);
  const last = await help({ query, offset: 1, limit: 1 });
  assertEquals(last.rows, [{ value: "node:any", label: "any" }]);
  assertEquals([last.more, last.totalItems], [false, 2]);
});
