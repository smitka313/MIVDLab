import { shuffle } from "@/lib/utils";

/**
 * Split students into balanced random groups.
 *  - by "size": as many groups as needed so none exceeds `n`, sizes differ by at most 1
 *  - by "count": exactly `n` groups (or fewer if there are fewer students)
 */
export function makeRandomGroups(studentIds: string[], mode: "size" | "count", n: number, rand: () => number = Math.random): string[][] {
  if (!studentIds.length || n < 1) return [];
  const count = mode === "size" ? Math.ceil(studentIds.length / n) : Math.min(n, studentIds.length);
  const groups: string[][] = Array.from({ length: count }, () => []);
  shuffle(studentIds, rand).forEach((id, i) => groups[i % count].push(id));
  return groups;
}

/** Give each member of each group a distinct role, in role order, while roles last. */
export function assignRoles(groups: string[][], roleIds: string[]): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const g of groups) g.forEach((sid, i) => out.set(sid, roleIds[i] ?? null));
  return out;
}
