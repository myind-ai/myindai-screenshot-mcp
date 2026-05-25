#!/usr/bin/env node
// v0.5 smoke — exercises every NEW tool added in 0.5 (and the new resources).
// Sets ANTHROPIC_API_KEY="" by default so vision tools take their fallback
// branch and can be exercised without burning tokens. Pass --with-vision to
// flip them on (will then require a real ANTHROPIC_API_KEY in env).
//
// Usage:
//   tsx scripts/v0.5-smoke.ts [inputImage] [outputDir] [--with-vision]
//
// Default fixtures (resolve from repo root):
//   inputImage = ../img/kaabil_screenshot/01_practice_home_streak_skills.png
//   outputDir  = ../appscreen-output/v0.5-smoke

import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SERVER = path.resolve(__dirname, "..", "dist", "server.js");

interface JsonRpc {
  jsonrpc: "2.0";
  id: number;
  result?: any;
  error?: { code: number; message: string };
}

const argv = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const WITH_VISION = flags.has("--with-vision");

const FIXTURES_DIR = path.join(REPO_ROOT, "img", "kaabil_screenshot");
const DEFAULT_OUT = path.join(REPO_ROOT, "appscreen-output", "v0.5-smoke");

const inputImage =
  argv[0] ||
  path.join(FIXTURES_DIR, "01_practice_home_streak_skills.png");
const outputDir = argv[1] || DEFAULT_OUT;

// Pick 4 distinct screens for set tools. Falls back to repeating the input
// image if any aren't present.
async function pickFour(): Promise<string[]> {
  const want = [
    "01_practice_home_streak_skills.png",
    "07_home_ats_scores_skill_match.png",
    "08_practice_quiz_mcq_docker.png",
    "13_interview_prep_questions_star.png",
  ];
  const out: string[] = [];
  for (const f of want) {
    const p = path.join(FIXTURES_DIR, f);
    try {
      await fs.access(p);
      out.push(p);
    } catch {
      out.push(inputImage);
    }
  }
  return out;
}

// Pick a paywall-ish screen for empty-state detector.
async function pickPaywall(): Promise<string> {
  const p = path.join(FIXTURES_DIR, "20_paywall_3_plans_pricing.png");
  try {
    await fs.access(p);
    return p;
  } catch {
    return inputImage;
  }
}

