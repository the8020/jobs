import { assertEquals, assertThrows } from "@std/assert";
import { advance, nextOccurrence, validateCalendar } from "./calendar.ts";
import type { JobRecurrence, JobSchedule } from "./types.ts";
const daily = (): JobRecurrence => ({
  startDate: "2026-01-01",
  months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  dayMode: "weekdays",
  dates: [],
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  times: ["09:00", "14:30"],
});
Deno.test("UTC daily, weekly, monthly, yearly, leap, and union calendars", () => {
  const cases: [JobSchedule, string, string | null][] = [
    [
      { datetimes: [], recurrence: daily() },
      "2026-09-04T09:00:00Z",
      "2026-09-04T14:30:00Z",
    ],
    [
      { datetimes: [], recurrence: daily() },
      "2026-09-04T14:30:00Z",
      "2026-09-05T09:00:00Z",
    ],
    [
      {
        datetimes: [],
        recurrence: { ...daily(), weekdays: [1, 3], times: ["08:15", "18:00"] },
      },
      "2026-09-04T15:00:00Z",
      "2026-09-07T08:15:00Z",
    ],
    [
      {
        datetimes: [],
        recurrence: {
          ...daily(),
          dayMode: "dates",
          weekdays: [],
          dates: [31],
          times: ["12:00"],
        },
      },
      "2026-04-01T00:00:00Z",
      "2026-05-31T12:00:00Z",
    ],
    [
      {
        datetimes: [],
        recurrence: {
          ...daily(),
          dayMode: "dates",
          months: [3, 9],
          weekdays: [],
          dates: [1, 15],
          times: ["12:00"],
        },
      },
      "2026-03-15T12:00:00Z",
      "2026-09-01T12:00:00Z",
    ],
    [
      {
        datetimes: [],
        recurrence: {
          ...daily(),
          dayMode: "dates",
          months: [2],
          weekdays: [],
          dates: [29],
          times: ["00:00"],
        },
      },
      "2096-02-29T00:00:00Z",
      "2104-02-29T00:00:00Z",
    ],
    [
      { datetimes: [], recurrence: { ...daily(), startDate: "2026-10-02" } },
      "2026-01-01T00:00:00Z",
      "2026-10-02T09:00:00Z",
    ],
    [
      {
        datetimes: ["2026-10-01T00:00:00Z", "2026-09-04T07:00:00+02:00"],
        recurrence: null,
      },
      "2026-09-04T00:00:00Z",
      "2026-09-04T05:00:00Z",
    ],
    [
      {
        datetimes: ["2026-09-04T09:00:00Z", "2026-09-04T09:00:00Z"],
        recurrence: daily(),
      },
      "2026-09-04T09:00:00Z",
      "2026-09-04T14:30:00Z",
    ],
    [
      { datetimes: ["2026-12-01T09:00:00Z"], recurrence: daily() },
      "2026-09-04T14:30:00Z",
      "2026-09-05T09:00:00Z",
    ],
    [
      { datetimes: ["2026-09-04T09:00:00Z"], recurrence: null },
      "2026-09-04T09:00:00Z",
      null,
    ],
  ];
  for (const [schedule, after, want] of cases) {
    validateCalendar(schedule);
    assertEquals(
      nextOccurrence(schedule, new Date(after))?.toISOString() ?? null,
      want ? new Date(want).toISOString() : null,
    );
  }
});
Deno.test("calendars reject impossible dates and preserve explicit catch-up", () => {
  for (
    const mutation of [
      { startDate: "2026-02-30" },
      { months: [] },
      { months: [1, 1] },
      { months: [13] },
      { weekdays: [] },
      { dates: [1] },
      { times: ["25:00"] },
      { times: ["9:00"] },
      { dayMode: "dates" as const, weekdays: [], dates: [30], months: [2] },
    ]
  ) {
    assertThrows(() =>
      validateCalendar({
        datetimes: [],
        recurrence: { ...daily(), ...mutation },
      })
    );
  }
  assertThrows(() => validateCalendar({ datetimes: [], recurrence: null }));
  assertThrows(() =>
    validateCalendar({ datetimes: ["2026-02-30T09:00:00Z"], recurrence: null })
  );
  const schedule = {
    datetimes: ["2026-09-04T10:00:00Z", "2026-09-04T11:00:00Z"],
    recurrence: daily(),
  };
  assertEquals(
    advance(
      schedule,
      new Date("2026-09-04T09:00:00Z"),
      new Date("2026-09-05T00:00:00Z"),
    )?.toISOString(),
    "2026-09-04T10:00:00.000Z",
  );
});
