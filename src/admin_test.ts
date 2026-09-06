import type { JobRun } from "./types.ts";
import { AsyncLocalStorage } from "node:async_hooks";
import { assertEquals, assertRejects } from "@std/assert";
import {
  formatLogRecord,
  kernelDatabaseBackendSymbol,
  type KernelInvoke,
  kernelInvokeSymbol,
  type LogPage,
  type LogRecord,
} from "@the8020/kernel";
import {
  BACK_EVENT,
  ProgramExecutionError,
  type ScreenSnapshot,
  UUI_PROTOCOL_VERSION,
  type UUIClientMessage,
} from "/p/the8020/uui/mod.ts";
import { bindSession } from "../../uui/session.ts";
import { installContextProvider } from "../../kernel/defaults/config/runtime/deno/context/runtime.ts";

(globalThis as unknown as Record<symbol, unknown>)[
  kernelDatabaseBackendSymbol
] = "sqlite";
const { editJob, jobs, runProgram } = await import("./admin.ts");
const { jobStore } = await import("./store.ts");

// Each fixture starts outside the presentation contexts of earlier sessions.
const rootContext = AsyncLocalStorage.snapshot();
function test(name: string, run: () => Promise<void>) {
  Deno.test(name, () => rootContext(run));
}

class Channel {
  readonly sessionId = "jobs-test";
  readonly screens: ScreenSnapshot[] = [];
  readonly messages: unknown[] = [];
  #receivers: Array<(message: UUIClientMessage) => void> = [];
  #messages: UUIClientMessage[] = [];
  #surfaces = new WeakMap<ScreenSnapshot, string>();
  #sequence = 0;
  send(message: unknown) {
    this.messages.push(message);
    const value = message as {
      type?: string;
      presentation?: {
        surfaces: { surfaceId: string; screen: ScreenSnapshot }[];
      };
    };
    if (value.type === "presentation.show") {
      const surface = value.presentation!.surfaces.at(-1)!;
      const screen = surface.screen;
      this.#surfaces.set(screen, surface.surfaceId);
      const previous = this.screens.at(-1);
      if (
        screen.id !== previous?.id || screen.revision !== previous?.revision
      ) this.screens.push(screen);
    }
  }
  receive(): Promise<UUIClientMessage> {
    const message = this.#messages.shift();
    if (message) return Promise.resolve(message);
    return new Promise((resolve) => this.#receivers.push(resolve));
  }
  push(
    screen: ScreenSnapshot,
    action: string,
    changes: { bind: string; value: unknown }[] = [],
  ) {
    const message: UUIClientMessage = {
      type: "screen.event",
      protocol: UUI_PROTOCOL_VERSION,
      sessionId: this.sessionId,
      surfaceId: this.#surfaces.get(screen)!,
      screenId: screen.id,
      instanceId: screen.state.instanceId,
      screenState: {
        version: screen.state.version,
        scroll: screen.state.scroll,
        elements: {},
      },
      screenRevision: screen.revision,
      clientSequence: ++this.#sequence,
      action,
      eventType: action === BACK_EVENT ? BACK_EVENT : "action",
      changes,
    };
    const receive = this.#receivers.shift();
    if (receive) receive(message);
    else this.#messages.push(message);
  }
  async screen(count: number, id?: string) {
    for (let i = 0; i < 500; i++) {
      const screen = this.screens.slice(count - 1).find((screen) =>
        id === undefined || screen.id === id
      );
      if (screen) return screen;
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    throw new Error(`screen ${count} not shown`);
  }
}

const run: JobRun = {
  id: "run-1",
  scheduleId: "",
  occurrenceId: "occ-1",
  name: "Example",
  programId: "the8020/jobs/echo",
  username: "robot",
  targetNode: "any",
  nodeId: "nod-aaaaaaaaaa",
  state: "succeeded",
  scheduledAt: "2026-09-04T12:00:00Z",
  createdAt: "2026-09-04T12:00:00Z",
  startedAt: "2026-09-04T12:00:00Z",
  finishedAt: "2026-09-04T12:00:01Z",
  input: {
    name: "Example",
    programId: "the8020/jobs/echo",
    username: "robot",
    arguments: [{ value: 42 }],
    node: "any",
    sandboxGroup: "batch",
    schedule: { datetimes: [], recurrence: null },
  },
  executionId: "job-0123456789",
  sandboxId: "sbx-0123456789",
  workerId: "wrk-0123456789",
  contextId: "ctx-0123456789",
  parentContextId: "ctx-abcdefghij",
  logPosition: "saved-position",
  packageCommit: "abc",
  result: { value: 42 },
  failure: "",
  truncated: false,
};

const runLog: LogRecord = {
  time: "2026-09-04T12:00:00.500Z",
  level: "INFO",
  source: "deno",
  component: "worker",
  node_id: run.nodeId,
  sandbox_id: run.sandboxId,
  worker_id: run.workerId,
  context_id: run.contextId,
  job_id: run.executionId,
  username: run.username,
  object: "program:" + run.programId,
  message: "Completed",
  segment: "segment",
  offset: 0,
};

test("manual screen selects execution options and opens captured output", async () => {
  let logState: LogPage["state"] = "ok";
  const calls: { operation: string; input: Record<string, unknown> }[] = [];
  const originalSubmit = jobStore.submit,
    originalInspect = jobStore.runs.inspect;
  jobStore.submit = (input) => {
    calls.push({ operation: "jobs.submit", input: { ...input } });
    return Promise.resolve([run]);
  };
  jobStore.runs.inspect = (id) => {
    calls.push({ operation: "jobs.runs.inspect", input: { id } });
    return Promise.resolve(run);
  };
  (globalThis as unknown as Record<symbol, unknown>)[kernelInvokeSymbol] =
    ((operation, input) => {
      if (operation === "database.execute") {
        return Promise.resolve({
          columns: ["username", "enabled"],
          rows: [["robot", true]],
        });
      }
      const name = String(input.operation),
        args = input.input as Record<string, unknown>;
      calls.push({ operation: name, input: args });
      const values: Record<string, unknown> = {
        "program.list": [{
          program_id: "the8020/jobs/echo",
          package_id: "the8020/jobs",
          name: "echo",
          commit: "abc",
          uui: false,
          discoverable: false,
          entrypoint: "program.ts",
          entrypoint_url:
            "file:///workspace/packages/the8020/jobs/programs/echo/program.ts",
          description: "Echo",
        }],
        "node.list": {
          nodes: [{ node: { id: "node-a", enabled: true } }],
          local_node_id: "node-a",
        },
        "jobs.submit": [run],
        "jobs.runs.inspect": run,
        "logs.query": {
          state: logState,
          records: logState === "ok"
            ? [{ ...runLog, message: args.cursor ? "Next page" : "Completed" }]
            : [],
          cursor: logState === "ok" ? "next" : undefined,
          more: logState === "ok",
          scanned_bytes: 100,
        },
      };
      if (!(name in values)) throw new Error(name);
      return Promise.resolve({ success: true, result: values[name] });
    }) satisfies KernelInvoke;
  const removeContext = installContextProvider(() => ({
    authenticated: true,
    type: "program",
    id: "the8020/jobs/jobs",
    username: "robot",
    userId: "user:robot",
    nodeId: "node-a",

    sandboxId: "sbx-test",
    workerId: "wrk-test",
    contextId: "ctx-0123456789",
  }));
  const channel = new Channel(), unbind = bindSession(channel);
  try {
    const pending = editJob(false);
    pending.catch(() => {});
    const screen = await channel.screen(1);
    assertEquals((screen.model as Record<string, unknown>).node, "any");
    const node = screen.controls.find((control) => control.bind === "node")!;
    assertEquals(node.options?.map((option) => option.label), [
      "Any",
      "All",
      "node-a",
    ]);
    channel.push(screen, "run", [
      { bind: "name", value: "Example" },
      { bind: "programId", value: "the8020/jobs/echo" },
      { bind: "arguments", value: '[{"value":42}]' },
      { bind: "sandboxGroup", value: "batch" },
    ]);
    const result = await channel.screen(2, "job-run");
    assertEquals(
      result.id,
      "job-run",
      JSON.stringify(
        channel.messages.filter((message) =>
          (message as { type: string }).type !== "presentation.show"
        ),
      ),
    );
    assertEquals(
      (result.model as Record<string, unknown>).output,
      JSON.stringify({ value: 42 }, null, 2),
    );
    assertEquals(
      (result.model as Record<string, unknown>).logs,
      formatLogRecord(runLog),
    );
    assertEquals(calls.find((call) => call.operation === "logs.query")!.input, {
      node_id: run.nodeId,
      job_id: run.executionId,
      context_id: run.contextId,
      from: run.createdAt,
      position: run.logPosition,
      limit: 100,
    });
    const submit = calls.find((call) => call.operation === "jobs.submit")!;
    assertEquals(submit.input, { ...run.input });
    const count = channel.screens.length;
    channel.push(result, "refresh");
    const refreshed = await channel.screen(count + 1, "job-run");
    channel.push(refreshed, "next-logs");
    const next = await channel.screen(count + 2, "job-run");
    const logCall = calls.filter((call) => call.operation === "logs.query").at(
      -1,
    )!;
    assertEquals(logCall.input.cursor, "next");
    assertEquals(logCall.input.position, undefined);
    assertEquals(
      (next.model as Record<string, unknown>).logs,
      formatLogRecord({ ...runLog, message: "Next page" }),
    );
    logState = "expired";
    channel.push(next, "refresh");
    const expired = await channel.screen(count + 3, "job-run");
    assertEquals(
      (expired.model as Record<string, unknown>).logs,
      "These logs have expired.",
    );
    assertEquals(
      (expired.model as Record<string, unknown>).output,
      JSON.stringify(run.result, null, 2),
    );
    logState = "unavailable";
    channel.push(expired, "refresh");
    const unavailable = await channel.screen(count + 4, "job-run");
    assertEquals(
      (unavailable.model as Record<string, unknown>).logs,
      "Logs are currently unavailable.",
    );
    assertEquals(
      (unavailable.model as Record<string, unknown>).state,
      "succeeded",
    );
    channel.push(unavailable, BACK_EVENT);
    await pending;
    assertEquals(
      calls.filter((call) => call.operation === "jobs.runs.inspect").length,
      5,
    );
  } finally {
    unbind();
    removeContext();
    jobStore.submit = originalSubmit;
    jobStore.runs.inspect = originalInspect;
    delete (globalThis as unknown as Record<symbol, unknown>)[
      kernelInvokeSymbol
    ];
  }
});

for (const failing of [false, true]) {
  test(`UUI execution ${failing ? "preserves standard program failures" : "uses positional inputs in the current session"}`, async () => {
    const root = await Deno.makeTempDir({ prefix: "jobs-uui-test-" });
    const directory = `${root}/example/testing/programs/interactive`;
    await Deno.mkdir(directory, { recursive: true });
    await Deno.writeTextFile(
      `${directory}/program.toml`,
      'schema = 1\ndescription = "Interactive"\nuui = true\n',
    );
    await Deno.writeTextFile(
      `${directory}/program.ts`,
      failing
        ? 'export default function() { throw new TypeError("Interactive failure"); }'
        : `import { callScreen, Model, z } from "/p/the8020/uui/mod.ts";
         export default async function(first: { message: string }, second: number, third: boolean) {
           await callScreen({ id: "interactive-inputs", schema: z.object({ message: z.string(), second: z.number(), third: z.boolean() }), model: new Model({ message: first.message, second, third }) });
         }`,
    );
    const globals = globalThis as unknown as Record<symbol, unknown>;
    globals[kernelInvokeSymbol] = ((operation, input) => {
      if (operation === "database.execute") {
        return Promise.resolve({
          columns: ["username", "enabled"],
          rows: [["robot", true]],
        });
      }
      const name = String(input.operation);
      if (name === "program.list") {
        return Promise.resolve({
          success: true,
          result: [{
            program_id: "example/testing/interactive",
            package_id: "example/testing",
            name: "interactive",
            description: "Interactive",
            commit: "abc",
            discoverable: false,
            uui: true,
            entrypoint: "program.ts",
            entrypoint_url: new URL(`file://${directory}/program.ts`).href,
          }],
        });
      }
      if (name === "node.list") {
        return Promise.resolve({
          success: true,
          result: { nodes: [], local_node_id: "node-a" },
        });
      }
      throw new Error(`UUI execution must not invoke ${name}`);
    }) satisfies KernelInvoke;
    const restore = installContextProvider(() => ({
      authenticated: true,
      type: "service",
      id: "the8020/uui/session",
      username: "robot",
      userId: "user:robot",
      nodeId: "node-a",

      sandboxId: "sbx-test",
      workerId: "wrk-test",
      contextId: "ctx-0123456789",
    }));
    const originalSubmit = jobStore.submit;
    jobStore.submit = () => {
      throw new Error("UUI programs must not be queued");
    };
    const channel = new Channel(), unbind = bindSession(channel);
    try {
      const pending = runProgram("example/testing/interactive", root);
      pending.catch(() => {});
      const editor = await channel.screen(1, "job-editor");
      assertEquals(
        (editor.model as Record<string, unknown>).programId,
        "example/testing/interactive",
      );
      assertEquals(
        editor.controls.filter((control) => !control.hidden).map((control) =>
          control.bind
        ).sort(),
        ["arguments", "programId"],
      );
      channel.push(editor, "run", [{
        bind: "arguments",
        value: '{"invalid":"array required"}',
      }]);
      const invalid = await channel.screen(
        channel.screens.length + 1,
        "job-editor",
      );
      assertEquals(invalid.state.instanceId, editor.state.instanceId);
      const rejection = failing
        ? assertRejects(
          () => pending,
          ProgramExecutionError,
          "Interactive failure",
        )
        : undefined;
      channel.push(invalid, "run", [{
        bind: "arguments",
        value: '[{"message":"Custom input"},42,false]',
      }]);
      if (failing) {
        const error = await rejection;
        assertEquals(error?.programId, "example/testing/interactive");
      } else {
        const child = await channel.screen(
          channel.screens.length + 1,
          "interactive-inputs",
        );
        assertEquals(child.model, {
          message: "Custom input",
          second: 42,
          third: false,
        });
        channel.push(child, BACK_EVENT);
        await pending;
      }
      assertEquals(
        channel.messages.some((message) =>
          (message as { type: string; message?: string }).message?.includes(
            "executed successfully",
          )
        ),
        false,
      );
    } finally {
      unbind();
      restore();
      jobStore.submit = originalSubmit;
      delete globals[kernelInvokeSymbol];
      await Deno.remove(root, { recursive: true });
    }
  });
}

test("Jobs list exposes manual, schedule, history, and refresh actions", async () => {
  const originalList = jobStore.list;
  jobStore.list = () => Promise.resolve({ items: [], hasMore: false });
  (globalThis as unknown as Record<symbol, unknown>)[kernelInvokeSymbol] =
    ((_operation, _input) =>
      Promise.resolve({
        success: true,
        result: { items: [], hasMore: false },
      })) satisfies KernelInvoke;
  const channel = new Channel(), unbind = bindSession(channel);
  try {
    const pending = jobs();
    const screen = await channel.screen(1);
    assertEquals(screen.header.actions.map((action) => action.id), [
      "run",
      "add",
      "history",
      "refresh",
    ]);
    channel.push(screen, BACK_EVENT);
    await pending;
  } finally {
    jobStore.list = originalList;
    unbind();
    delete (globalThis as unknown as Record<symbol, unknown>)[
      kernelInvokeSymbol
    ];
  }
});
