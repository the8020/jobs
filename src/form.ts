import type { JobDefinition, JobInput } from "./types.ts";

export const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
export const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export interface EditorModel {
  name: string;
  programId: string;
  arguments: string;
  username: string;
  sandboxGroup: string;
  node: string;
  enabled: boolean;
  datetimes: string;
  recurring: boolean;
  startDate: string;
  dayMode: "weekdays" | "dates";
  dates: string;
  times: string;
  months: Record<string, boolean>;
  weekdays: Record<string, boolean>;
}

export function editorModel(
  username: string,
  definition?: JobDefinition,
): EditorModel {
  const input = definition?.input;
  const recurrence = input?.schedule.recurrence;
  return {
    name: input?.name ?? "",
    programId: input?.programId ?? "",
    arguments: JSON.stringify(input?.arguments ?? [], null, 2),
    username: input?.username ?? username,
    sandboxGroup: input?.sandboxGroup ?? "",
    node: input?.node ?? "any",
    enabled: definition?.enabled ?? true,
    datetimes: (input?.schedule.datetimes ?? []).map((value) =>
      value.replace("T", " ").replace(/:00(?:\.000)?Z$/, "")
    ).join("\n"),
    recurring: recurrence !== null && recurrence !== undefined,
    startDate: recurrence?.startDate ?? new Date().toISOString().slice(0, 10),
    dayMode: recurrence?.dayMode ?? "weekdays",
    dates: (recurrence?.dates ?? [1]).join(", "),
    times: (recurrence?.times ?? ["09:00"]).join(", "),
    months: Object.fromEntries(
      months.map((
        _,
        i,
      ) => [`m${i + 1}`, recurrence?.months.includes(i + 1) ?? true]),
    ),
    weekdays: Object.fromEntries(
      weekdays.map((
        _,
        i,
      ) => [`d${i}`, recurrence?.weekdays.includes(i) ?? true]),
    ),
  };
}

export function inputFromModel(
  model: EditorModel,
  scheduled: boolean,
): JobInput {
  const arguments_ = argumentsFromText(model.arguments);
  if (!model.name.trim()) throw new TypeError("Enter a job name.");
  if (!model.programId) throw new TypeError("Select a program.");
  const datetimes = scheduled
    ? model.datetimes.split(/[\n,]+/).map((value) => value.trim()).filter(
      Boolean,
    ).map(parseDatetime)
    : [];
  const dates = model.dayMode === "dates" && model.recurring && scheduled
    ? tokens(model.dates).map((value) => {
      if (!/^\d{1,2}$/.test(value)) {
        throw new TypeError("Month dates must be numbers from 1 to 31.");
      }
      return Number(value);
    })
    : [];
  return {
    name: model.name.trim(),
    programId: model.programId,
    arguments: arguments_,
    username: model.username,
    sandboxGroup: model.sandboxGroup.trim(),
    node: model.node,
    schedule: {
      datetimes,
      recurrence: scheduled && model.recurring
        ? {
          startDate: model.startDate,
          months: months.flatMap((_, i) =>
            model.months[`m${i + 1}`] ? [i + 1] : []
          ),
          dayMode: model.dayMode,
          dates,
          weekdays: model.dayMode === "weekdays"
            ? weekdays.flatMap((_, i) => model.weekdays[`d${i}`] ? [i] : [])
            : [],
          times: tokens(model.times),
        }
        : null,
    },
  };
}

export function argumentsFromText(value: string): unknown[] {
  let inputs: unknown;
  try {
    inputs = JSON.parse(value);
  } catch {
    throw new TypeError("Inputs must be valid JSON.");
  }
  if (!Array.isArray(inputs)) {
    throw new TypeError("Inputs must be a JSON array of arguments.");
  }
  return inputs;
}

function tokens(value: string): string[] {
  return value.split(/[\s,]+/).filter(Boolean);
}

function parseDatetime(value: string): string {
  const normalized = value.replace(" ", "T").replace(/Z$/, "");
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(normalized)
  ) {
    throw new TypeError(`Datetime ${value} must use YYYY-MM-DD HH:MM in UTC.`);
  }
  const date = new Date(normalized + "Z");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 16) !== normalized.slice(0, 16)
  ) {
    throw new TypeError(`Datetime ${value} is invalid.`);
  }
  return date.toISOString();
}

export function nodeOptions(ids: string[]): { value: string; label: string }[] {
  return [
    { value: "any", label: "Any" },
    { value: "all", label: "All" },
    ...[...new Set(ids)].sort().map((id) => ({
      value: `node:${id}`,
      label: id,
    })),
  ];
}

export function dateText(value: string | null): string {
  return value === null
    ? "—"
    : value.replace("T", " ").replace(/(?:\.000)?Z$/, " UTC");
}

export function nodeText(value: string): string {
  return value.replace(/^node:/, "");
}
