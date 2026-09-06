import { DatabaseSync } from "node:sqlite";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  kernelDatabaseBackendSymbol,
  type KernelInvoke,
  kernelInvokeSymbol,
  newId,
  type ProgramRunInput,
} from "@the8020/kernel";
import { installContextProvider } from "../../kernel/defaults/config/runtime/deno/context/runtime.ts";

const globals = globalThis as unknown as Record<symbol, unknown>;
globals[kernelDatabaseBackendSymbol] = "sqlite";
const { descriptorOf } = await import("/p/the8020/db/mod.ts");
const tables = await Promise.all([
  import("../tables/schedules.ts"),
  import("../tables/runs.ts"),
  import("../tables/cursors.ts"),
]);

export class DatabaseFixture {
  readonly directory = Deno.makeTempDirSync({ prefix: "jobs-db-" });
  readonly path = this.directory + "/test.db";
  readonly database = new DatabaseSync(this.path);
  readonly calls: { node: string; input: ProgramRunInput }[] = [];
  readonly statements: string[] = [];
  readonly events: string[] = [];
  readonly nodes: { id: string; enabled: boolean }[] = [
    { id: "node-a", enabled: true },
    { id: "node-b", enabled: true },
    { id: "node-off", enabled: false },
  ];
  readonly scope = new AsyncLocalStorage<string>();
  readonly connections = new Map<string, DatabaseSync>();
  readonly restore: () => void;
  onRun?: (input: ProgramRunInput) => Promise<void>;
  fail = false;
  constructor() {
    this.database.exec("PRAGMA journal_mode=WAL");
    for (const module of tables) {
      const table = descriptorOf(module.default);
      const columns = table.columns.map((column) =>
        `"${column.name}" ${
          column.logical_type === "boolean" || column.logical_type === "integer"
            ? "INTEGER"
            : "TEXT"
        }${column.primary_key ? " PRIMARY KEY" : ""}`
      );
      this.database.exec(
        `CREATE TABLE "${table.table_id}" (${columns.join(",")})`,
      );
      for (const index of table.indexes) {
        this.database.exec(
          `CREATE ${
            index.unique ? "UNIQUE" : ""
          } INDEX "${index.name}" ON "${table.table_id}" (${
            index.columns.map((column) => `"${column}"`).join(",")
          })`,
        );
      }
    }
    this.database.exec(
      "CREATE TABLE the8020__users__users (username TEXT PRIMARY KEY, enabled INTEGER); INSERT INTO the8020__users__users VALUES ('robot',1),('disabled',0)",
    );
    this.restore = installContextProvider(() => ({
      authenticated: true,
      type: "program",
      id: "the8020/jobs/test",
      username: "robot",
      userId: "user:robot",
      nodeId: this.scope.getStore() ?? "node-a",

      sandboxId: "sandbox",
      workerId: "wrk-test",
      contextId: "ctx-0123456789",
    }));
    globals[kernelInvokeSymbol] = this.invoke;
  }
  as<T>(node: string, fn: () => Promise<T>): Promise<T> {
    return this.scope.run(node, fn);
  }
  close() {
    for (const conn of this.connections.values()) {
      conn.exec("ROLLBACK");
      conn.close();
    }
    this.database.close();
    this.restore();
    delete globals[kernelInvokeSymbol];
    Deno.removeSync(this.directory, { recursive: true });
  }
  readonly invoke: KernelInvoke = async (operation, args) => {
    if (operation === "database.transaction.begin") {
      const settings = args.settings as { lockTimeoutMs?: number };
      const conn = new DatabaseSync(this.path);
      conn.exec(`PRAGMA busy_timeout=${settings.lockTimeoutMs ?? 0}`);
      conn.exec("BEGIN");
      const transaction = crypto.randomUUID();
      this.connections.set(transaction, conn);
      return { transaction };
    }
    if (
      operation === "database.transaction.commit" ||
      operation === "database.transaction.rollback"
    ) {
      const token = String(args.transaction),
        conn = this.connections.get(token)!;
      conn.exec(operation.endsWith("commit") ? "COMMIT" : "ROLLBACK");
      conn.close();
      this.connections.delete(token);
      return {};
    }
    if (operation === "database.execute") {
      const conn = args.transaction
        ? this.connections.get(String(args.transaction))!
        : this.database;
      const text = String(args.statement);
      this.statements.push(text);
      const statement = conn.prepare(text);
      const parameters = (args.parameters as unknown[]).map((value) => {
        if (typeof value === "boolean") return Number(value);
        if (value !== null && typeof value === "object") {
          const tag = value as { type: string; value: unknown };
          if (tag.type === "json") return JSON.stringify(tag.value);
          if (tag.type === "datetime") return String(tag.value);
          if (tag.type === "bigint") return BigInt(String(tag.value));
        }
        return value as string | number | null;
      });
      if (args.return_rows) {
        const rows = statement.all(...parameters),
          columns = statement.columns().map((column) => column.name);
        return {
          columns,
          rows: rows.map((row) => columns.map((column) => row[column])),
        };
      }
      const result = statement.run(...parameters);
      return {
        columns: [],
        rows: [],
        affected_rows: { type: "bigint", value: String(result.changes) },
        ...(args.return_insert_id
          ? {
            insert_id: {
              type: "bigint",
              value: String(result.lastInsertRowid),
            },
          }
          : {}),
      };
    }
    const name = String(args.operation),
      input = args.input as Record<string, unknown>;
    let result: unknown;
    if (name === "program.list") {
      result = [{
        program_id: "the8020/jobs/echo",
        package_id: "the8020/jobs",
        name: "echo",
        commit: "commit",
        discoverable: false,
        uui: false,
        entrypoint: "program.ts",
        entrypoint_url:
          "file:///workspace/packages/the8020/jobs/programs/echo/program.ts",
      }];
    } else if (name === "node.list") {
      result = {
        nodes: this.nodes.map((node) => ({ node })),
        local_node_id: this.scope.getStore() ?? "node-a",
      };
    } else if (name === "event.emit") {
      this.events.push(String(input.name));
      result = { id: newId("evt"), listeners: 1 };
    } else if (name === "program.run") {
      const selected = input as unknown as ProgramRunInput;
      const node = this.scope.getStore() ?? "node-a";
      this.calls.push({ node, input: selected });
      await this.onRun?.(selected);
      result = {
        state: this.fail ? "failed" : "succeeded",
        failure: this.fail ? "Example failure" : "",
        executionId: newId("job"),
        nodeId: node,
        sandboxId: newId("sbx"),
        workerId: newId("wrk"),
        contextId: newId("ctx"),
        parentContextId: "ctx-0123456789",
        logPosition: "saved-position",
        queuedAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        packageCommit: "commit",
        result: {
          inputs: selected.arguments,
          username: selected.username,
          nodeId: node,
        },
      };
    } else throw new Error("Unexpected operation: " + name);
    return { success: true, result };
  };
}
