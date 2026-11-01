import { text as localizedText } from "/p/the8020/i18n/mod.ts";
import type { Text } from "/p/the8020/i18n/messages.ts";
import { msg } from "/p/the8020/jobs/i18n/messages.ts";
import type { JobDefinition, JobInput } from "./types.ts";

export const months = [
  msg("form.january"),
  msg("form.february"),
  msg("form.march"),
  msg("form.april"),
  msg("form.may"),
  msg("form.june"),
  msg("form.july"),
  msg("form.august"),
  msg("form.september"),
  msg("form.october"),
  msg("form.november"),
  msg("form.december"),
];
export const weekdays = [
  msg("form.sunday"),
  msg("form.monday"),
  msg("form.tuesday"),
  msg("form.wednesday"),
  msg("form.thursday"),
  msg("form.friday"),
  msg("form.saturday"),
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
  if (!model.name.trim()) {
    throw new TypeError(localizedText(msg("ui.enter_a_job_name")));
  }
  if (!model.programId) {
    throw new TypeError(localizedText(msg("ui.select_a_program")));
  }
  const datetimes = scheduled
    ? model.datetimes.split(/[\n,]+/).map((value) => value.trim()).filter(
      Boolean,
    ).map(parseDatetime)
    : [];
  const dates = model.dayMode === "dates" && model.recurring && scheduled
    ? tokens(model.dates).map((value) => {
      if (!/^\d{1,2}$/.test(value)) {
        throw new TypeError(
          localizedText(msg("ui.month_dates_must_be_numbers_from_1_to_31")),
        );
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
    throw new TypeError(localizedText(msg("ui.inputs_must_be_valid_json")));
  }
  if (!Array.isArray(inputs)) {
    throw new TypeError(
      localizedText(msg("ui.inputs_must_be_a_json_array_of_arguments")),
    );
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
    throw new TypeError(
      localizedText(
        msg("ui.datetime_value1_must_use_yyyy_mm_dd_hh_mm_in_utc", {
          value1: value,
        }),
      ),
    );
  }
  const date = new Date(normalized + "Z");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 16) !== normalized.slice(0, 16)
  ) {
    throw new TypeError(
      localizedText(msg("ui.datetime_value1_is_invalid", { value1: value })),
    );
  }
  return date.toISOString();
}

export function nodeOptions(ids: string[]): { value: string; label: Text }[] {
  return [
    { value: "any", label: msg("form.any") },
    { value: "all", label: msg("form.all") },
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
