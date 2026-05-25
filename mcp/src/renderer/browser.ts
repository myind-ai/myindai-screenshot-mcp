import { chromium, type Browser, type Page } from "playwright";
import { INDEX_HTML_URL, IDLE_SHUTDOWN_MS } from "../config.js";

let browser: Browser | null = null;
let page: Page | null = null;
let idleTimer: NodeJS.Timeout | null = null;
let inFlight = 0;

async function ensureBrowser(): Promise<Browser> {
  if (browser && browser.isConnected()) return browser;
  browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-web-security",
      "--allow-file-access-from-files",
      "--use-gl=swiftshader",
    ],
  });
  return browser;
}

async function bootPage(b: Browser): Promise<Page> {
  const ctx = await b.newContext({
    viewport: { width: 1400, height: 1600 },
    deviceScaleFactor: 1,
  });
  const p = await ctx.newPage();

  p.on("pageerror", (err) => {
    process.stderr.write(`[page error] ${err.message}\n`);
  });
  p.on("console", (msg) => {
    const t = msg.type();
    const text = msg.text();
    if (text.includes("[mcp-debug]")) {
      process.stderr.write(`[page ${t}] ${text}\n`);
    } else if (t === "error") {
      process.stderr.write(`[page console.error] ${text}\n`);
    }
  });

  await p.goto(INDEX_HTML_URL, { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => !!(window as any).__mcp, undefined, {
    timeout: 30_000,
  });
  await p.evaluate(() => (window as any).__mcp.ready);
  if (process.env.MCP_DEBUG === "1") {
    await p.evaluate(() => { (window as any).__mcp_debug = true; });
  }
  return p;
}

async function ensurePage(): Promise<Page> {
  const b = await ensureBrowser();
  if (page && !page.isClosed()) return page;
  page = await bootPage(b);
  return page;
}

export async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  cancelIdleShutdown();
  inFlight++;
  try {
    const p = await ensurePage();
    return await fn(p);
  } finally {
    inFlight--;
    scheduleIdleShutdown();
  }
}

/**
 * Spawn N additional warm pages on the SAME browser instance, run fn in
 * parallel across all of them, and clean them up. The primary page is
 * untouched (so callers using withPage stay isolated). Used by the video
 * pipeline to render frames concurrently — each page renders a slice of
 * the timeline.
 *
 * Note: the pages share a Chromium process, so contention shows up at GPU
 * decode + JS execution. ~4 pages is the sweet spot on a typical M-series Mac;
 * beyond that returns diminish.
 */
export async function withConcurrentPages<T>(
  count: number,
  fn: (pages: Page[]) => Promise<T>
): Promise<T> {
  cancelIdleShutdown();
  inFlight++;
  const b = await ensureBrowser();
  const n = Math.max(1, Math.min(count, 8));
  const pages: Page[] = [];
  try {
    // Reuse the primary page if available, then spin up the rest.
    if (page && !page.isClosed()) pages.push(page);
    while (pages.length < n) pages.push(await bootPage(b));
    return await fn(pages);
  } finally {
    // Close every page EXCEPT the primary so the next withPage call stays warm.
    for (const p of pages) {
      if (p === page) continue;
      try { await p.close(); } catch {}
    }
    inFlight--;
    scheduleIdleShutdown();
  }
}

function scheduleIdleShutdown() {
  if (inFlight > 0) return;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    void shutdown();
  }, IDLE_SHUTDOWN_MS);
}

function cancelIdleShutdown() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

export async function shutdown(): Promise<void> {
  cancelIdleShutdown();
  try {
    if (page && !page.isClosed()) await page.close();
  } catch {}
  try {
    if (browser && browser.isConnected()) await browser.close();
  } catch {}
  page = null;
  browser = null;
}

process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});
