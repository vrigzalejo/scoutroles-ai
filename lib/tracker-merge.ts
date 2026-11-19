import type { Tracked } from "@/lib/types";

export function mergeTrackers(
  local: Record<string, Tracked>,
  cloud: Record<string, Tracked>,
): Record<string, Tracked> {
  const ids = new Set([...Object.keys(local), ...Object.keys(cloud)]);
  const next: Record<string, Tracked> = {};
  for (const id of ids) {
    const here = local[id];
    const saved = cloud[id];
    if (!here) next[id] = saved;
    else if (!saved) next[id] = here;
    else next[id] = Date.parse(here.updatedAt) >= Date.parse(saved.updatedAt) ? here : saved;
  }
  return next;
}
