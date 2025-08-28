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
  startAt?: string | null; // ISO
  dueAt?: string | null;   // ISO
  position: number;
  archived: boolean;
  createdAt: number | string; // epoch(ms|s) або ISO — парсимо універсально
  updatedAt: number | string;
};

type BoardPayload = { board: { id: number; name: string; columns: Column[]; tasks: Task[] } };

type Comment = { id: number; author?: string | null; body: string; createdAt: number | string };
type TaskDetail = { task: Task; comments: Comment[] };

// -------------------- date helpers --------------------
// Надійно перетворює number(epoch s|ms) / string(ISO/PG) -> Date
function toDate(value: number | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    const ms = value < 1e12 ? value * 1000 : value; // якщо прийшли секунди
    return new Date(ms);
  }
  // рядок з Postgres типу "2025-08-27 10:11:57.32+00" теж підхопиться
  const s = value.includes(" ") && !value.includes("T") ? value.replace(" ", "T") : value;
  const t = Date.parse(s);
  return isNaN(t) ? null : new Date(t);
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

// для <input type="datetime-local">
function toLocalInputValue(value: string | number | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function fromLocalInputToISO(s: string): string | null {
  if (!s) return null;
  // інтерпретуємо як локальний час, зберігаємо в ISO (UTC)
  return new Date(s).toISOString();
}

// -------------------- page --------------------
export default function TasksPage() {
  const [loading, setLoading] = useState(false);
  const [board, setBoard] = useState<BoardPayload["board"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // create form
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("");
  const [priority, setPriority] = useState<"Low" | "Normal" | "High" | "Urgent">("Normal");
  const [columnKey, setColumnKey] = useState<"todo" | "inprogress" | "done" | "blocked">("todo");
  const [tags, setTags] = useState("");
  const [dueDate, setDueDate] = useState(""); // YYYY-MM-DD (створення — без часу)

  async function load() {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/kanban/board", { cache: "no-store" });
      const j: BoardPayload = await r.json();
      if (!r.ok) throw new Error((j as any)?.error || "Failed to load");
      setBoard(j.board);
    } catch (e: any) { setError(e.message || "Failed"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const columns = useMemo(() => (board?.columns ?? []).sort((a,b)=>a.position-b.position), [board?.columns]);
  const tasksByColumn = useMemo(() => {
    const map: Record<number, Task[]> = {};
    (board?.tasks ?? []).forEach(t => { (map[t.columnId] ||= []).push(t); });
    Object.values(map).forEach(list => list.sort((a,b)=>a.position-b.position || Number(toDate(a.createdAt)?.getTime() ?? 0) - Number(toDate(b.createdAt)?.getTime() ?? 0)));
    return map;
  }, [board?.tasks]);

  async function createTask() {
    const t = title.trim();
    if (!t) return;
    const inputTags = tags.split(",").map(s=>s.trim()).filter(Boolean);
    const body: any = {
      title: t,
      priority,
      columnKey,
      tags: inputTags,
      owner: owner.trim() || null,
    };
    if (dueDate) body.dueAt = new Date(`${dueDate}T00:00:00`).toISOString();
    await fetch("/api/kanban/tasks", {
      method: "POST",
      headers: { "content-type":"application/json" },
      body: JSON.stringify(body),
    });
    setTitle(""); setOwner(""); setTags(""); setDueDate("");
    await load();
  }

  // drag-n-drop
  const [dragId, setDragId] = useState<number|null>(null);
  function onDragStart(e: React.DragEvent, taskId: number) {
    setDragId(taskId); e.dataTransfer.setData("text/plain", String(taskId)); e.dataTransfer.effectAllowed = "move";
  }
  function onDragOver(e: React.DragEvent) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }
  async function onDrop(col: Column) {
    if (!dragId) return;
    await fetch(`/api/kanban/tasks/${dragId}`, {
      method: "PATCH", headers: { "content-type":"application/json" },
      body: JSON.stringify({ moveToColumnKey: col.key }),
    });
    setDragId(null);
    await load();
  }

  async function markDone(taskId: number) {
    await fetch(`/api/kanban/tasks/${taskId}`, {
      method: "PATCH", headers: { "content-type":"application/json" },
      body: JSON.stringify({ moveToColumnKey: "done" }),
    });
    await load();
  }

  async function removeTask(taskId: number) {
    await fetch(`/api/kanban/tasks/${taskId}`, { method: "DELETE" });
    await load();
  }

  // View modal
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [newComment, setNewComment] = useState("");

  // локальний редактор дати дедлайну з кнопкою OK
  const [dueEdit, setDueEdit] = useState<string>("");

  useEffect(() => {
    // коли відкрили задачу — заповнюємо поле для datetime-local
    setDueEdit(toLocalInputValue(detail?.task?.dueAt ?? null));
  }, [detail?.task?.dueAt, open]);

  async function openView(taskId: number) {
    const r = await fetch(`/api/kanban/tasks/${taskId}`, { cache: "no-store" });
    const j = await r.json();
    if (r.ok) { setDetail(j as TaskDetail); setOpen(true); }
  }

  async function addComment() {
    if (!detail?.task?.id || !newComment.trim()) return;
    await fetch(`/api/kanban/tasks/${detail.task.id}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: newComment.trim(), author: "Me" }),
    });
    setNewComment("");
    openView(detail.task.id);
    load();
  }

  async function saveOwner(newOwner: string) {
    if (!detail?.task?.id) return;
    await fetch(`/api/kanban/tasks/${detail.task.id}`, {
      method: "PATCH",
      headers: { "content-type":"application/json" },
      body: JSON.stringify({ owner: newOwner }),
    });
    await openView(detail.task.id);
    await load();
  }

  async function saveDueDateExplicit() {
    if (!detail?.task?.id) return;
    const iso = fromLocalInputToISO(dueEdit);
    await fetch(`/api/kanban/tasks/${detail.task.id}`, {
      method: "PATCH",
      headers: { "content-type":"application/json" },
      body: JSON.stringify({ dueAt: iso }),
    });
    await openView(detail.task.id);
    await load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Tasks</h1>

      {/* create */}
      <div className="rounded-xl bg-[var(--card)] p-4 border border-white/10">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <label className="text-sm">
            <span className="mb-1 inline-block">Title</span>
            <input value={title} onChange={e=>setTitle(e.target.value)}
              className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2" placeholder="Add a task..." />
          </label>
          <label className="text-sm">
            <span className="mb-1 inline-block">Owner</span>
            <input value={owner} onChange={e=>setOwner(e.target.value)}
              className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2" placeholder="e.g., Oleh" />
          </label>
          <label className="text-sm">
            <span className="mb-1 inline-block">Priority</span>
            <select value={priority} onChange={e=>setPriority(e.target.value as any)}
              className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2">
              <option>Low</option><option>Normal</option><option>High</option><option>Urgent</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 inline-block">Column</span>
            <select value={columnKey} onChange={e=>setColumnKey(e.target.value as any)}
              className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2">
              <option value="todo">To do</option>
              <option value="inprogress">In progress</option>
              <option value="done">Done</option>
              <option value="blocked">Blocked</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 inline-block">Due date</span>
            <input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}
              className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="mb-1 inline-block">Tags (comma separated)</span>
            <input value={tags} onChange={e=>setTags(e.target.value)}
              className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2" placeholder="ai, backend, urgent" />
          </label>
        </div>
        <div className="mt-3">
          <button
            onClick={createTask}
            disabled={loading || !title.trim()}
            className="rounded-lg px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/10 disabled:opacity-50"
          >
            Add task
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 p-3 text-sm">{error}</div>}

      {/* Board */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {columns.map(col => {
          const list = tasksByColumn[col.id] || [];
          return (
            <div key={col.id}
                 onDragOver={onDragOver}
                 onDrop={()=>onDrop(col)}
                 className="rounded-xl bg-[var(--card)] p-3 border border-white/10 min-h-[300px]">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">{col.title}</div>
                <div className="text-xs text-[var(--muted)]">{list.length}{col.wipLimit ? ` / ${col.wipLimit}` : ""}</div>
              </div>

              <div className="space-y-2">
                {list.map(t => (
                  <div key={t.id}
                       draggable
                       onDragStart={(e)=>onDragStart(e, t.id)}
                       className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium">{t.title}</div>

                        {/* Мета-блок: owner + теги */}
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted)]">
                          {t.owner ? <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5">Owner: <b>{t.owner}</b></span> : null}
                          {Array.isArray(t.tags) && t.tags.length > 0 ? (
                            <span className="inline-flex items-center gap-1.5">
                              {t.tags.slice(0, 3).map(tag => <TagBadge key={tag} tag={tag} />)}
                            </span>
                          ) : null}
                        </div>

                        {/* Дати: Created / Start / Due */}
                        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-[var(--muted)]">
                          <div><span className="opacity-70">Created:</span> {formatDateTime(t.createdAt)}</div>
                          <div><span className="opacity-70">Start:</span> {formatDateTime(t.startAt ?? null)}</div>
                          <div><span className="opacity-70">Due:</span> {formatDateTime(t.dueAt ?? null)}</div>
                        </div>
                      </div>

                      <PriorityBadge p={t.priority} />
                    </div>

                    {/* Кнопки дій */}
                    <div className="mt-3 flex gap-2">
                      <button onClick={()=>openView(t.id)}
                              className="rounded-md px-2 py-1 border border-white/10 hover:bg-white/10 text-xs">
                        View
                      </button>
                      {t.status !== "Done" && (
                        <button onClick={()=>markDone(t.id)}
                                className="rounded-md px-2 py-1 border border-white/10 hover:bg-white/10 text-xs">
                          Mark done
                        </button>
                      )}
                      <button onClick={()=>removeTask(t.id)}
                              className="rounded-md px-2 py-1 border border-white/10 hover:bg-white/10 text-xs">
                        Delete
                      </button>
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
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">{detail.task.title}</div>
                <div className="text-xs text-[var(--muted)]">
                  Priority: <b>{detail.task.priority}</b> • Status: <b>{detail.task.status}</b>
                </div>
              </div>
              <PriorityBadge p={detail.task.priority} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="mb-1 inline-block">Owner</span>
                <input
                  defaultValue={detail.task.owner || ""}
                  onBlur={(e)=>saveOwner(e.target.value)}
                  className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
                />
              </label>

              {/* редактор дати з кнопкою OK */}
              <div className="text-sm">
                <span className="mb-1 inline-block">Due date & time</span>
                <div className="flex items-center gap-2">
                  <input
                    type="datetime-local"
                    value={dueEdit}
                    onChange={(e)=>setDueEdit(e.target.value)}
                    className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
                  />
                  <button onClick={saveDueDateExplicit}
                          className="rounded-lg px-3 py-2 border border-white/10 hover:bg-white/10">
                    OK
                  </button>
                </div>
              </div>
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

            <div>
              <div className="font-medium mb-2">Comments</div>
              <div className="space-y-2 max-h-64 overflow-auto pr-1">
                {detail.comments.length ? detail.comments.map((c) => (
                  <div key={c.id} className="rounded-lg border border-white/10 p-2 bg-black/20">
                    <div className="text-xs text-[var(--muted)] mb-1">{c.author || "Anon"}</div>
                    <div className="text-sm whitespace-pre-wrap">{c.body}</div>
                  </div>
                )) : <div className="text-sm text-[var(--muted)]">No comments yet.</div>}
              </div>

              <div className="mt-3 flex gap-2">
                <input
                  className="flex-1 rounded-lg bg-black/20 border border-white/10 px-3 py-2"
                  placeholder="Write a comment…"
                  value={newComment}
                  onChange={e=>setNewComment(e.target.value)}
                />
                <button onClick={addComment}
                        className="rounded-lg px-3 py-2 border border-white/10 hover:bg-white/10">
                  Send
                </button>
              </div>
            </div>
          </div>
        ) : <div className="text-sm">Loading…</div>}
      </Modal>
    </div>
  );
}

// -------------------- visuals --------------------
function PriorityBadge({ p }: { p: "Low"|"Normal"|"High"|"Urgent" }) {
  const tone = p === "Urgent" ? "bg-rose-500/20 border-rose-500/40"
            : p === "High"   ? "bg-amber-500/20 border-amber-500/40"
            : p === "Low"    ? "bg-sky-500/20 border-sky-500/40"
            :                  "bg-white/10 border-white/20";
  return <span className={`text-xs rounded-md px-2 py-0.5 border ${tone}`}>{p}</span>;
}
