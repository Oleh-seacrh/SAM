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

type Priority = "Low" | "Normal" | "High" | "Urgent";

type Task = {
  id: number;
  boardId: number;
  columnId: number;
  title: string;
  description?: string | null;
  owner?: string | null;
  priority: Priority;
  status: "Todo" | "In Progress" | "Done" | "Blocked";
  assignees?: string[] | null;
  tags?: string[] | null;
  progress: number;
  startAt?: string | number | null;
  dueAt?: string | number | null;
  position: number;
  archived: boolean;
  createdAt: string | number;
  updatedAt: string | number;
};

type BoardPayload = { board: { id: number; name: string; columns: Column[]; tasks: any[] } };
type Comment = { id: number; author?: string | null; body: string; createdAt: string | number };
type TaskDetail = { task: Task; comments: Comment[] };

// -------------------- date helpers --------------------
function toDate(value: number | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") {
    const ms = value < 1e12 ? value * 1000 : value; // sec → ms
    return new Date(ms);
  }
  const asNum = Number(value);
  if (Number.isFinite(asNum)) {
    const ms = asNum < 1e12 ? asNum * 1000 : asNum;
    return new Date(ms);
  }

  let s = String(value).trim();
  if (s.includes(" ") && !s.includes("T")) s = s.replace(" ", "T");
  s = s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  s = s.replace(/([+-]\d{2})$/, "$1:00");
  if (!/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) s += "Z";

  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}

