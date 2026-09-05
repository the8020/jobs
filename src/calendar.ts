import type { JobSchedule } from "./types.ts";

export function validateCalendar(schedule: JobSchedule): void {
  if (schedule.datetimes.length > 128) {
    throw new Error("At most 128 specific datetimes are allowed.");
  }
  if (!schedule.datetimes.length && !schedule.recurrence) {
    throw new Error("Enter specific datetimes or enable recurrence.");
  }
  for (const value of schedule.datetimes) {
    if (
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/
        .test(value) ||
      (!validDate(new Date(value)) ||
        new Date(value.slice(0, 10) + "T00:00:00Z").toISOString().slice(
            0,
            10,
          ) !== value.slice(0, 10))
    ) throw new Error("Invalid specific datetime.");
  }
  const r = schedule.recurrence;
  if (!r) return;
  const start = new Date(r.startDate + "T00:00:00Z");
  if (
    !/^\d{4}-\d\d-\d\d$/.test(r.startDate) || !validDate(start) ||
    start.toISOString().slice(0, 10) !== r.startDate
  ) throw new Error("Start date must be a valid YYYY-MM-DD date.");
  numbers(r.months, 1, 12, "months");
  if (r.dayMode === "dates") {
    numbers(r.dates, 1, 31, "month dates");
    if (r.weekdays.length) throw new Error("Select dates or weekdays.");
  } else if (r.dayMode === "weekdays") {
    numbers(r.weekdays, 0, 6, "weekdays");
    if (r.dates.length) throw new Error("Select dates or weekdays.");
  } else throw new Error("Select dates or weekdays.");
  if (
    !r.times.length || r.times.length > 96 ||
    r.times.some((value) => !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))
  ) throw new Error("Enter between 1 and 96 times as HH:MM.");
  if (
    !nextOccurrence(
      { datetimes: [], recurrence: r },
      new Date(start.getTime() - 1),
    )
  ) throw new Error("The selected months and dates never occur.");
}

function validDate(date: Date): boolean {
  return Number.isFinite(date.getTime()) && date.getUTCFullYear() >= 1970 &&
    date.getUTCFullYear() <= 9998;
}

function numbers(values: number[], min: number, max: number, label: string) {
  if (
    !values.length || new Set(values).size !== values.length ||
    values.some((value) =>
      !Number.isInteger(value) || value < min || value > max
    )
  ) throw new Error(`Select valid ${label}.`);
}

/** The first UTC occurrence strictly after the supplied instant. */
export function nextOccurrence(
  schedule: JobSchedule,
  after: Date,
): Date | null {
  let next = Infinity;
  const consider = (value: number) => {
    if (value > after.getTime() && value < next) next = value;
  };
  for (const value of schedule.datetimes) consider(Date.parse(value));
  const r = schedule.recurrence;
  if (r) {
    const day = new Date(
      Math.max(
        Date.parse(r.startDate + "T00:00:00Z"),
        Date.UTC(
          after.getUTCFullYear(),
          after.getUTCMonth(),
          after.getUTCDate(),
        ),
      ),
    );
    const end = new Date(day);
    end.setUTCFullYear(end.getUTCFullYear() + 9);
    for (
      ;
      day < end && day.getUTCFullYear() <= 9998 && day.getTime() <= next;
      day.setUTCDate(day.getUTCDate() + 1)
    ) {
      if (!r.months.includes(day.getUTCMonth() + 1)) continue;
      if (
        r.dayMode === "dates"
          ? !r.dates.includes(day.getUTCDate())
          : !r.weekdays.includes(day.getUTCDay())
      ) continue;
      let found = false;
      for (const time of r.times) {
        const [hours, minutes] = time.split(":").map(Number);
        const candidate = day.getTime() + hours! * 3600000 + minutes! * 60000;
        if (candidate > after.getTime()) found = true;
        consider(candidate);
      }
      if (found) break;
    }
  }
  return next < Infinity ? new Date(next) : null;
}

/** Coalesce overdue recurrence, while preserving every explicit appointment. */
export function advance(
  schedule: JobSchedule,
  previous: Date,
  now: Date,
): Date | null {
  let next = nextOccurrence(schedule, now);
  for (const value of schedule.datetimes) {
    const date = new Date(value);
    if (date > previous && (next === null || date < next)) next = date;
  }
  return next;
}