function startServer() {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (!WITH_VISION) env.ANTHROPIC_API_KEY = "";
  // Sandbox memory + telemetry into a tmp dir so the smoke is repeatable.
  const tmp = path.join(os.tmpdir(), "appscreen-v0.5-smoke", String(Date.now()));
  env.APPSCREEN_MEMORY_DIR = path.join(tmp, "memory");
  env.APPSCREEN_TELEMETRY_DIR = path.join(tmp, "telemetry");

  const proc = spawn("node", [SERVER], {
    stdio: ["pipe", "pipe", "inherit"],
    env,
  });
  let buf = "";
  const pending = new Map<number, (r: JsonRpc) => void>();
  proc.stdout.on("data", (chunk: Buffer) => {
    buf += chunk.toString("utf8");
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as JsonRpc;
        const cb = pending.get(msg.id);
        if (cb) {
          pending.delete(msg.id);
          cb(msg);
        }
      } catch {
        /* ignore */
      }
    }
  });
  let nextId = 1;
  function call(method: string, params: any) {
    return new Promise<JsonRpc>((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }
  return {
    call,
    close: () => {
      proc.stdin.end();
      proc.kill();
    },
    sandboxDir: tmp,
  };
}

interface CaseResult {
  name: string;
  status: "pass" | "fail" | "skip";
  detail: string;
  ms?: number;
}
const results: CaseResult[] = [];

async function run<T>(
  name: string,
  fn: () => Promise<{ detail: string }>,
  opts: { skip?: boolean; skipReason?: string } = {}
) {
  if (opts.skip) {
    results.push({ name, status: "skip", detail: opts.skipReason || "" });
    console.error(`[skip] ${name} — ${opts.skipReason || ""}`);
    return;
  }
  const t = Date.now();
  try {
    const { detail } = await fn();
    const ms = Date.now() - t;
    results.push({ name, status: "pass", detail, ms });
    console.error(`[pass] ${name} (${ms}ms) — ${detail}`);
  } catch (err: any) {
    const ms = Date.now() - t;
    const detail = err?.message || String(err);
    results.push({ name, status: "fail", detail, ms });
    console.error(`[FAIL] ${name} (${ms}ms) — ${detail}`);
  }
}

function unwrap(rpc: JsonRpc, label: string) {
  if (rpc.error) throw new Error(`${label} JSON-RPC error: ${rpc.error.message}`);
  if (rpc.result?.isError) {
    throw new Error(`${label} tool error: ${rpc.result.content?.[0]?.text || "unknown"}`);
  }
  return rpc.result;
}

async function main() {
  console.error(`[v0.5-smoke] starting`);
  console.error(`[v0.5-smoke] input image: ${inputImage}`);
  console.error(`[v0.5-smoke] output dir : ${outputDir}`);
  console.error(`[v0.5-smoke] vision     : ${WITH_VISION ? "ON (real Anthropic calls)" : "OFF (fallback paths)"}`);

  await fs.mkdir(outputDir, { recursive: true });

  const client = startServer();
  console.error(`[v0.5-smoke] sandbox: ${client.sandboxDir}`);

  await client.call("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "v0.5-smoke", version: "0.0.1" },
  });

  // ---------- 0. resources sanity ----------
  await run("resources/list includes new entries", async () => {
    const r = unwrap(await client.call("resources/list", {}), "resources/list");
    const uris = (r.resources || []).map((x: any) => x.uri);
    if (!uris.includes("appscreen://assets")) throw new Error("missing appscreen://assets");
    if (!uris.includes("appscreen://memory")) throw new Error("missing appscreen://memory");
    return { detail: `uris=[${uris.join(", ")}]` };
  });

  await run("resource appscreen://assets reads", async () => {
    const r = unwrap(await client.call("resources/read", { uri: "appscreen://assets" }), "read");
    const body = r.contents[0].text as string;
    if (!body.includes("blob-soft")) throw new Error("expected blob-soft in catalog");
    return { detail: `${body.length} chars` };
  });

  await run("resource appscreen://memory reads (empty)", async () => {
    const r = unwrap(await client.call("resources/read", { uri: "appscreen://memory" }), "read");
    const body = JSON.parse(r.contents[0].text);
    if (!Array.isArray(body.namespaces)) throw new Error("expected namespaces array");
    return { detail: `namespaces=${body.namespaces.length}` };
  });

  // ---------- 1. tools/list — every new tool registered ----------
  let registeredNames: string[] = [];
  await run("tools/list registers all v0.5 tools", async () => {
    const r = unwrap(await client.call("tools/list", {}), "tools/list");
    registeredNames = (r.tools || []).map((t: any) => t.name);
    const expected = [
      "render_multi_size",
      "render_ab_variants",
      "render_play_store_set",
      "render_localized_set",
      "detect_empty_state",
      "suggest_headlines",
      "clone_reference",
      "memory_read",
      "memory_write",
      "record_telemetry",
      "list_telemetry",
      "list_assets",
      "get_asset",
    ];
    const missing = expected.filter((e) => !registeredNames.includes(e));
    if (missing.length) throw new Error(`missing tools: ${missing.join(", ")}`);
    return { detail: `${registeredNames.length} total tools, all 13 v0.5 tools present` };
  });

  // ---------- 2. memory_read / memory_write ----------
  await run("memory_write { key, value }", async () => {
    const r = unwrap(
      await client.call("tools/call", {
        name: "memory_write",
        arguments: { namespace: "smoke", key: "verb_choice", value: "TRACK" },
      }),
      "memory_write"
    );
    const out = JSON.parse(r.content[0].text);
    if (!out.keys.includes("verb_choice")) throw new Error("verb_choice not persisted");
    return { detail: `keys=${JSON.stringify(out.keys)} path=${out.store_path}` };
  });

  await run("memory_write { patch }", async () => {
    const r = unwrap(
      await client.call("tools/call", {
        name: "memory_write",
        arguments: {
          namespace: "smoke",
          patch: { brand_color: "#7c3aed", domain: "productivity", count: 4 },
        },
      }),
      "memory_write patch"
    );
    const out = JSON.parse(r.content[0].text);
    for (const k of ["brand_color", "domain", "count"]) {
      if (!out.keys.includes(k)) throw new Error(`patch key ${k} missing`);
    }
    return { detail: `keys=${JSON.stringify(out.keys)}` };
  });

  await run("memory_read full + key", async () => {
    const all = unwrap(
      await client.call("tools/call", {
        name: "memory_read",
        arguments: { namespace: "smoke" },
      }),
      "memory_read"
    );
    const allOut = JSON.parse(all.content[0].text);
    if (!allOut.exists) throw new Error("expected exists=true after writes");
    const one = unwrap(
      await client.call("tools/call", {
        name: "memory_read",
        arguments: { namespace: "smoke", key: "brand_color" },
      }),
      "memory_read key"
    );
    const oneOut = JSON.parse(one.content[0].text);
    if (oneOut.value !== "#7c3aed") throw new Error(`unexpected value: ${oneOut.value}`);
    return { detail: `full keys=${allOut.keys.length}, key brand_color=${oneOut.value}` };
  });

  await run("memory_write delete", async () => {
    const r = unwrap(
      await client.call("tools/call", {
        name: "memory_write",
        arguments: { namespace: "smoke", key: "count", delete: true },
      }),
      "memory_write delete"
    );
    const out = JSON.parse(r.content[0].text);
    if (!out.deleted.includes("count")) throw new Error("count not deleted");
    if (out.keys.includes("count")) throw new Error("count still present");
    return { detail: `deleted=${JSON.stringify(out.deleted)}` };
  });

  // ---------- 3. record_telemetry / list_telemetry ----------
  await run("record_telemetry shipped entry", async () => {
    const r = unwrap(
      await client.call("tools/call", {
        name: "record_telemetry",
        arguments: {
          app_id: "com.smoke.test",
          template: "render_aso_set",
          brand_color: "#7c3aed",
          headlines: ["TRACK CARD PRICES"],
          set_size: 4,
          output_device: "iphone-6.9",
          language: "en",
          domain: "productivity",
        },
      }),
      "record_telemetry shipped"
    );
    const out = JSON.parse(r.content[0].text);
    if (out.entry_index !== 0) throw new Error(`expected entry_index 0, got ${out.entry_index}`);
    return { detail: `path=${out.log_path}` };
  });

  await run("record_telemetry outcome entry", async () => {
    const r = unwrap(
      await client.call("tools/call", {
        name: "record_telemetry",
        arguments: {
          app_id: "com.smoke.test",
          impressions: 1000,
          installs: 47,
          conversion_rate: 0.047,
          notes: "first week",
        },
      }),
      "record_telemetry outcome"
    );
    const out = JSON.parse(r.content[0].text);
    if (out.entry_index !== 1) throw new Error(`expected entry_index 1, got ${out.entry_index}`);
    return { detail: `entry_index=${out.entry_index}` };
  });

  await run("list_telemetry returns both + best_conversion", async () => {
    const r = unwrap(
      await client.call("tools/call", {
        name: "list_telemetry",
        arguments: { app_id: "com.smoke.test" },
      }),
      "list_telemetry"
    );
    const out = JSON.parse(r.content[0].text);
    if (out.count !== 2) throw new Error(`expected 2 entries, got ${out.count}`);
    if (!out.best_conversion || out.best_conversion.conversion_rate !== 0.047) {
      throw new Error("best_conversion missing or wrong");
    }
    return { detail: `count=${out.count}, best_cr=${out.best_conversion.conversion_rate}` };
  });

  // ---------- 4. list_assets / get_asset ----------
  await run("list_assets returns full catalog", async () => {
    const r = unwrap(await client.call("tools/call", { name: "list_assets", arguments: {} }), "list_assets");
    const out = JSON.parse(r.content[0].text);
    if (out.count < 8) throw new Error(`expected ≥8 assets, got ${out.count}`);
    return { detail: `count=${out.count}` };
  });

  await run("list_assets filtered by category", async () => {
    const r = unwrap(
      await client.call("tools/call", {
        name: "list_assets",
        arguments: { category: "decoration" },
      }),
      "list_assets cat"
    );
    const out = JSON.parse(r.content[0].text);
    if (out.count < 1) throw new Error("expected ≥1 decoration asset");
    if (out.assets.some((a: any) => a.category !== "decoration"))
      throw new Error("category filter leaked other types");
    return { detail: `decoration count=${out.count}` };
  });

  await run("get_asset (svg + tint)", async () => {
    const r = unwrap(
      await client.call("tools/call", {
        name: "get_asset",
        arguments: { id: "blob-soft", tint_color: "#e94691", format: "svg" },
      }),
      "get_asset"
    );
    const out = JSON.parse(r.content[0].text);
    if (!out.data.includes("#e94691")) throw new Error("tint not substituted");
    if (out.data.includes("currentColor")) throw new Error("currentColor not replaced");
    return { detail: `name=${out.name} svg_len=${out.data.length}` };
  });

  await run("get_asset (data-url default)", async () => {
    const r = unwrap(
      await client.call("tools/call", {
        name: "get_asset",
        arguments: { id: "dotted-grid" },
      }),
      "get_asset data-url"
    );
    const out = JSON.parse(r.content[0].text);
    if (!out.data.startsWith("data:image/svg+xml;base64,")) throw new Error("not a data URL");
    return { detail: `data-url len=${out.data.length}` };
  });

  await run("get_asset rejects unknown id", async () => {
    const r = await client.call("tools/call", {
      name: "get_asset",
      arguments: { id: "definitely-not-a-real-asset" },
    });
    if (!r.result?.isError) throw new Error("expected isError for unknown asset");
    return { detail: "unknown id rejected as expected" };
  });

  // ---------- 5. detect_empty_state — fallback path (no API key) ----------
  await run(
    WITH_VISION ? "detect_empty_state (real vision)" : "detect_empty_state (fallback path)",
    async () => {
      const paywall = await pickPaywall();
      const r = unwrap(
        await client.call("tools/call", {
          name: "detect_empty_state",
          arguments: { image: [inputImage, paywall], strictness: "normal" },
        }),
        "detect_empty_state"
      );
      const out = JSON.parse(r.content[0].text);
      if (out.count !== 2) throw new Error(`expected 2 verdicts, got ${out.count}`);
      // In fallback mode every screen is 'ok'. With vision, the paywall should
      // be flagged — but we don't fail the smoke if the model returns something
      // unexpected; we only check the contract.
      for (const v of out.verdicts) {
        if (typeof v.verdict !== "string") throw new Error("verdict missing");
      }
      return { detail: `verdicts=${out.verdicts.map((v: any) => v.verdict).join(",")}` };
    }
  );

  // ---------- 6. suggest_headlines — fallback path (no API key) ----------
  await run(
    WITH_VISION ? "suggest_headlines (real vision)" : "suggest_headlines (fallback path)",
    async () => {
      const r = unwrap(
        await client.call("tools/call", {
          name: "suggest_headlines",
          arguments: {
            image: inputImage,
            app_name: "Kaabil",
            app_description: "AI-powered career prep",
            domain: "productivity",
            count: 3,
          },
        }),
        "suggest_headlines"
      );
      const out = JSON.parse(r.content[0].text);
      // Without vision: count=0 + screen_summary mentions API key.
      // With vision: count up to 3 with real verbs.
      if (!WITH_VISION) {
        if (out.count !== 0) throw new Error(`expected 0 in fallback, got ${out.count}`);
      } else {
        if (out.suggestions.length === 0) throw new Error("vision returned no suggestions");
      }
      return { detail: `count=${out.count}, summary='${(out.screen_summary || "").slice(0, 40)}'` };
    }
  );

  // ---------- 7. clone_reference — fallback path keeps deterministic palette ----------
  await run(
    WITH_VISION ? "clone_reference (real vision)" : "clone_reference (palette-only fallback)",
    async () => {
      const r = unwrap(
        await client.call("tools/call", {
          name: "clone_reference",
          arguments: { reference_image: inputImage },
        }),
        "clone_reference"
      );
      const out = JSON.parse(r.content[0].text);
      if (!Array.isArray(out.palette) || out.palette.length === 0) throw new Error("no palette");
      if (!out.extraction || !out.extraction.gradient_stops) throw new Error("no extraction");
      if (!out.render_spec) throw new Error("no render_spec");
      return {
        detail: `palette=${out.palette.length}, stops=${out.extraction.gradient_stops.length}`,
      };
    }
  );

  // ---------- 8. render_aso_set baseline (proves the renderer actually boots) ----------
  // Skipped if the user passed --skip-render or we can't ensure 4 distinct images.
  const four = await pickFour();
  const baselineDir = path.join(outputDir, "baseline");

  await run("render_aso_set baseline (4 screenshots)", async () => {
    const r = unwrap(
      await client.call("tools/call", {
        name: "render_aso_set",
        arguments: {
          benefits: [
            { image: four[0], verb: "TRACK", descriptor: "STREAK & SKILLS" },
            { image: four[1], verb: "SCORE", descriptor: "ATS MATCH" },
            { image: four[2], verb: "PRACTICE", descriptor: "TECH MCQs" },
            { image: four[3], verb: "PREP", descriptor: "INTERVIEW STAR" },
          ],
          output_dir: baselineDir,
          brand_color: "#7c3aed",
          showcase: true,
          showcase_caption: "v0.5 baseline",
        },
      }),
      "render_aso_set"
    );
    const out = JSON.parse(r.content[0].text);
    if (out.screenshots.length !== 4) throw new Error(`expected 4 outputs, got ${out.screenshots.length}`);
    for (const s of out.screenshots) {
      const stat = await fs.stat(s.output_path).catch(() => null);
      if (!stat || stat.size < 5000) throw new Error(`output ${s.output_path} missing/too small`);
    }
    return { detail: `wrote ${out.screenshots.length} png + showcase` };
  });

  // ---------- 9. render_multi_size — only 6.9 + 5.5 to keep smoke fast ----------
  await run("render_multi_size (6.9 + 5.5)", async () => {
    const r = unwrap(
      await client.call("tools/call", {
        name: "render_multi_size",
        arguments: {
          benefits: [
            { image: four[0], verb: "TRACK", descriptor: "STREAK & SKILLS" },
            { image: four[1], verb: "SCORE", descriptor: "ATS MATCH" },
          ],
          output_root: path.join(outputDir, "multi-size"),
          sizes: ["iphone-6.9", "iphone-5.5"],
          brand_color: "#7c3aed",
          showcase: false,
        },
      }),
      "render_multi_size"
    );
    const out = JSON.parse(r.content[0].text);
    if (out.per_size.length !== 2) throw new Error(`expected 2 sizes, got ${out.per_size.length}`);
    return {
      detail: `sizes=${out.per_size.map((p: any) => p.device).join(",")}`,
    };
  });

  // ---------- 10. render_ab_variants — 2 variants, no contact sheet to keep smoke fast ----------
  await run("render_ab_variants (2 variants)", async () => {
    const r = unwrap(
      await client.call("tools/call", {
        name: "render_ab_variants",
        arguments: {
          benefits: [
            { image: four[0], verb: "TRACK", descriptor: "STREAK & SKILLS" },
            { image: four[1], verb: "SCORE", descriptor: "ATS MATCH" },
          ],
          output_root: path.join(outputDir, "variants"),
          variants: [
            { hex: "#7c3aed", name: "Violet" },
            { hex: "#e94691", name: "Pink" },
          ],
          contact_sheet: true,
        },
      }),
      "render_ab_variants"
    );
    const out = JSON.parse(r.content[0].text);
    if (out.variants.length !== 2) throw new Error(`expected 2 variants, got ${out.variants.length}`);
    if (!out.contact_sheet_path) throw new Error("contact sheet missing");
    return { detail: `variants=${out.variants.map((v: any) => v.variant_name).join(",")}` };
  });

  // ---------- 11. render_play_store_set ----------
  await run("render_play_store_set (android-phone)", async () => {
    const r = unwrap(
      await client.call("tools/call", {
        name: "render_play_store_set",
        arguments: {
          benefits: [
            { image: four[0], verb: "TRACK", descriptor: "STREAK & SKILLS" },
            { image: four[1], verb: "SCORE", descriptor: "ATS MATCH" },
          ],
          output_dir: path.join(outputDir, "play-store"),
          brand_color: "#7c3aed",
          showcase: false,
        },
      }),
      "render_play_store_set"
    );
    const out = JSON.parse(r.content[0].text);
    if (out.screenshots.length !== 2) throw new Error(`expected 2 outputs, got ${out.screenshots.length}`);
    if (out.output_device !== "android-phone") throw new Error("wrong output device");
    return { detail: `device=${out.output_device}, n=${out.screenshots.length}` };
  });

  // ---------- 12. render_localized_set — only 'en' so we don't need vision ----------
  await run("render_localized_set (en only — no translation needed)", async () => {
    const r = unwrap(
      await client.call("tools/call", {
        name: "render_localized_set",
        arguments: {
          benefits: [
            { image: four[0], verb: "TRACK", descriptor: "STREAK & SKILLS" },
            { image: four[1], verb: "SCORE", descriptor: "ATS MATCH" },
          ],
          output_root: path.join(outputDir, "localized"),
          languages: ["en"],
          brand_color: "#7c3aed",
          showcase: false,
        },
      }),
      "render_localized_set"
    );
    const out = JSON.parse(r.content[0].text);
    if (out.per_language.length !== 1) throw new Error("expected 1 language");
    if (out.per_language[0].language !== "en") throw new Error("wrong lang");
    return { detail: `langs=${out.per_language.map((p: any) => p.language).join(",")}` };
  });

  // ---------- summary ----------
  client.close();

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skip").length;

  console.error(``);
  console.error(`==== v0.5 smoke summary ====`);
  console.error(`pass:    ${passed}`);
  console.error(`fail:    ${failed}`);
  console.error(`skip:    ${skipped}`);
  console.error(`total:   ${results.length}`);
  if (failed > 0) {
    console.error(``);
    console.error(`FAILURES:`);
    for (const r of results.filter((x) => x.status === "fail")) {
      console.error(`  - ${r.name}: ${r.detail}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[v0.5-smoke] fatal:`, err);
  process.exit(1);
});