function formatDate(value: number | string | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}
function formatTime(value: number | string | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
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
    try {
      const j = JSON.parse(x);
      return Array.isArray(j) ? (j as string[]) : null;
    } catch {
      return null;
    }
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
    priority: (raw.priority ?? "Normal") as Priority,
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
  const [priority, setPriority] = useState<Priority>("Normal");
  const [columnKey, setColumnKey] = useState<"todo" | "inprogress" | "done" | "blocked">("todo");
  const [tags, setTags] = useState("");
  const [dueDate, setDueDate] = useState(""); // YYYY-MM-DD

  // modal
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [newComment, setNewComment] = useState("");
  const [ownerEdit, setOwnerEdit] = useState<string>("");
  const [priorityEdit, setPriorityEdit] = useState<Priority>("Normal");
  const [dueEdit, setDueEdit] = useState<string>("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/kanban/board", { cache: "no-store" });
      const j: BoardPayload = await r.json();
      if (!r.ok) throw new Error((j as any)?.error || "Failed to load");
      const tasks = (j.board?.tasks ?? []).map(normalizeTask);
      setBoard({ id: j.board.id, name: j.board.name, columns: j.board.columns as Column[], tasks });
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

    const r = await fetch("/api/kanban/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError((j as any)?.error || "Failed to create task");
      return;
    }
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
    await fetch(`/api/kanban/tasks/${dragId}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ moveToColumnKey: col.key }),
    });
    setDragId(null);
    await load();
  }

  async function markDone(taskId: number) {
    await fetch(`/api/kanban/tasks/${taskId}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ moveToColumnKey: "done" }),
    });
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
      setOwnerEdit(nt.owner ?? "");
      setPriorityEdit(nt.priority ?? "Normal");
      setDueEdit(toLocalInputValue(nt.dueAt ?? null));
      setOpen(true);
    }
  }

  async function addComment() {
    if (!detail?.task?.id || !newComment.trim()) return;
    await fetch(`/api/kanban/tasks/${detail.task.id}/comments`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: newComment.trim(), author: "Me" }),
    });
    setNewComment("");
    // перезавантажимо деталі + ленту
    await openView(detail.task.id);
    await load();
  }

  async function handleOK() {
    if (!detail?.task?.id) { setOpen(false); return; }
    try {
      setSaving(true);
      const payload: any = {
        owner: ownerEdit.trim() || null,
        priority: priorityEdit,
        dueAt: fromLocalInputToISO(dueEdit),
      };
      const r = await fetch(`/api/kanban/tasks/${detail.task.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError((j as any)?.error || "Failed to save changes");
      }
      await load();
    } finally {
      setSaving(false);
      setOpen(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Tasks</h1>

      {error && <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 p-3 text-sm">{error}</div>}

      {/* create */}
      <div className="rounded-xl bg-[var(--card)] p-4 border border-white/10">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <label className="text-sm">
            <span className="mb-1 inline-block">Title</span>
            <input value={title} onChange={(e)=>setTitle(e.target.value)}
              className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2" placeholder="Add a task..." />
          </label>
          <label className="text-sm">
            <span className="mb-1 inline-block">Owner</span>
            <input value={owner} onChange={(e)=>setOwner(e.target.value)}
              className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2" placeholder="e.g., Oleh" />
          </label>
          <label className="text-sm">
            <span className="mb-1 inline-block">Priority</span>
            <select value={priority} onChange={(e)=>setPriority(e.target.value as Priority)}
              className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2">
              <option>Low</option><option>Normal</option><option>High</option><option>Urgent</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 inline-block">Column</span>
            <select value={columnKey} onChange={(e)=>setColumnKey(e.target.value as any)}
              className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2">
              <option value="todo">To do</option>
              <option value="inprogress">In progress</option>
              <option value="done">Done</option>
              <option value="blocked">Blocked</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 inline-block">Due date</span>
            <input type="date" value={dueDate} onChange={(e)=>setDueDate(e.target.value)}
              className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="mb-1 inline-block">Tags (comma separated)</span>
            <input value={tags} onChange={(e)=>setTags(e.target.value)}
              className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2" placeholder="ai, backend, urgent" />
          </label>
        </div>
        <div className="mt-3">
          <button onClick={createTask} disabled={loading || !title.trim()}
            className="rounded-lg px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/10 disabled:opacity-50">
            Add task
          </button>
        </div>
      </div>

      {/* Board */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {columns.map((col) => {
          const list = tasksByColumn[col.id] || [];
          return (
            <div key={col.id} onDragOver={onDragOver} onDrop={()=>onDrop(col)}
                 className="rounded-xl bg-[var(--card)] p-4 border border-white/10 min-h-[360px]">
              <div className="flex items-center justify-between mb-3">
                <div className="font-medium">{col.title}</div>
                <div className="text-xs text-[var(--muted)]">{list.length}{col.wipLimit ? ` / ${col.wipLimit}` : ""}</div>
              </div>

              <div className="space-y-3">
                {list.map((t) => (
                  <div key={t.id} draggable onDragStart={(e)=>onDragStart(e, t.id)}
                       className="rounded-lg border border-white/10 bg-black/25 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 w-full">
                        {/* Title */}
                        <div className="font-medium text-base">{t.title}</div>

                        {/* Owner */}
                        <div className="mt-2 text-xs">
                          <div className="opacity-70">Owner</div>
                          <div className="mt-0.5">
                            {t.owner ? (
                              <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-2 py-0.5">
                                <b>{t.owner}</b>
                              </span>
                            ) : "—"}
                          </div>
                        </div>

                        {/* Tags */}
                        <div className="mt-2 text-xs">
                          <div className="opacity-70">Tags</div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {Array.isArray(t.tags) && t.tags.length > 0
                              ? t.tags.slice(0, 4).map((tag) => <TagBadge key={tag} tag={tag} />)
                              : <span>—</span>}
                          </div>
                        </div>

                        {/* Created & Due — кожен у два рядки */}
                        <div className="mt-2 text-xs">
                          <div className="opacity-70">Created</div>
                          <div className="mt-0.5 flex gap-2">
                            <span className="whitespace-nowrap">{formatDate(t.createdAt)}</span>
                            <span className="whitespace-nowrap">{formatTime(t.createdAt)}</span>
                          </div>
                        </div>
                        <div className="mt-2 text-xs">
                          <div className="opacity-70">Due</div>
                          <div className="mt-0.5 flex gap-2">
                            <span className="whitespace-nowrap">{formatDate(t.dueAt ?? null)}</span>
                            <span className="whitespace-nowrap">{formatTime(t.dueAt ?? null)}</span>
                          </div>
                        </div>
                      </div>

                      <PriorityBadge p={t.priority} />
                    </div>

                    {/* Actions */}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button onClick={()=>openView(t.id)}
                              className="rounded-md px-2 py-1 border border-white/10 hover:bg-white/10 text-xs">View</button>
                      {t.status !== "Done" && (
                        <button onClick={()=>markDone(t.id)}
                                className="rounded-md px-2 py-1 border border-white/10 hover:bg-white/10 text-xs">Mark done</button>
                      )}
                      <button onClick={()=>removeTask(t.id)}
                              className="rounded-md px-2 py-1 border border-white/10 hover:bg-white/10 text-xs">Delete</button>
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
      <Modal open={open} onClose={()=>setOpen(false)}>
        {detail ? (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">{detail.task.title}</div>
                <div className="text-xs text-[var(--muted)]">Status: <b>{detail.task.status}</b></div>
              </div>
              <PriorityBadge p={priorityEdit} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Owner editable */}
              <label className="text-sm md:col-span-1">
                <span className="mb-1 inline-block">Owner</span>
                <input
                  value={ownerEdit}
                  onChange={(e)=>setOwnerEdit(e.target.value)}
                  className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
                  placeholder="Type owner…"
                />
              </label>

              {/* Priority editable */}
              <label className="text-sm md:col-span-1">
                <span className="mb-1 inline-block">Priority</span>
                <select
                  value={priorityEdit}
                  onChange={(e)=>setPriorityEdit(e.target.value as Priority)}
                  className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
                >
                  <option>Low</option><option>Normal</option><option>High</option><option>Urgent</option>
                </select>
              </label>

              {/* Due editable */}
              <label className="text-sm md:col-span-1">
                <span className="mb-1 inline-block">Due date & time</span>
                <input
                  type="datetime-local"
                  value={dueEdit}
                  onChange={(e)=>setDueEdit(e.target.value)}
                  className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
                />
              </label>
            </div>

            {/* Created (read-only) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="text-sm">
                <div className="mb-1">Created</div>
                <div className="text-sm text-[var(--muted)] flex gap-2">
                  <span className="whitespace-nowrap">{formatDate(detail.task.createdAt)}</span>
                  <span className="whitespace-nowrap">{formatTime(detail.task.createdAt)}</span>
                </div>
              </div>
            </div>

            {/* Comments */}
            <div>
              <div className="font-medium mb-2">Comments</div>

              <div className="space-y-2 max-h-64 overflow-auto pr-1">
                {detail.comments && detail.comments.length ? (
                  detail.comments.map((c) => (
                    <div key={c.id} className="rounded-lg border border-white/10 p-2 bg-black/20">
                      <div className="text-xs text-[var(--muted)] mb-1">
                        {c.author || "Anon"} • {formatDate(c.createdAt)} {formatTime(c.createdAt)}
                      </div>
                      <div className="text-sm whitespace-pre-wrap">{c.body}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-[var(--muted)]">No comments yet.</div>
                )}
              </div>

              <div className="mt-3 flex gap-2">
                <input
                  className="flex-1 rounded-lg bg-black/20 border border-white/10 px-3 py-2"
                  placeholder="Write a comment…"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newComment.trim()) {
                      e.preventDefault();
                      addComment();
                    }
                  }}
                />
                <button
                  onClick={addComment}
                  className="rounded-lg px-3 py-2 border border-white/10 hover:bg-white/10"
                >
                  Send
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-2 flex justify-end gap-2">
              <button onClick={()=>setOpen(false)}
                      className="rounded-lg px-3 py-2 border border-white/10 hover:bg-white/10" disabled={saving}>
                Cancel
              </button>
              <button onClick={handleOK}
                      className="rounded-lg px-3 py-2 border border-white/10 bg-white/10 hover:bg-white/20 disabled:opacity-50"
                      disabled={saving}>
                {saving ? "Saving…" : "OK"}
              </button>
            </div>
          </div>
        ) : <div className="text-sm">Loading…</div>}
      </Modal>
    </div>
  );
}

// -------------------- visuals --------------------
function PriorityBadge({ p }: { p: Priority }) {
  const tone = p === "Urgent" ? "bg-rose-500/20 border-rose-500/40"
            : p === "High"   ? "bg-amber-500/20 border-amber-500/40"
            : p === "Low"    ? "bg-sky-500/20 border-sky-500/40"
                             : "bg-white/10 border-white/20";
  return <span className={`text-xs rounded-md px-2 py-0.5 border whitespace-nowrap ${tone}`}>{p}</span>;
}
