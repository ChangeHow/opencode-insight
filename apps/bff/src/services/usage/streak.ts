import { shiftDateKey } from "@opencode-dashboard/shared";

export function computeStreak(days: string[]) {
  if (days.length === 0) {
    return { current: 0, longest: 0 };
  }
  const set = new Set(days);
  let longest = 0;
  for (const day of days) {
    const previousDay = shiftDateKey(day, -1);
    if (set.has(previousDay)) {
      continue;
    }
    let streak = 1;
    let cursor = day;
    while (set.has(shiftDateKey(cursor, 1))) {
      streak += 1;
      cursor = shiftDateKey(cursor, 1);
    }
    longest = Math.max(longest, streak);
  }
  let current = 0;
  let cursor = days[days.length - 1];
  while (set.has(cursor)) {
    current += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return { current, longest };
}
