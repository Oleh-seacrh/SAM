// app/tasks/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { TagBadge } from "@/components/ui/TagBadge";

// -------------------- types --------------------
type Column = {
  id: number;
  key: "todo" | "inprogress" | "done" | "blocked";
  title: string;
  wipLimit?: number | null;
  position: number;
};

type Task = {
  id: number;
  boardId: number;
  columnId: number;
  title: string;
  description?: string | null;
  owner?: string | null;
  priority: "Low" | "Normal" | "High" | "Urgent";
  status: "Todo" | "In Progress" | "Done" | "Blocked";
  assignees?: string[] | null;
  tags?: string[] | null;
  progress: number;
  startAt?: string | number | null; // ISO | epoch | null
  dueAt?: string | number | null;   // ISO | epoch | null
  position: number;
  archived: boolean;
  createdAt: string | number; // ISO | epoch
  updatedAt: string | number;
};

type BoardPayload = { board?: any; columns?: Column[]; tasks?: any[] };

type Comment = { id: number; author?: string | null; body: string; createdAt: string | number };
type TaskDetail = { task: Task; comments: Comment[] };

// -------------------- date helpers --------------------
function toDate(value: number | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    const ms = value < 1e12 ? value * 1000 : value; // seconds → ms
    return new Date(ms);
  }
  // PG: "2025-08-27 10:11:57.32+00" → "2025-08-27T10:11:57.32+00"
  const s = value.includes(" ") && !value.includes("T") ? value.replace(" ", "T") : value;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}

