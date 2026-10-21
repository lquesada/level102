// Tiny DevTools-protocol helper: starts headless Chrome on a temporary profile and opens docs/drinkmixer/index.html.
// Needs: Node 22+ (built-in WebSocket) and Chrome/Chromium on PATH (google-chrome, chromium or chromium-browser),
// or set CHROME=/path/to/chrome.
import { spawn, execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const PAGE = "file://" + join(ROOT, "docs/drinkmixer/index.html");
const sleep = ms => new Promise(r => setTimeout(r, ms));
export function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  for (const c of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) { try { execSync("command -v " + c, { stdio: "ignore" }); return c; } catch {} }
  throw new Error("Chrome/Chromium not found: set CHROME=/path/to/chrome");
}
export async function launch({ width = 800, height = 800, mobile = false } = {}) {
  const port = 9400 + Math.floor(Math.random() * 500), prof = mkdtempSync(join(tmpdir(), "dmprof-"));
  const ch = spawn(findChrome(), ["--headless=new", "--remote-debugging-port=" + port, "--user-data-dir=" + prof, "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--mute-audio", "about:blank"], { stdio: "ignore" });
  let info; for (let i = 0; i < 60; i++) { try { info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { await sleep(200); } }
  const ws = new WebSocket(info.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map(), errors = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error") errors.push(m.params.entry.text); };
  const send = (method, params = {}, sessionId) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  const { result: { targetId } } = await send("Target.createTarget", { url: "about:blank" });
  const sid = (await send("Target.attachToTarget", { targetId, flatten: true })).result.sessionId;
  for (const m of ["Runtime.enable", "Log.enable", "Page.enable"]) await send(m, {}, sid);
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile }, sid);
  await send("Page.navigate", { url: PAGE }, sid); await sleep(900);
  const ev = async x => { const m = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }, sid);
    if (m.result.exceptionDetails) throw new Error(m.result.exceptionDetails.exception?.description || m.result.exceptionDetails.text); return m.result.result.value; };
  return { ev, errors, send: (m, p) => send(m, p, sid), close: async () => { try { ws.close(); } catch {} ch.kill("SIGTERM"); await sleep(400); try { rmSync(prof, { recursive: true, force: true }); } catch {} } };
}
