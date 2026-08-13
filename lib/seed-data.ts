import type { Area, Task, TaskFlag } from "./types";

/**
 * Mirror of supabase/seed.sql for the local dev store only.
 * Production seed lives in SQL.
 */
export const SEED_AREAS: Area[] = [
  { id: "inbox", name: "Inbox", endInMind: "Unsorted, Conrad files these", sortOrder: 0 },
  { id: "dash-farms", name: "Dash Farms", endInMind: "A profitable farm that runs without me", sortOrder: 1 },
  { id: "la-z-boy", name: "La-Z-Boy", endInMind: "Software that scales or sells", sortOrder: 2 },
  { id: "trakwell", name: "Trakwell", endInMind: "Its own company one day", sortOrder: 3 },
  { id: "estate", name: "Estate", endInMind: "The place, restored and lived in", sortOrder: 4 },
  { id: "properties", name: "Properties", endInMind: "Cash flow steady, refis handled", sortOrder: 5 },
  { id: "personal", name: "Personal", endInMind: "Room to enjoy the life you built", sortOrder: 6 },
];

const seedTask = (
  areaId: string,
  title: string,
  flag: TaskFlag
): Omit<Task, "id" | "createdAt"> => ({
  areaId,
  projectId: null,
  title,
  note: "",
  status: "open",
  flag,
  delegatedTo: null,
  dueDate: null,
  unsure: false,
  conradNote: "",
  source: "seed",
  sourceRef: "",
  originSignalId: null,
  doneAt: null,
  sortOrder: 0,
});

export const SEED_TASKS = [
  seedTask("estate", "Bind the insurance policies", "none"),
  seedTask("estate", "Pay the back taxes", "none"),
  seedTask("estate", "Finish the Steuart title process", "none"),
  seedTask("estate", "Clean up the burn piles", "none"),
  seedTask("estate", "Call Tyler Pollson about the flooring", "none"),
  seedTask("properties", "Seven-property refinance plan", "red"),
  seedTask("dash-farms", "Rent the brush machine, clear blackberries", "none"),
  seedTask("dash-farms", "Spray and prune the peach trees", "none"),
  seedTask("dash-farms", "Set gopher traps", "none"),
  seedTask("dash-farms", "Set up Geofency for the 500-hour log", "none"),
  seedTask("la-z-boy", "Define the CRM + calendar goal-machine scope", "none"),
  seedTask("trakwell", "Send Marshall the Apex + Cognos docs", "none"),
];
