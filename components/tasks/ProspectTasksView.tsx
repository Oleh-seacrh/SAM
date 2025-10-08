// components/tasks/ProspectTasksView.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { BrandBadge } from "@/components/search/BrandBadge";
import { CountryPill } from "@/components/search/CountryPill";
import { TagBadge } from "@/components/ui/TagBadge";

type ProspectColumn = {
  id: number;
  key: string;
  title: string;
  wipLimit?: number | null;
  position: number;
};

type ProspectTask = {
  id: number;
  tenantId: string;
  boardId: number;
  columnId: number;
  domain: string;
  homepage?: string | null;
  companyName?: string | null;
  title: string;
  description?: string | null;
  snippet?: string | null;
  scoreLabel?: string | null;
  scoreConfidence?: number | null;
  scoreReason?: string | null;
  companyType?: string | null;
  countryIso2?: string | null;
  countryName?: string | null;
  countryConfidence?: string | null;
  emails?: string[] | null;
  phones?: string[] | null;
  brands?: string[] | null;
  pagesAnalyzed?: number;
  deepAnalyzedAt?: string | null;
  priority: string;
  status: string;
  owner?: string | null;
  assignees?: string[] | null;
  tags?: string[] | null;
  progress: number;
  position: number;
  archived: boolean;
  startAt?: string | null;
  dueAt?: string | null;
  contactedAt?: string | null;
  repliedAt?: string | null;
  wonAt?: string | null;
  lostAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

type ProspectBoardPayload = {
  board: {
    id: number;
    name: string;
    columns: ProspectColumn[];
    tasks: ProspectTask[];
  };
};

export function ProspectTasksView() {
  const [loading, setLoading] = useState(false);
  const [board, setBoard] = useState<ProspectBoardPayload["board"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [selectedTask, setSelectedTask] = useState<ProspectTask | null>(null);
  const [open, setOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      console.log("[ProspectTasksView] Fetching /api/prospects/board...");
      const r = await fetch("/api/prospects/board", { cache: "no-store" });
      console.log("[ProspectTasksView] Response status:", r.status);
      const j: ProspectBoardPayload = await r.json();
      console.log("[ProspectTasksView] Response data:", j);
      
      if (!r.ok) {
        console.error("[ProspectTasksView] Error response:", j);
        throw new Error((j as any)?.error || "Failed to load");
      }
      
      console.log("[ProspectTasksView] Board loaded:", {
        id: j.board.id,
        columnsCount: j.board.columns?.length,
        tasksCount: j.board.tasks?.length
      });
      setBoard(j.board);
    } catch (e: any) {
      console.error("[ProspectTasksView] Load error:", e);
      setError(e.message || "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const columns = useMemo(
    () => (board?.columns || []).sort((a, b) => a.position - b.position),
    [board?.columns]
  );

  const tasksByColumn = useMemo(() => {
    const map: Record<number, ProspectTask[]> = {};
    (board?.tasks || []).forEach((t) => {
      (map[t.columnId] ||= []).push(t);
    });
    Object.values(map).forEach((list) =>
      list.sort((a, b) => a.position - b.position || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    );
    return map;
  }, [board?.tasks]);

  function onDragStart(e: React.DragEvent, taskId: number) {
    setDragId(taskId);
    setIsDragging(true);
    e.dataTransfer.setData("text/plain", String(taskId));
    e.dataTransfer.effectAllowed = "move";
    // Add visual feedback
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "0.5";
    }
  }

  function onDragEnd(e: React.DragEvent) {
    // Reset visual feedback
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1";
    }
    // Don't reset dragId immediately - onDrop needs it and fires after onDragEnd
    // Reset dragId after a short delay to allow onDrop to complete first
    setTimeout(() => {
      setDragId(null);
      setIsDragging(false);
    }, 100);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  async function onDrop(e: React.DragEvent, col: ProspectColumn) {
    e.preventDefault();
    if (!dragId) {
      console.log("[onDrop] No dragId, skipping");
      return;
    }
    
    // Capture dragId before resetting it
    const taskId = dragId;
    setDragId(null);
    
    console.log("[onDrop] Dropping task", taskId, "to column", col.key, "columnId", col.id);
    
    try {
      const response = await fetch(`/api/prospects/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ moveToColumnKey: col.key }),
      });
      
      console.log("[onDrop] Response status:", response.status);
      
      if (!response.ok) {
        const error = await response.json();
        console.error("[onDrop] Error:", error);
      } else {
        console.log("[onDrop] Success!");
      }
    } catch (error) {
      console.error("[onDrop] Exception:", error);
    }
    
    await load();
  }

  function openTaskModal(task: ProspectTask) {
    // Don't open modal if we're dragging
    if (isDragging) return;
    setSelectedTask(task);
    setOpen(true);
  }

  async function archiveTask(taskId: number) {
    await fetch(`/api/prospects/tasks/${taskId}`, { method: "DELETE" });
    await load();
    setOpen(false);
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 p-3 text-sm">{error}</div>}

      {loading && <div>Loading prospects...</div>}

      {/* Kanban Board */}
      {!loading && board && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((col) => (
            <div
              key={col.id}
              className="flex-shrink-0 w-80 rounded-xl bg-[var(--card)] border border-white/10 p-4"
              onDragOver={onDragOver}
              onDrop={(e) => onDrop(e, col)}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">{col.title}</h3>
                <span className="text-xs text-[var(--muted)]">{(tasksByColumn[col.id] || []).length}</span>
              </div>

              <div className="space-y-2">
                {(tasksByColumn[col.id] || []).map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, task.id)}
                    onDragEnd={onDragEnd}
                    onClick={() => openTaskModal(task)}
                    className="cursor-move rounded-lg bg-black/20 border border-white/10 p-3 hover:bg-black/30 transition space-y-2"
                  >
                    <div className="font-medium text-sm">{task.title}</div>
                    
                    {task.companyName && (
                      <div className="text-xs text-[var(--muted)]">{task.companyName}</div>
                    )}
                    
                    <div className="text-xs text-blue-400">
                      {task.homepage ? task.homepage.replace(/^https?:\/\/(www\.)?/, "") : ""}
                    </div>

                    {/* Score, Type, Country */}
                    <div className="flex gap-1 flex-wrap">
                      {task.scoreLabel && (
                        <Badge tone={task.scoreLabel as any}>{task.scoreLabel.toUpperCase()}</Badge>
                      )}
                      {task.companyType && (
                        <span className="text-xs px-2 py-0.5 rounded-md bg-blue-500/20 border border-blue-500/40">
                          {task.companyType}
                        </span>
                      )}
                      {task.countryIso2 && (
                        <CountryPill
                          countryISO2={task.countryIso2}
                          countryName={task.countryName || null}
                          confidence={task.countryConfidence as any}
                        />
                      )}
                    </div>

                    {/* Brands */}
                    {task.brands && task.brands.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {task.brands.slice(0, 3).map((brand) => (
                          <BrandBadge key={brand} label={brand} tone="maybe" />
                        ))}
                        {task.brands.length > 3 && (
                          <span className="text-xs text-[var(--muted)]">+{task.brands.length - 3}</span>
                        )}
                      </div>
                    )}

                    {/* Contacts preview */}
                    {((task.emails && task.emails.length > 0) || (task.phones && task.phones.length > 0)) && (
                      <div className="text-xs text-[var(--muted)] space-y-1">
                        {task.emails && task.emails.length > 0 && (
                          <div>📧 {task.emails[0]}</div>
                        )}
                        {task.phones && task.phones.length > 0 && (
                          <div>📞 {task.phones[0]}</div>
                        )}
                      </div>
                    )}

                    {/* Tags */}
                    {task.tags && task.tags.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {task.tags.map((tag) => (
                          <TagBadge key={tag} tag={tag} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Task Detail Modal */}
      <Modal open={open} onClose={() => setOpen(false)}>
        {selectedTask && (
          <div>
            <h2 className="text-xl font-semibold mb-4">{selectedTask.title}</h2>
          <div className="space-y-4">
            <div className="space-y-2">
              <div>
                <strong>Company:</strong> {selectedTask.companyName || "N/A"}
              </div>
              <div>
                <strong>Website:</strong>{" "}
                <a href={selectedTask.homepage || ""} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
                  {selectedTask.homepage}
                </a>
              </div>
              {selectedTask.snippet && (
                <div>
                  <strong>Description:</strong> {selectedTask.snippet}
                </div>
              )}
              {selectedTask.scoreReason && (
                <div>
                  <strong>Score Reason:</strong> {selectedTask.scoreReason}
                </div>
              )}
            </div>

            {/* Contacts */}
            {((selectedTask.emails && selectedTask.emails.length > 0) || (selectedTask.phones && selectedTask.phones.length > 0)) && (
              <div className="border-t border-white/10 pt-3 space-y-2">
                <strong>Contacts:</strong>
                {selectedTask.emails && selectedTask.emails.length > 0 && (
                  <div>
                    <div className="text-xs text-[var(--muted)] mb-1">Emails:</div>
                    {selectedTask.emails.map((email, i) => (
                      <div key={i} className="text-sm">
                        <a href={`mailto:${email}`} className="text-blue-400 hover:underline">
                          {email}
                        </a>
                      </div>
                    ))}
                  </div>
                )}
                {selectedTask.phones && selectedTask.phones.length > 0 && (
                  <div>
                    <div className="text-xs text-[var(--muted)] mb-1">Phones:</div>
                    {selectedTask.phones.map((phone, i) => (
                      <div key={i} className="text-sm">
                        <a href={`tel:${phone}`} className="text-blue-400 hover:underline">
                          {phone}
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Brands */}
            {selectedTask.brands && selectedTask.brands.length > 0 && (
              <div className="border-t border-white/10 pt-3">
                <strong>Matched Brands:</strong>
                <div className="flex gap-1 flex-wrap mt-1">
                  {selectedTask.brands.map((brand) => (
                    <BrandBadge key={brand} label={brand} tone="maybe" />
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="border-t border-white/10 pt-3 flex gap-2 justify-end">
              <button
                onClick={() => archiveTask(selectedTask.id)}
                className="px-4 py-2 rounded-lg border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 transition"
              >
                Archive
              </button>
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition"
              >
                Close
              </button>
            </div>
          </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

