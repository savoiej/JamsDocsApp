/**
 * Netline was built on the claude.ai artifact runtime (window.claude.use("db" | "user" | "downloads" | "assets")).
 * This bridge gives it the same interface, backed by Supabase:
 *   db        → public.documents (one JSON document per path), live through Realtime
 *   user      → the signed-in person and public.profiles (admins are the "owner")
 *   assets    → the private "assets" Storage bucket, served at /_blob/<id>
 *   downloads → a normal browser download
 * Capabilities that only exist on claude.ai (the AI assistant, connectors) return null, and the app hides them.
 */
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/supabase/server";

type Data = Record<string, unknown>;
type Row = { path: string; collection: string; doc_id: string; data: Data };
type DbError = { code: string; message: string };
type Meta = { fromCache: boolean; hasPendingWrites: boolean };

const META: Meta = { fromCache: false, hasPendingWrites: false };
type DocSnap = { id: string; exists: boolean; metadata: Meta; data: () => Data | undefined };
type Unsub = () => void;
type DocRef = {
  id: string;
  path: string;
  get(): Promise<DocSnap>;
  set(data: Data): Promise<void>;
  update(data: Data): Promise<void>;
  delete(): Promise<void>;
  acquire(): Promise<{ acquired: boolean; holder: string }>;
  onSnapshot(next: (s: DocSnap) => void, onError?: (e: DbError) => void): Unsub;
  collection(sub: string): unknown;
};
const clean = (p: string) => String(p || "").replace(/^\/+|\/+$/g, "");
const parentOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const lastOf = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const clone = <T,>(v: T): T => (v == null ? v : (JSON.parse(JSON.stringify(v)) as T));
const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 20);

function asError(e: unknown): DbError {
  const err = e as { code?: string; message?: string };
  const code = err?.code === "42501" || /row-level security|permission/i.test(err?.message || "") ? "not_granted" : "unavailable";
  return { code, message: err?.message || "Request failed" };
}

function stripDeletes(data: Data, base?: Data): Data {
  const out: Data = base ? { ...base } : {};
  for (const [k, v] of Object.entries(data || {})) {
    if (v && typeof v === "object" && (v as Data).__delete__ === true) delete out[k];
    else out[k] = v;
  }
  return out;
}

function getField(d: Data, field: string): unknown {
  return field.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Data)[k] : undefined), d);
}

function compare(a: unknown, op: string, b: unknown): boolean {
  switch (op) {
    case "==": case "eq": return a === b;
    case "!=": case "ne": return a !== b;
    case "<": case "lt": return (a as number) < (b as number);
    case "<=": case "lte": return (a as number) <= (b as number);
    case ">": case "gt": return (a as number) > (b as number);
    case ">=": case "gte": return (a as number) >= (b as number);
    case "in": return Array.isArray(b) && b.includes(a);
    case "not-in": return Array.isArray(b) && !b.includes(a);
    case "array-contains": return Array.isArray(a) && a.includes(b);
    default: return true;
  }
}

