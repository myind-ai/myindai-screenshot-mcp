import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { z } from "zod";

// Conversion telemetry hooks. Records what shipped (template, brand colour,
// headline) so users can correlate App Store impressions → installs and learn
// what converts in their niche. Optional — opt-in via the tool, not background.
//
// Persistent JSONL log under ~/.appscreen-mcp/telemetry/<app_id>.jsonl

function defaultLogDir(): string {
  const env = process.env.APPSCREEN_TELEMETRY_DIR;
  if (env && env.trim()) return path.resolve(env);
  return path.join(os.homedir(), ".appscreen-mcp", "telemetry");
}

function safeAppId(id: string): string {
  const cleaned = id.replace(/[^a-zA-Z0-9._-]/g, "-");
  if (!cleaned) throw new Error("app_id must contain at least one [A-Za-z0-9._-] character");
  return cleaned;
}

// ---------- record_telemetry ----------

const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const RecordTelemetryInputSchema = z.object({
  app_id: z.string().min(1, "app_id required (e.g. 'com.kaabil.app' or 'remyind')"),
  // What shipped:
  template: z.string().optional(),
  brand_color: HexColor.optional(),
  headlines: z.array(z.string()).optional(),
  set_size: z.number().int().min(1).max(10).optional(),
  output_device: z.string().optional(),
  language: z.string().optional(),
  domain: z.string().optional(),
  // Outcomes (filled in later):
  impressions: z.number().int().min(0).optional(),
  installs: z.number().int().min(0).optional(),
  conversion_rate: z.number().min(0).max(1).optional(),
  notes: z.string().optional(),
  // Free-form metadata for whatever else the caller wants to track.
  extra: z.record(z.string(), z.unknown()).optional(),
});

export type RecordTelemetryInput = z.infer<typeof RecordTelemetryInputSchema>;

export interface RecordTelemetryResult {
  app_id: string;
  log_path: string;
  recorded_at: string;
  entry_index: number;
}

export async function recordTelemetry(input: RecordTelemetryInput): Promise<RecordTelemetryResult> {
  const dir = defaultLogDir();
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${safeAppId(input.app_id)}.jsonl`);

  const recordedAt = new Date().toISOString();
  const { app_id, ...payload } = input;
  const entry = { recorded_at: recordedAt, app_id, ...payload };

  let entryIndex = 0;
  try {
    const existing = await fs.readFile(file, "utf-8");
    entryIndex = existing.split("\n").filter((l) => l.trim()).length;
  } catch (err: any) {
    if (err?.code !== "ENOENT") throw err;
  }
  await fs.appendFile(file, JSON.stringify(entry) + "\n", "utf-8");

  return {
    app_id,
    log_path: file,
    recorded_at: recordedAt,
    entry_index: entryIndex,
  };
}

// ---------- list_telemetry ----------

export const ListTelemetryInputSchema = z.object({
  app_id: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(100).optional(),
});

export type ListTelemetryInput = z.infer<typeof ListTelemetryInputSchema>;

export interface TelemetryEntry {
  recorded_at: string;
  app_id: string;
  [k: string]: unknown;
}

export interface ListTelemetryResult {
  app_id?: string;
  log_dir: string;
  count: number;
  entries: TelemetryEntry[];
  best_conversion?: TelemetryEntry;
}

export async function listTelemetry(input: ListTelemetryInput): Promise<ListTelemetryResult> {
  const dir = defaultLogDir();
  const limit = input.limit ?? 100;
  let files: string[];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith(".jsonl"));
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      return { app_id: input.app_id, log_dir: dir, count: 0, entries: [] };
    }
    throw err;
  }

  if (input.app_id) {
    const target = `${safeAppId(input.app_id)}.jsonl`;
    files = files.filter((f) => f === target);
  }

  const entries: TelemetryEntry[] = [];
  for (const f of files) {
    const raw = await fs.readFile(path.join(dir, f), "utf-8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        entries.push(JSON.parse(trimmed));
      } catch {
        // skip malformed line
      }
    }
  }
  entries.sort((a, b) => String(b.recorded_at).localeCompare(String(a.recorded_at)));

  const withConv = entries.filter((e) => typeof e.conversion_rate === "number");
  const best =
    withConv.length > 0
      ? withConv.reduce((a, b) =>
          (a.conversion_rate as number) >= (b.conversion_rate as number) ? a : b
        )
      : undefined;

  return {
    app_id: input.app_id,
    log_dir: dir,
    count: entries.length,
    entries: entries.slice(0, limit),
    best_conversion: best,
  };
}
