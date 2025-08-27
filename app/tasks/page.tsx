"use client";

import { useEffect, useMemo, useState } from "react";

type Column = { id: number; key: "todo"|"inprogress"|"done"|"blocked"; title: string; wipLimit?: number|null; position: number; };
type Task = {
  id: number; boardId: number; columnId: number;
  title: string; description?: string|null;
  priority: "Low"|"Normal"|"High"|"Urgent";
  status: "Todo"|"In Progress"|"Done"|"Blocked";
  assignees?: string[]|null; tags?: string[]|null;
  progress: number; startAt?: string|null; dueAt?: string|null;
  position: number; archived: boolean;
  createdAt: number; updatedAt: number;
};
type BoardPayload = { board: { id: number; name: string; columns: Column[]; tasks: Task[] } };

export default function TasksPage() {
  const [loading, setLoading] = useState(false);
  const [board, setBoard] = useState<BoardPayload["board"] | null>(null);
  const [error, setError] = useState<string|null>(null);

  // форма створення
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"Low"|"Normal"|"High"|"Urgent">("Normal");
  const [columnKey, setColumnKey] = useState<"todo"|"inprogress"|"done"|"blocked">("todo");
  const [tags, setTags] = useState("");

  async function load() {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/kanban/board", { cache: "no-store" });
      const j: BoardPayload = await r.json();
      if (!r.ok) throw new Error((j as any)?.error || "Failed to load");
      setBoard(j.board);
    } catch (e:any) { setError(e.message || "Failed"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const columns = useMemo(() => (board?.columns ?? []).sort((a,b)=>a.position-b.position), [board?.columns]);
  const tasksByColumn = useMemo(() => {
    const map: Record<number, Task[]> = {};
    (board?.tasks ?? []).forEach(t => { (map[t.columnId] ||= []).push(t); });
    Object.values(map).forEach(list => list.sort((a,b)=>a.position-b.position || a.createdAt-b.createdAt));
    return map;
  }, [board?.tasks]);

  async function createTask() {
    const t = title.trim();
    if (!t) return;
    const inputTags = tags.split(",").map(s=>s.trim()).filter(Boolean);
    await fetch("/api/kanban/tasks", {
      method: "POST",
      headers: { "content-type":"application/json" },
      body: JSON.stringify({ title: t, priority, columnKey, tags: inputTags }),
    });
    setTitle(""); setTags("");
    await load();
  }

  // drag-n-drop
  const [dragId, setDragId] = useState<number|null>(null);

  function onDragStart(e: React.DragEvent, taskId: number) {
    setDragId(taskId);
    e.dataTransfer.setData("text/plain", String(taskId));
    e.dataTransfer.effectAllowed = "move";
  }
  function onDragOver(e: React.DragEvent) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }
  async function onDrop(col: Column) {
    if (!dragId) return;
    await fetch(`/api/kanban/tasks/${dragId}`, {
      method: "PATCH",
      headers: { "content-type":"application/json" },
      body: JSON.stringify({ moveToColumnKey: col.key }),
    });
    setDragId(null);
    await load();
  }

  async function markDone(taskId: number) {
    await fetch(`/api/kanban/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "content-type":"application/json" },
      body: JSON.stringify({ moveToColumnKey: "done" }),
    });
    await load();
  }

  async function removeTask(taskId: number) {
    await fetch(`/api/kanban/tasks/${taskId}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Tasks</h1>

      {/* форма створення */}
      <div className="rounded-xl bg-[var(--card)] p-4 border border-white/10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="text-sm">
            <span className="mb-1 inline-block">Title</span>
            <input value={title} onChange={e=>setTitle(e.target.value)}
              className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2" placeholder="Add a task..." />
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

      {/* Канбан */}
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
                      <div className="font-medium">{t.title}</div>
                      <PriorityBadge p={t.priority} />
                    </div>
                    {t.tags?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {t.tags.map(tag=>(
                          <span key={tag} className="text-xs rounded-full px-2 py-0.5 border border-white/10 bg-white/10">{tag}</span>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-3 flex gap-2">
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
    </div>
  );
}

function PriorityBadge({ p }: { p: "Low"|"Normal"|"High"|"Urgent" }) {
  const text = p;
  const tone = p === "Urgent" ? "bg-rose-500/20 border-rose-500/40"
            : p === "High"   ? "bg-amber-500/20 border-amber-500/40"
            : p === "Low"    ? "bg-sky-500/20 border-sky-500/40"
            :                  "bg-white/10 border-white/20";
  return <span className={`text-xs rounded-md px-2 py-0.5 border ${tone}`}>{text}</span>;
}
