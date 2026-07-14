import type { Area, AreaProgress, Project, ProjectProgress, Task } from "./types";

/**
 * Progress is derived, never stored (Section 5).
 * done / total over an area's or project's tasks.
 */
export function areaProgress(areas: Area[], tasks: Task[]): AreaProgress[] {
  return areas
    .map((a) => {
      const list = tasks.filter((t) => t.areaId === a.id);
      const done = list.filter((t) => t.status === "done").length;
      const total = list.length;
      return {
        id: a.id,
        name: a.name,
        endInMind: a.endInMind,
        sortOrder: a.sortOrder,
        done,
        total,
        pct: total ? Math.round((done / total) * 100) : 0,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function projectProgress(projects: Project[], tasks: Task[]): ProjectProgress[] {
  return projects
    .filter((p) => p.status !== "archived")
    .map((p) => {
      const list = tasks.filter((t) => t.projectId === p.id);
      const done = list.filter((t) => t.status === "done").length;
      const total = list.length;
      return {
        id: p.id,
        name: p.name,
        areaId: p.areaId,
        done,
        total,
        pct: total ? Math.round((done / total) * 100) : 0,
      };
    });
}

/** Sort per Section 6: red flag first, then sort_order, then created_at. */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const redA = a.flag === "red" && a.status !== "done" ? 0 : 1;
    const redB = b.flag === "red" && b.status !== "done" ? 0 : 1;
    if (redA !== redB) return redA - redB;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.createdAt.localeCompare(b.createdAt);
  });
}
