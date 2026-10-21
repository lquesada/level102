// Keeps a test run from hanging or leaving Chrome behind: wraps tests/lib/cdp.mjs launch() so every page call times
// out, every browser is closed on a crash / timeout / Ctrl-C, and the whole run has a watchdog.
import { launch as rawLaunch } from "../lib/cdp.mjs";
const open = new Set();
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout: " + what)), ms).unref())]);
async function bail(msg) {
  console.log("FAIL harness: " + String(msg).slice(0, 300));
  await Promise.all([...open].map(b => b.close().catch(() => {})));
  console.log("RESULT: harness FAILED"); process.exit(1);
}
process.on("uncaughtException", e => bail(e && e.stack || e));
process.on("unhandledRejection", e => bail(e && e.stack || e));
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => bail("stopped by " + sig));
export function watchdog(minutes) { setTimeout(() => bail("run took longer than " + minutes + " min"), minutes * 60000).unref(); }
export async function launch(opts) {
  const b = await withTimeout(rawLaunch(opts), 60000, "launch");
  const close = b.close; b.close = async () => { open.delete(b); await close(); };
  for (const k of ["ev", "send", "shot", "tap", "click", "key", "drag"]) { const f = b[k]; b[k] = (...a) => withTimeout(f(...a), 45000, k + " " + String(a[0]).slice(0, 80)); }
  open.add(b); return b;
}
