// Run against a disposable, initialized instance with the jobs package active.
// The test account defaults to robot / jobs-prototype-password.
const flags = new Map(Deno.args.map((value) => {
  const at = value.indexOf("=");
  return [value.slice(2, at), value.slice(at + 1)];
}));
const base = flags.get("url") ?? "http://127.0.0.1:18880";
const executable = flags.get("browser");
if (!executable) throw new Error("--browser=/path/to/chromium is required");
const artifacts = flags.get("artifacts") ?? "/tmp/8020-jobs-browser";
await Deno.mkdir(artifacts, { recursive: true });
const profile = await Deno.makeTempDir({ prefix: "jobs-browser-" });
const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
const port = (listener.addr as Deno.NetAddr).port;
listener.close();
const browser = new Deno.Command(executable, {
  args: [
    "--headless",
    "--no-sandbox",
    "--no-zygote",
    "--single-process",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  stdout: "null",
  stderr: "null",
}).spawn();

class Page {
  #sequence = 0;
  #pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  readonly errors: string[] = [];
  constructor(readonly socket: WebSocket) {
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.method === "Runtime.exceptionThrown") {
        this.errors.push(JSON.stringify(message.params));
      }
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    };
  }
  command<T = Record<string, unknown>>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    const id = ++this.#sequence;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate<T>(expression: string): Promise<T> {
    const result = await this.command<
      { result: { value: T; description?: string }; exceptionDetails?: unknown }
    >("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.result.description ?? "browser evaluation failed");
    }
    return result.result.value;
  }
  async wait(expression: string, description: string, timeout = 30000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await this.evaluate<boolean>(expression)) return;
      await delay(100);
    }
    throw new Error(
      `Timed out: ${description}. ${await this.evaluate<string>(
        "document.body.innerText",
      )}`,
    );
  }
  async screen(title: string) {
    await this.wait(
      `document.querySelector('.screen > h1.screen-title')?.textContent?.trim() === ${
        JSON.stringify(title)
      }`,
      title,
    );
  }
  async set(bind: string, value: string | boolean) {
    await this.evaluate(
      `(() => {const control=document.querySelector(${
        JSON.stringify(`[data-bind="${bind}"]`)
      }); if(!control)throw new Error('missing control ${bind}'); ${
        typeof value === "boolean"
          ? `control.checked=${value}`
          : `control.value=${JSON.stringify(value)}`
      }; control.dispatchEvent(new Event('input',{bubbles:true}));control.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
    await this.wait(
      `[...document.querySelectorAll('.screen')].filter((screen)=>screen.getClientRects().length>0).every((screen)=>!screen.inert)`,
      `updated ${bind}`,
    );
  }
  async button(label: string) {
    await this.evaluate(
      `(() => {const button=[...document.querySelectorAll('button')].find((item)=>item.textContent?.trim()===${
        JSON.stringify(label)
      } || item.getAttribute('aria-label')===${
        JSON.stringify(label)
      });if(!button)throw new Error('missing button ${label}');button.click();})()`,
    );
  }
  async row(text: string) {
    await this.evaluate(
      `(() => {const row=[...document.querySelectorAll('.data-list tbody tr')].find((item)=>item.textContent.includes(${
        JSON.stringify(text)
      }));if(!row)throw new Error('missing row');row.click();})()`,
    );
  }
  async screenshot(name: string) {
    const result = await this.command<{ data: string }>(
      "Page.captureScreenshot",
      { format: "png", captureBeyondViewport: true },
    );
    await Deno.writeFile(
      `${artifacts}/${name}.png`,
      Uint8Array.from(atob(result.data), (value) => value.charCodeAt(0)),
    );
  }
}

let page: Page | undefined;
try {
  for (let i = 0; i < 200; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      await response.body?.cancel();
      if (response.ok) break;
    } catch { /* Browser is still starting. */ }
    await delay(50);
  }
  const target = await (await fetch(
    `http://127.0.0.1:${port}/json/new?${
      encodeURIComponent(base + "/the8020/uui/shell/")
    }`,
    { method: "PUT" },
  )).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve();
    socket.onerror = () => reject(new Error("browser connection failed"));
  });
  page = new Page(socket);
  await page.command("Runtime.enable");
  await page.command("Page.enable");
  await page.command("Emulation.setDeviceMetricsOverride", {
    width: 1360,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.wait(
    `document.querySelector('input[name="username"]') !== null`,
    "login",
  );
  await page.evaluate(
    `document.querySelector('input[name="username"]').value=${
      JSON.stringify(flags.get("username") ?? "robot")
    };document.querySelector('input[name="password"]').value=${
      JSON.stringify(
        Deno.env.get("THE8020_JOBS_TEST_PASSWORD") ?? "jobs-prototype-password",
      )
    };document.querySelector('button[type="submit"]').click();`,
  );
  await page.screen("Welcome to 80|20");
  await page.row("the8020/jobs/jobs");
  await page.screen("Jobs");
  await page.button("Run program");
  await page.screen("Run program");
  await page.button("Advanced");
  await page.screen("Advanced job settings");
  await page.button("Edit Node: field help");
  await page.screen("Node");
  const choices = await page.evaluate<string[]>(
    `[...document.querySelectorAll('[data-layout-id="choices"] tbody tr[data-row-index]')].map(row => row.cells[0].textContent.trim())`,
  );
  assert(
    choices[0] === "Any" && choices[1] === "All" && choices.length >= 3,
    "node help order",
  );
  const exactNode = `node:${choices[2]}`;
  await page.row("Any");
  await page.screen("Advanced job settings");
  await page.set("sandboxGroup", "browser-jobs");
  await page.button("Done");
  await page.screen("Run program");
  await page.set("name", "Browser manual");
  await page.set("programId", "the8020/jobs/echo");
  await page.set("arguments", '[ {"message":"browser job"}, 42 ]');
  await page.button("Run");
  await page.screen("Run Browser manual");
  await refreshUntil(
    page,
    `document.querySelector('[data-bind="state"]')?.value === 'succeeded'`,
  );
  const output = await page.evaluate<string>(
    `document.querySelector('[data-bind="output"]').value`,
  );
  assert(
    output.includes('"message": "browser job"') &&
      output.includes('"username": "robot"'),
    "captured result and execution user",
  );
  await page.button("Logs");
  await page.screen("Logs · Browser manual");
  assert(
    await page.evaluate<boolean>(
      `document.querySelector('[data-bind="logs"]').value.includes('Job finished')`,
    ),
    "captured logs",
  );
  await page.button("Back");
  await page.screen("Run Browser manual");
  await page.screenshot("manual-run");
  await page.button("Back");
  await page.screen("Jobs");

  await page.button("Run program");
  await page.screen("Run program");
  await page.set("name", "Browser exact node");
  await page.set("programId", "the8020/jobs/echo");
  await page.set("arguments", '["exact node"]');
  await page.button("Advanced");
  await page.screen("Advanced job settings");
  await page.set("node", exactNode);
  await page.button("Done");
  await page.screen("Run program");
  await page.button("Run");
  await page.screen("Run Browser exact node");
  await refreshUntil(
    page,
    `document.querySelector('[data-bind="state"]')?.value === 'succeeded'`,
  );
  await page.button("Advanced");
  await page.screen("Advanced · Browser exact node");
  assert(
    await page.evaluate<string>(
      `document.querySelector('[data-bind="node"]').value`,
    ) === exactNode.slice(5),
    "exact node execution",
  );
  await page.button("Back");
  await page.screen("Run Browser exact node");
  await page.button("Back");
  await page.screen("Jobs");

  await page.button("New schedule");
  await page.screen("New schedule");
  await page.set("name", "Browser schedule");
  await page.set("programId", "the8020/jobs/echo");
  await page.set("arguments", '["scheduled"]');
  const first = new Date(Date.now() + 25000),
    second = new Date(Date.now() + 40000);
  await page.set(
    "datetimes",
    `${first.toISOString()}\n${second.toISOString()}`,
  );
  await page.set("recurring", true);
  await page.button("Advanced");
  await page.screen("Advanced job settings");
  await page.set("node", "all");
  await page.wait(
    `document.querySelector('[data-bind="months.m12"]') !== null`,
    "month checkboxes",
  );
  assert(
    await page.evaluate<boolean>(
      `[...document.querySelectorAll('input[data-bind^="months."]')].length === 12 && [...document.querySelectorAll('input[data-bind^="months."]')].every((item)=>item.checked)`,
    ),
    "all months default on",
  );
  await page.button("Done");
  await page.screen("New schedule");
  assert(
    await page.evaluate<boolean>(
      `document.querySelector('[data-bind="weekdays.d1"]') !== null`,
    ),
    "weekday selection",
  );
  await page.set(
    "startDate",
    new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  );
  await page.set("dayMode", "dates");
  await page.wait(
    `document.querySelector('[data-bind="dates"]') !== null`,
    "month dates",
  );
  await page.set("dates", "1, 15, 31");
  await page.set("times", "09:00, 14:30");
  await page.button("Advanced");
  await page.screen("Advanced job settings");
  for (const month of [1, 2, 3, 4, 5, 6, 7, 8, 10, 11]) {
    await page.set(`months.m${month}`, false);
  }
  await page.button("Done");
  await page.screen("New schedule");
  await page.screenshot("schedule-editor");
  await page.command("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 900,
    deviceScaleFactor: 1,
    mobile: true,
  });
  assert(
    await page.evaluate<boolean>(
      "document.documentElement.scrollWidth <= innerWidth",
    ),
    "mobile viewport fits",
  );
  await page.screenshot("schedule-mobile");
  await page.command("Emulation.setDeviceMetricsOverride", {
    width: 1360,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.button("Save");
  await page.screen("Job Browser schedule");
  await page.button("Back");
  await page.screen("Jobs");
  await page.row("Browser schedule");
  await page.screen("Job Browser schedule");
  assert(
    await page.evaluate<boolean>(
      `document.querySelector('[data-bind="node"]').value === 'all' && document.querySelector('[data-bind="dates"]').value === '1, 15, 31'`,
    ),
    "saved schedule round-trip",
  );
  await page.button("Run history");
  await page.screen("Run history");
  const copies = choices.length - 2;
  await refreshUntil(
    page,
    `[...document.querySelectorAll('.data-list tbody tr')].filter((row)=>row.textContent.includes('succeeded')).length >= ${
      copies * 2
    }`,
    155000,
  );
  await page.screenshot("scheduled-runs");
  await page.button("Back");
  await page.screen("Job Browser schedule");
  await page.set("enabled", false);
  await page.button("Save");
  await delay(300);
  await page.button("Back");
  await page.screen("Jobs");
  await page.screenshot("jobs-list");
  assert(
    page.errors.length === 0,
    `browser exceptions: ${page.errors.join("\n")}`,
  );
  console.log(
    JSON.stringify({
      manual: true,
      exactNode: true,
      scheduledOccurrences: 2,
      copiesPerOccurrence: copies,
      history: true,
      artifacts,
    }),
  );
} catch (error) {
  if (page) await page.screenshot("failure").catch(() => {});
  throw error;
} finally {
  page?.socket.close();
  try {
    browser.kill("SIGTERM");
  } catch { /* Browser has exited. */ }
  await browser.status;
  await Deno.remove(profile, { recursive: true });
}

async function refreshUntil(page: Page, expression: string, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.evaluate<boolean>(expression)) return;
    await page.button("Refresh");
    await delay(500);
  }
  throw new Error(
    `Runs did not finish: ${await page.evaluate<string>(
      "document.body.innerText",
    )}`,
  );
}
function assert(value: boolean, message: string): asserts value {
  if (!value) throw new Error(message);
}
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
