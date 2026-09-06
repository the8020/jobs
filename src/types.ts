export interface JobRecurrence {
  startDate: string;
  months: number[];
  dayMode: "dates" | "weekdays";
  dates: number[];
  weekdays: number[];
  times: string[];
}

export interface JobSchedule {
  datetimes: string[];
  recurrence: JobRecurrence | null;
}

export interface JobInput {
  name: string;
  programId: string;
  arguments: unknown[];
  username: string;
  sandboxGroup: string;
  /** "any", "all", or "node:<exact node ID>". */
  node: string;
  schedule: JobSchedule;
}

export interface JobDefinition {
  id: string;
  input: JobInput;
  enabled: boolean;
  revision: number;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaveJobInput {
  id: string;
  revision: number;
  enabled: boolean;
  input: JobInput;
}

export interface JobSummary {
  id: string;
  name: string;
  programId: string;
  username: string;
  node: string;
  enabled: boolean;
  nextRunAt: string | null;
}

export interface JobRunSummary {
  id: string;
  scheduleId: string;
  occurrenceId: string;
  name: string;
  programId: string;
  username: string;
  targetNode: string;
  nodeId: string;
  state: "queued" | "running" | "succeeded" | "failed" | "interrupted";
  scheduledAt: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface JobRun extends JobRunSummary {
  input: JobInput;
  executionId: string;
  sandboxId: string;
  workerId: string;
  contextId: string;
  parentContextId: string;
  logPosition: string;
  packageCommit: string;
  result: unknown;
  failure: string;
  truncated: boolean;
}

export interface JobPage<T> {
  items: T[];
  hasMore: boolean;
}