export function createBridge(profile: Profile, opts: { ns?: string } = {}) {
  /* A namespace keeps one app's documents apart from another's in the shared table (JamsOS lives under "jamsos/"). */
  const ns = clean(opts.ns || "");
  const P = (p: string) => (!ns || p === ns || p.startsWith(ns + "/") ? p : `${ns}/${p}`);
  const supabase = createClient();
  const listeners = new Set<{ match: (path: string, collection: string) => boolean; fire: () => void }>();

  // One Realtime channel for every open view; listeners refetch what they show.
  supabase
    .channel("jamsnet-documents")
    .on("postgres_changes", { event: "*", schema: "public", table: "documents" }, (payload: RealtimePostgresChangesPayload<Row>) => {
      const row = (payload.new && "path" in payload.new ? payload.new : payload.old) as Partial<Row>;
      if (row?.path) notify(row.path, row.collection ?? parentOf(row.path));
    })
    .subscribe();

  function notify(path: string, collection: string) {
    listeners.forEach((l) => {
      if (l.match(path, collection)) l.fire();
    });
  }

  function listen(match: (path: string, collection: string) => boolean, run: () => Promise<void>) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const entry = {
      match,
      fire: () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void run(), 120);
      },
    };
    listeners.add(entry);
    void run();
    return () => {
      listeners.delete(entry);
      if (timer) clearTimeout(timer);
    };
  }

  function docSnap(path: string, row: Row | null): DocSnap {
    return { id: lastOf(path), exists: !!row, metadata: META, data: () => (row ? clone(row.data) : undefined) };
  }

  /* ---------- documents ---------- */
  function doc(rawPath: string): DocRef {
    const path = P(clean(rawPath));
    const ref: DocRef = {
      id: lastOf(path),
      path,
      async get() {
        const { data, error } = await supabase.from("documents").select("path,collection,doc_id,data").eq("path", path).maybeSingle();
        if (error) throw asError(error);
        return docSnap(path, data as Row | null);
      },
      async set(data: Data) {
        const { error } = await supabase
          .from("documents")
          .upsert({ path, collection: parentOf(path), doc_id: lastOf(path), data: stripDeletes(clone(data)) });
        if (error) throw asError(error);
        notify(path, parentOf(path));
      },
      async update(data: Data) {
        const cur = await ref.get();
        if (!cur.exists) throw { code: "invalid_argument", message: "No document to update" } as DbError;
        await ref.set(stripDeletes(clone(data), cur.data() as Data));
      },
      async delete() {
        const { error } = await supabase.from("documents").delete().eq("path", path);
        if (error) throw asError(error);
        notify(path, parentOf(path));
      },
      async acquire() {
        return { acquired: true, holder: profile.id };
      },
      onSnapshot(next: (s: DocSnap) => void, onError?: (e: DbError) => void) {
        return listen(
          (p) => p === path,
          async () => {
            try {
              next(await ref.get());
            } catch (e) {
              onError?.(e as DbError);
            }
          },
        );
      },
      collection(sub: string) {
        return collection(`${path}/${clean(sub)}`);
      },
    };
    return ref;
  }

  /* ---------- collections and queries ---------- */
  type Q = { path: string; where: [string, string, unknown][]; order: [string, "asc" | "desc"] | null; limit: number | null };

  async function runQuery(q: Q) {
    const rows: Row[] = [];
    const page = 1000;
    for (let from = 0; from < 20000; from += page) {
      const { data, error } = await supabase
        .from("documents")
        .select("path,collection,doc_id,data")
        .eq("collection", q.path)
        .order("path")
        .range(from, from + page - 1);
      if (error) throw asError(error);
      rows.push(...((data as Row[]) ?? []));
      if (!data || data.length < page) break;
    }
    let list = rows.filter((r) => q.where.every(([f, op, v]) => compare(getField(r.data, f), op, v)));
    if (q.order) {
      const [f, dir] = q.order;
      const s = dir === "desc" ? -1 : 1;
      list = list.sort((a, b) => {
        const x = getField(a.data, f) as never, y = getField(b.data, f) as never;
        return x === y ? 0 : x == null ? 1 : y == null ? -1 : x < y ? -s : s;
      });
    }
    if (q.limit != null) list = list.slice(0, q.limit);
    return list;
  }

  function querySnap(list: Row[], prev: Map<string, Row> | null) {
    const docs = list.map((r) => docSnap(r.path, r));
    const changes = () => {
      const out: { type: "added" | "modified" | "removed"; doc: DocSnap; oldIndex: number; newIndex: number }[] = [];
      const now = new Map(list.map((r) => [r.path, r]));
      list.forEach((r, i) => {
        const was = prev?.get(r.path);
        if (!was) out.push({ type: "added", doc: docs[i], oldIndex: -1, newIndex: i });
        else if (JSON.stringify(was.data) !== JSON.stringify(r.data)) out.push({ type: "modified", doc: docs[i], oldIndex: i, newIndex: i });
      });
      prev?.forEach((r, p) => {
        if (!now.has(p)) out.push({ type: "removed", doc: docSnap(p, r), oldIndex: 0, newIndex: -1 });
      });
      return out;
    };
    return { docs, size: docs.length, empty: !docs.length, metadata: META, docChanges: changes };
  }

  function query(q: Q) {
    return {
      where(field: string, op: string, value: unknown) {
        return query({ ...q, where: [...q.where, [field, op, value]] });
      },
      orderBy(field: string, dir: "asc" | "desc" = "asc") {
        return query({ ...q, order: [field, dir] });
      },
      limit(n: number) {
        return query({ ...q, limit: n });
      },
      async get() {
        return querySnap(await runQuery(q), null);
      },
      onSnapshot(next: (s: ReturnType<typeof querySnap>) => void, onError?: (e: DbError) => void) {
        let prev: Map<string, Row> | null = null;
        return listen(
          (_p, c) => c === q.path,
          async () => {
            try {
              const list = await runQuery(q);
              const snap = querySnap(list, prev);
              prev = new Map(list.map((r) => [r.path, r]));
              next(snap);
            } catch (e) {
              onError?.(e as DbError);
            }
          },
        );
      },
    };
  }

  function collection(rawPath: string) {
    const path = P(clean(rawPath));
    return {
      ...query({ path, where: [], order: null, limit: null }),
      path,
      doc(id?: string) {
        return doc(`${path}/${id ? clean(id) : newId()}`);
      },
      async add(data: Data) {
        const ref = doc(`${path}/${newId()}`);
        await ref.set(data);
        return ref;
      },
    };
  }

  const db = { doc, collection };

  /* ---------- who is signed in ---------- */
  const admin = profile.role === "admin" && profile.active;
  const user = {
    async id() {
      return profile.id;
    },
    async me() {
      return { id: profile.id, name: profile.full_name || "", email: profile.email || "", guest: false };
    },
    async isOwner() {
      return admin;
    },
    async canEdit() {
      return profile.active;
    },
    async can(name: string) {
      return name === "data.write" ? profile.active : null;
    },
    async profiles(ids: string[]) {
      const out: Record<string, { id: string; name: string; email: string; guest: boolean }> = {};
      if (!ids?.length) return out;
      const { data } = await supabase.from("profiles").select("id,full_name,email").in("id", ids);
      (data ?? []).forEach((p: { id: string; full_name: string | null; email: string | null }) => {
        out[p.id] = { id: p.id, name: p.full_name || "", email: p.email || "", guest: false };
      });
      return out;
    },
    async search(q: string) {
      const { data } = await supabase.from("profiles").select("id,full_name,email").ilike("full_name", `%${q || ""}%`).limit(20);
      return (data ?? []).map((p: { id: string; full_name: string | null; email: string | null }) => ({ id: p.id, name: p.full_name || "", email: p.email || "" }));
    },
  };

  /* ---------- files ---------- */
  const assets = {
    async upload(blob: Blob, opts?: { type?: string }) {
      const type = opts?.type || blob.type || "application/octet-stream";
      const ext = (type.split("/")[1] || "bin").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
      const id = `${newId()}.${ext}`;
      // re-wrap: the file may come from the app's frame (another window)
      const file = new Blob([blob], { type });
      const { error } = await supabase.storage.from("assets").upload(id, file, { contentType: type, upsert: false });
      if (error) throw asError(error);
      return { id, url: `/_blob/${id}`, sizeBytes: blob.size, contentType: type };
    },
    async list() {
      const { data, error } = await supabase.storage.from("assets").list("", { limit: 1000 });
      if (error) throw asError(error);
      const items = (data ?? []).map((f) => ({ id: f.name, url: `/_blob/${f.name}`, sizeBytes: (f.metadata?.size as number) || 0, contentType: (f.metadata?.mimetype as string) || "" }));
      return { assets: items, usage: { bytes: items.reduce((s, a) => s + a.sizeBytes, 0) } };
    },
    async delete(id: string) {
      const { error } = await supabase.storage.from("assets").remove([id]);
      if (error) throw asError(error);
      return { deleted: true };
    },
  };

  /* ---------- downloads ---------- */
  const downloads = {
    async save({ filename, data }: { filename: string; data: Blob | string }) {
      const isBlob = typeof data === "object" && data !== null && typeof (data as Blob).arrayBuffer === "function";
      const blob = isBlob ? new Blob([data as Blob]) : new Blob([String(data)]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "download";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      return { saved: true };
    },
  };

  const caps: Record<string, unknown> = { db, user, assets, downloads };
  return {
    use(name: string) {
      return Promise.resolve(caps[name] ?? null);
    },
  };
}