function formatDateTime(value: number | string | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toLocalInputValue(value: string | number | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function fromLocalInputToISO(s: string): string | null {
  if (!s) return null;
  return new Date(s).toISOString();
}

// -------------------- normalization --------------------
function tryParseArray(x: any): string[] | null {
  if (Array.isArray(x)) return x as string[];
  if (typeof x === "string") {
    try { const j = JSON.parse(x); return Array.isArray(j) ? (j as string[]) : null; } catch { return null; }
  }
  return null;
}

function normalizeTask(raw: any): Task {
  const tags = tryParseArray(raw.tags) ?? raw.tags ?? null;
  const created = raw.createdAt ?? raw.created_at ?? raw.created ?? Date.now();
  const updated = raw.updatedAt ?? raw.updated_at ?? Date.now();
  const start = raw.startAt ?? raw.start_at ?? null;
  const due = raw.dueAt ?? raw.due_at ?? null;

  return {
    id: Number(raw.id),
    boardId: Number(raw.boardId ?? raw.board_id ?? raw.board ?? 0),
    columnId: Number(raw.columnId ?? raw.column_id ?? raw.column ?? 0),
    title: String(raw.title ?? ""),
    description: raw.description ?? null,
    owner: raw.owner ?? null,
    priority: (raw.priority ?? "Normal") as Task["priority"],
    status: (raw.status ?? "Todo") as Task["status"],
    assignees: raw.assignees ?? null,
    tags,
    progress: Number(raw.progress ?? 0),
    startAt: start,
    dueAt: due,
    position: Number(raw.position ?? 0),
    archived: Boolean(raw.archived ?? false),
    createdAt: created,
    updatedAt: updated,
  };
}

// -------------------- page --------------------
export default function TasksPage() {
  const [loading, setLoading] = useState(false);
  const [board, setBoard] = useState<{ id: number; name: string; columns: Column[]; tasks: Task[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // create form
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("");
  const [priority, setPriority] = useState<"Low" | "Normal" | "High" | "Urgent">("Normal");
  const [columnKey, setColumnKey] = useState<"todo" | "inprogress" | "done" | "blocked">("todo");
  const [tags, setTags] = useState("");
  const [dueDate, setDueDate] = useState(""); // YYYY-MM-DD

  // modal
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [newComment, setNewComment] = useState("");
  const [dueEdit, setDueEdit] = useState<string>(""); // datetime-local value

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/kanban/board", { cache: "no-store" });
      const j: BoardPayload = await r.json();
      if (!r.ok) throw new Error((j as any)?.error || "Failed to load");

      // Підтримуємо обидві форми відповіді:
      const boardObj = j.board ?? { id: 0, name: "Tasks", columns: j.columns ?? [], tasks: j.tasks ?? [] };
      const tasksRaw = boardObj.tasks ?? j.tasks ?? [];
      const tasks = tasksRaw.map(normalizeTask);

      setBoard({
        id: Number(boardObj.id ?? 0),
        name: String(boardObj.name ?? "Tasks"),
        columns: (boardObj.columns ?? j.columns ?? []) as Column[],
        tasks,
      });
    } catch (e: any) {
      setError(e.message || "Failed");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const columns = useMemo(
    () => (board?.columns ?? []).slice().sort((a, b) => a.position - b.position),
    [board?.columns]
  );

  const tasksByColumn = useMemo(() => {
    const map: Record<number, Task[]> = {};
    (board?.tasks ?? []).forEach((t) => { (map[t.columnId] ||= []).push(t); });
    Object.values(map).forEach((list) =>
      list.sort(
        (a, b) =>
          a.position - b.position ||
          Number(toDate(a.createdAt)?.getTime() ?? 0) - Number(toDate(b.createdAt)?.getTime() ?? 0)
      )
    );
    return map;
  }, [board?.tasks]);

  async function createTask() {
    const t = title.trim();
    if (!t) return;
    const inputTags = tags.split(",").map((s) => s.trim()).filter(Boolean);
    const body: any = { title: t, priority, columnKey, tags: inputTags, owner: owner.trim() || null };
    if (dueDate) body.dueAt = new Date(`${dueDate}T00:00:00`).toISOString();
    await fetch("/api/kanban/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setTitle(""); setOwner(""); setTags(""); setDueDate("");
    await load();
  }

  // drag-n-drop
  const [dragId, setDragId] = useState<number | null>(null);
  function onDragStart(e: React.DragEvent, taskId: number) {
    setDragId(taskId);
    e.dataTransfer.setData("text/plain", String(taskId));
    e.dataTransfer.effectAllowed = "move";
  }
  function onDragOver(e: React.DragEvent) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }
  async function onDrop(col: Column) {
    if (!dragId) return;
    await fetch(`/api/kanban/tasks/${dragId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ moveToColumnKey: col.key }) });
    setDragId(null);
    await load();
  }

  async function markDone(taskId: number) {
    await fetch(`/api/kanban/tasks/${taskId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ moveToColumnKey: "done" }) });
    await load();
  }

  async function removeTask(taskId: number) {
    await fetch(`/api/kanban/tasks/${taskId}`, { method: "DELETE" });
    await load();
  }

  // modal helpers
  async function openView(taskId: number) {
    const r = await fetch(`/api/kanban/tasks/${taskId}`, { cache: "no-store" });
    const j = await r.json();
    if (r.ok) {
      const nt = normalizeTask((j as any).task ?? j);
      const comments = Array.isArray((j as any).comments) ? (j as any).comments : [];
      setDetail({ task: nt, comments });
      setDueEdit(toLocalInputValue(nt.dueAt ?? null));
      setOpen(true);
    }
  }

  async function addComment() {
    if (!detail?.task?.id || !newComment.trim()) return;
    await fetch(`/api/kanban/tasks/${detail.task.id}/comments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: newComment.trim(), author: "Me" }) });
    setNewComment("");
    await openView(detail.task.id);
    await load();
  }

  async function saveOwner(newOwner: string) {
    if (!detail?.task?.id) return;
    await fetch(`/api/kanban/tasks/${detail.task.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ owner: newOwner }) });
    await openView(detail.task.id);
    await load();
  }

  async function handleOK() {
    // зберегти dueAt і закрити модалку
    if (detail?.task?.id !== undefined) {
      const iso = fromLocalInputToISO(dueEdit);
      await fetch(`/api/kanban/tasks/${detail!.task.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ dueAt: iso }) });
      await load();
    }
    setOpen(false);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Tasks</h1>

      {/* create */}
      <div className="rounded-xl bg-[var(--card)] p-4 border border-white/10">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <label className="text-sm">
            <span className="mb-1 inline-block">Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2" placeholder="Add a task..." />
          </label>
          <label className="text-sm">
            <span className="mb-1 inline-block">Owner</span>
            <input value={owner} onChange={(e) => setOwner(e.target.value)} className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2" placeholder="e.g., Oleh" />
          </label>
          <label className="text-sm">
            <span className="mb-1 inline-block">Priority</span>
            <select value={priority} onChange={(e) => setPriority(e.target.value as any)} className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2">
              <option>Low</option><option>Normal</option><option>High</option><option>Urgent</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 inline-block">Column</span>
            <select value={columnKey} onChange={(e) => setColumnKey(e.target.value as any)} className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2">
              <option value="todo">To do</option><option value="inprogress">In progress</option><option value="done">Done</option><option value="blocked">Blocked</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 inline-block">Due date</span>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="mb-1 inline-block">Tags (comma separated)</span>
            <input value={tags} onChange={(e) => setTags(e.target.value)} className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2" placeholder="ai, backend, urgent" />
          </label>
        </div>
        <div className="mt-3">
          <button onClick={createTask} disabled={loading || !title.trim()} className="rounded-lg px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/10 disabled:opacity-50">
            Add task
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 p-3 text-sm">{error}</div>}

      {/* Board */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {columns.map((col) => {
          const list = tasksByColumn[col.id] || [];
          return (
            <div key={col.id} onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(col)} className="rounded-xl bg-[var(--card)] p-3 border border-white/10 min-h-[300px]">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">{col.title}</div>
                <div className="text-xs text-[var(--muted)]">{list.length}{col.wipLimit ? ` / ${col.wipLimit}` : ""}</div>
              </div>

              <div className="space-y-2">
                {list.map((t) => (
                  <div key={t.id} draggable onDragStart={(e) => onDragStart(e, t.id)} className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium">{t.title}</div>

                        {/* Owner + Tags */}
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                          {t.owner ? <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5">Owner: <b>{t.owner}</b></span> : null}
                          {Array.isArray(t.tags) && t.tags.length > 0 ? (
                            <span className="inline-flex items-center gap-1.5">
                              {t.tags.slice(0, 3).map((tag) => <TagBadge key={tag} tag={tag} />)}
                            </span>
                          ) : null}
                        </div>

                        {/* Dates */}
                        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-[var(--muted)]">
                          <div><span className="opacity-70">Created:</span> {formatDateTime(t.createdAt)}</div>
                          <div><span className="opacity-70">Start:</span> {formatDateTime(t.startAt ?? null)}</div>
                          <div><span className="opacity-70">Due:</span> {formatDateTime(t.dueAt ?? null)}</div>
                        </div>
                      </div>

                      <PriorityBadge p={t.priority} />
                    </div>

                    {/* Actions */}
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => openView(t.id)} className="rounded-md px-2 py-1 border border-white/10 hover:bg-white/10 text-xs">View</button>
                      {t.status !== "Done" && <button onClick={() => markDone(t.id)} className="rounded-md px-2 py-1 border border-white/10 hover:bg-white/10 text-xs">Mark done</button>}
                      <button onClick={() => removeTask(t.id)} className="rounded-md px-2 py-1 border border-white/10 hover:bg-white/10 text-xs">Delete</button>
                    </div>
                  </div>
                ))}
                {!list.length && <div className="text-xs text-[var(--muted)]">Drop tasks here…</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* View modal */}
      <Modal open={open} onClose={() => setOpen(false)}>
        {detail ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">{detail.task.title}</div>
                <div className="text-xs text-[var(--muted)]">Priority: <b>{detail.task.priority}</b> • Status: <b>{detail.task.status}</b></div>
              </div>
              <PriorityBadge p={detail.task.priority} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="mb-1 inline-block">Owner</span>
                <input defaultValue={detail.task.owner || ""} onBlur={(e) => saveOwner(e.target.value)} className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2" />
              </label>

              <label className="text-sm">
                <span className="mb-1 inline-block">Due date & time</span>
                <input type="datetime-local" value={dueEdit} onChange={(e) => setDueEdit(e.target.value)} className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2" />
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="text-sm">
                <div className="mb-1">Created</div>
                <div className="text-sm text-[var(--muted)]">{formatDateTime(detail.task.createdAt)}</div>
              </div>
              <div className="text-sm">
                <div className="mb-1">Start</div>
                <div className="text-sm text-[var(--muted)]">{formatDateTime(detail.task.startAt ?? null)}</div>
              </div>
            </div>

            {detail.task.description && (
              <div>
                <div className="text-sm mb-1">Description</div>
                <div className="text-sm text-[var(--muted)] whitespace-pre-wrap">{detail.task.description}</div>
              </div>
            )}

            {/* Footer */}
            <div className="mt-2 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 border border-white/10 hover:bg-white/10">Cancel</button>
              <button onClick={handleOK} className="rounded-lg px-3 py-2 border border-white/10 bg-white/10 hover:bg-white/20">OK</button>
            </div>
          </div>
        ) : <div className="text-sm">Loading…</div>}
      </Modal>
    </div>
  );
}

// -------------------- visuals --------------------
function PriorityBadge({ p }: { p: "Low" | "Normal" | "High" | "Urgent" }) {
  const tone =
    p === "Urgent" ? "bg-rose-500/20 border-rose-500/40"
    : p === "High"   ? "bg-amber-500/20 border-amber-500/40"
    : p === "Low"    ? "bg-sky-500/20 border-sky-500/40"
                     : "bg-white/10 border-white/20";
  return <span className={`text-xs rounded-md px-2 py-0.5 border ${tone}`}>{p}</span>;
}
