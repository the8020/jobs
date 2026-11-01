import { msg } from "/p/the8020/jobs/i18n/messages.ts";
import { runtimeInfo } from "/p/the8020/admin-core/types/runtime.ts";
import { username } from "/p/the8020/users/types/user.ts";
import {
  choiceHelp,
  field,
  type ValueHelpItem,
  z,
} from "/p/the8020/db/fields.ts";

export const scheduleId: z.ZodString = field(z.string(), {
  label: msg("admin.schedule"),
  description: msg("fields.the_saved_schedule_that_created_this_run"),
  open: async (value) => {
    const { default: jobs } = await import("../programs/jobs/program.ts");
    await jobs(value);
  },
});
export const runId: z.ZodString = field(z.string(), {
  label: msg("fields.run_id"),
  description: msg("fields.the_saved_history_record_for_one_job"),
  open: async (value) => {
    const { runDetail } = await import("./admin.ts");
    await runDetail(value);
  },
});

export const jobInfo = z.object({
  staticKey: field(z.string(), {
    label: msg("fields.static_job"),
    description: msg("fields.the_package_and_job_filename_defining_this"),
  }),
  runAs: field(username, {
    label: msg("admin.run_as"),
    description: msg("fields.choose_an_enabled_account_to_run_this"),
  }),
  name: field(z.string(), {
    label: msg("fields.job"),
    description: msg("fields.a_name_that_helps_you_recognize_this"),
  }),
  scheduleStatus: field(z.string(), {
    label: msg("fields.status"),
    description: msg("fields.scheduled_jobs_can_run_at_their_next"),
    valueHelp: choiceHelp(z.string(), [
      msg("admin.scheduled"),
      msg("admin.paused"),
    ]),
  }),
  state: field(
    z.enum(["queued", "running", "succeeded", "failed", "interrupted"]),
    {
      label: msg("fields.status"),
      description: msg("fields.the_outcome_of_this_run_interrupted_means"),
    },
  ),
  node: field(z.string(), {
    label: msg("fields.node"),
    description: msg("fields.any_runs_once_on_an_available_node"),
  }),
  nextRun: field(z.string(), {
    label: msg("fields.next_run_utc"),
    description: msg("fields.the_next_matching_schedule_time_in_utc"),
  }),
  scheduled: field(z.string(), {
    label: msg("fields.scheduled_utc"),
    description: msg("fields.the_utc_occurrence_time_for_this_run"),
  }),
  started: field(z.string(), {
    label: msg("fields.started_utc"),
    description: msg("fields.when_this_run_started_executing_in_utc"),
  }),
  finished: field(z.string(), {
    label: msg("fields.finished_utc"),
    description: msg("fields.when_this_run_completed_in_utc_a"),
  }),
  arguments: field(z.string(), {
    label: msg("fields.inputs_json"),
    description: msg("fields.values_passed_to_the_program_in_order"),
  }),
  sandboxGroup: runtimeInfo.shape.sandboxGroup,
  enabled: field(z.boolean(), {
    label: msg("fields.enabled"),
    description: msg("fields.allow_this_schedule_to_create_new_runs"),
  }),
  datetimes: field(z.string(), {
    label: msg("fields.specific_datetimes_utc"),
    description: msg("fields.specific_utc_appointments_one_yyyy_mm_dd"),
  }),
  recurring: field(z.boolean(), {
    label: msg("fields.repeat"),
    description: msg("fields.add_a_recurring_pattern_alongside_any_specific"),
  }),
  startDate: field(z.string(), {
    label: msg("fields.start_date_utc"),
    description: msg("fields.the_first_utc_date_on_which_the"),
  }),
  monthIncluded: field(z.boolean(), {
    label: msg("fields.month_included"),
    description: msg("fields.include_this_month_in_the_recurring_pattern"),
  }),
  weekdayIncluded: field(z.boolean(), {
    label: msg("fields.weekday_included"),
    description: msg("fields.run_on_this_weekday_at_each_listed"),
  }),
  dayMode: field(z.enum(["weekdays", "dates"]), {
    label: msg("fields.choose_days_by"),
    description: msg("fields.choose_weekdays_such_as_monday_or_numbered"),
  }),
  dates: field(z.string(), {
    label: msg("admin.dates_of_month"),
    description: msg("fields.comma_separated_dates_from_1_through_31"),
  }),
  times: field(z.string(), {
    label: msg("fields.times_utc"),
    description: msg("fields.separate_24_hour_hh_mm_times_with"),
  }),
  executionId: field(z.string(), {
    label: msg("fields.execution_id"),
    description: msg("fields.the_kernel_job_execution_associated_with_this"),
  }),
  contextId: field(z.string(), {
    label: msg("fields.context_id"),
    description: msg("fields.the_execution_context_used_to_correlate_this"),
  }),
  failure: field(z.string(), {
    label: msg("fields.failure"),
    description: msg("fields.the_reported_reason_this_run_failed_or"),
  }),
  output: field(z.string(), {
    label: msg("fields.output_json"),
    description: msg("fields.the_program_result_as_json_pending_means"),
  }),
  capture: field(z.string(), {
    label: msg("fields.capture"),
    description: msg("fields.whether_the_stored_result_is_complete_or"),
    valueHelp: choiceHelp(z.string(), [
      msg("admin.complete"),
      msg("admin.output_exceeded_the_capture_limit"),
    ]),
  }),
});

export function nodeField(choices: readonly ValueHelpItem<string>[]) {
  return field(jobInfo.shape.node, {
    valueHelp: choiceHelp(jobInfo.shape.node, choices),
  });
}
