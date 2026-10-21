// Shared headless-Chrome helper for the minigame tests (DevTools protocol, no npm packages).
// Needs Node 22+ (built-in WebSocket) and Chrome/Chromium on PATH, or CHROME=/path/to/chrome.
import { spawn, execSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const pageUrl = game => "file://" + join(ROOT, "docs", game, "index.html");
export const shotsDir = game => { const d = join(ROOT, "scratch", "screenshots", game); mkdirSync(d, { recursive: true }); return d; };

export function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  for (const c of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) { try { execSync("command -v " + c, { stdio: "ignore" }); return c; } catch {} }
  throw new Error("Chrome/Chromium not found: set CHROME=/path/to/chrome");
}

// Opens `url` at the given size. touch=true emulates a phone/tablet (touch events, coarse pointer).
// lang='de-DE' (etc.) makes the browser report that OS language before the page loads; storage starts empty.
// Returns helpers; collects console errors, exceptions and every non-local network request.
export async function launch({ url, width, height, touch = false, lang = "en-US" }) {
  // port 0: Chrome picks a free port and writes it to DevToolsActivePort (parallel runs never attach to each other)
  const prof = mkdtempSync(join(tmpdir(), "l102-"));
  const ch = spawn(findChrome(), ["--headless=new", "--remote-debugging-port=0", "--user-data-dir=" + prof, "--no-first-run",
    "--no-default-browser-check", "--disable-gpu", "--mute-audio", "--lang=" + lang, "about:blank"], { stdio: "ignore" });
  let info; for (let i = 0; i < 60; i++) { try { const port = readFileSync(join(prof, "DevToolsActivePort"), "utf8").split("\n")[0].trim();
      info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { await sleep(200); } }
  if (!info) throw new Error("Chrome did not start");
  const ws = new WebSocket(info.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map(), errors = [], requests = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map(a => a.value ?? a.description).join(" "));
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error") errors.push(m.params.entry.text);
    if (m.method === "Network.requestWillBeSent") { const u = m.params.request.url; if (!/^(file|data|blob):/.test(u)) requests.push(u); }
  };
  const raw = (method, params = {}, sessionId) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  const { result: { targetId } } = await raw("Target.createTarget", { url: "about:blank" });
  const sid = (await raw("Target.attachToTarget", { targetId, flatten: true })).result.sessionId;
  const send = (m, p) => raw(m, p, sid);
  for (const m of ["Runtime.enable", "Log.enable", "Page.enable", "Network.enable"]) await send(m);
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: touch });
  if (touch) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  const ua = (await raw("Browser.getVersion")).result.userAgent.replace("HeadlessChrome", "Chrome");
  await send("Emulation.setUserAgentOverride", { userAgent: ua, acceptLanguage: lang + "," + lang.slice(0, 2) });
  await send("Emulation.setLocaleOverride", { locale: lang });
  await send("Page.navigate", { url }); await sleep(1000);

  const ev = async x => {
    const m = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true });
    if (m.result.exceptionDetails) throw new Error(m.result.exceptionDetails.exception?.description || m.result.exceptionDetails.text);
    return m.result.result.value;
  };
  const key = async (code, keyName = code, hold = 0) => {
    await send("Input.dispatchKeyEvent", { type: "keyDown", code, key: keyName });
    if (hold) await sleep(hold);
    await send("Input.dispatchKeyEvent", { type: "keyUp", code, key: keyName });
  };
  const click = async (x, y, hold = 0) => {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    if (hold) await sleep(hold);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  };
  const tap = async (x, y, hold = 60) => {
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
    await sleep(hold);
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  // drag one finger from (x,y) by (dx,dy) and hold it there for `hold` ms
  const drag = async (x, y, dx, dy, hold = 600) => {
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 2 }] });
    for (let i = 1; i <= 6; i++) { await sleep(16); await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + dx * i / 6, y: y + dy * i / 6, id: 2 }] }); }
    await sleep(hold);
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  const shot = async file => {   // retries: a capture taken mid-navigation returns no data
    for (let i = 0; i < 10; i++) { const { result } = await send("Page.captureScreenshot", { format: "png" }); if (result?.data) return writeFileSync(file, Buffer.from(result.data, "base64")); await sleep(150); }
    throw new Error("screenshot failed: " + file);
  };
  const close = async () => { try { ws.close(); } catch {} ch.kill("SIGTERM"); await sleep(300); try { rmSync(prof, { recursive: true, force: true }); } catch {} };
  return { ev, key, click, tap, drag, shot, send, close, errors, requests };
}

// tiny pass/fail counter
export function checker() {
  let pass = 0, fail = 0;
  const ok = (name, cond, extra = "") => { if (cond) pass++; else fail++; console.log((cond ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : "")); };
  return { ok, summary: () => { console.log(fail ? `RESULT: ${fail} FAILED, ${pass} passed` : `RESULT: ALL ${pass} PASSED`); return fail; } };
}
