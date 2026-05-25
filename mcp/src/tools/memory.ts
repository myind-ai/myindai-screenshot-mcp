import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { z } from "zod";

// First-class skill memory I/O. Replaces the "Claude has to remember to write
// the right markdown file" failure mode with a typed JSON store accessible via
// MCP tools and resources. Stored in the user-level XDG-style location:
//
//   ~/.myindai-screenshot-mcp/memory/<namespace>.json
//
// `namespace` defaults to a project key derived from the cwd so multiple apps
// don't stomp on each other's state.

function defaultStoreDir(): string {
  const env = process.env.MCP_MEMORY_DIR;
  if (env && env.trim()) return path.resolve(env);
  return path.join(os.homedir(), ".myindai-screenshot-mcp", "memory");
}

function defaultNamespace(): string {
  const slug = path
    .basename(process.cwd())
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "default";
}

function safeNamespace(ns: string): string {
  const cleaned = ns.replace(/[^a-zA-Z0-9._-]/g, "-");
  if (!cleaned) throw new Error("namespace must contain at least one [A-Za-z0-9._-] character");
  return cleaned;
}

async function readStore(namespace: string): Promise<Record<string, unknown>> {
  const file = path.join(defaultStoreDir(), `${safeNamespace(namespace)}.json`);
  try {
    const raw = await fs.readFile(file, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (err: any) {
    if (err?.code === "ENOENT") return {};
    throw err;
  }
}

async function writeStore(namespace: string, data: Record<string, unknown>): Promise<string> {
  const dir = defaultStoreDir();
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${safeNamespace(namespace)}.json`);
  await fs.writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf-8");
  return file;
}

// ---------- memory_read ----------

export const MemoryReadInputSchema = z.object({
  namespace: z.string().default("").optional(),
  key: z.string().optional(),
});

export type MemoryReadInput = z.infer<typeof MemoryReadInputSchema>;

export interface MemoryReadResult {
  namespace: string;
  store_path: string;
  exists: boolean;
  // When `key` is omitted, the full record. Otherwise just that one entry.
  value: unknown;
  keys: string[];
}

export async function memoryRead(input: MemoryReadInput): Promise<MemoryReadResult> {
  const ns = (input.namespace || "").trim() || defaultNamespace();
  const data = await readStore(ns);
  const file = path.join(defaultStoreDir(), `${safeNamespace(ns)}.json`);
  const exists = Object.keys(data).length > 0;
  const keys = Object.keys(data).sort();
  if (input.key) {
    return { namespace: ns, store_path: file, exists, value: data[input.key] ?? null, keys };
  }
  return { namespace: ns, store_path: file, exists, value: data, keys };
}

// ---------- memory_write ----------

export const MemoryWriteInputSchema = z
  .object({
    namespace: z.string().default("").optional(),
    key: z.string().optional(),
    value: z.unknown().optional(),
    // Bulk patch — merged shallowly into the namespace store. Useful for
    // saving a whole workflow state in one call.
    patch: z.record(z.string(), z.unknown()).optional(),
    // When true and `key` is set, deletes the entry. Ignored if `value` provided.
    delete: z.boolean().default(false).optional(),
  })
  .refine(
    (v) => v.key !== undefined || v.patch !== undefined,
    "either `key` (with `value` or `delete:true`) or `patch` must be provided"
  );

export type MemoryWriteInput = z.infer<typeof MemoryWriteInputSchema>;

export interface MemoryWriteResult {
  namespace: string;
  store_path: string;
  keys: string[];
  written: string[];
  deleted: string[];
}

export async function memoryWrite(input: MemoryWriteInput): Promise<MemoryWriteResult> {
  const ns = (input.namespace || "").trim() || defaultNamespace();
  const data = await readStore(ns);
  const written: string[] = [];
  const deleted: string[] = [];

  if (input.patch) {
    for (const [k, v] of Object.entries(input.patch)) {
      data[k] = v;
      written.push(k);
    }
  }
  if (input.key) {
    if (input.delete) {
      if (Object.prototype.hasOwnProperty.call(data, input.key)) {
        delete data[input.key];
        deleted.push(input.key);
      }
    } else {
      data[input.key] = input.value;
      written.push(input.key);
    }
  }

  const file = await writeStore(ns, data);
  return {
    namespace: ns,
    store_path: file,
    keys: Object.keys(data).sort(),
    written,
    deleted,
  };
}

// ---------- listing helper for the MCP resource ----------

export async function listMemoryNamespaces(): Promise<{ namespace: string; size: number; modified: string }[]> {
  const dir = defaultStoreDir();
  try {
    const files = await fs.readdir(dir);
    const out: { namespace: string; size: number; modified: string }[] = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const stat = await fs.stat(path.join(dir, f));
      out.push({
        namespace: f.slice(0, -5),
        size: stat.size,
        modified: stat.mtime.toISOString(),
      });
    }
    return out.sort((a, b) => a.namespace.localeCompare(b.namespace));
  } catch (err: any) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
}
