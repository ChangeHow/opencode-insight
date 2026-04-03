export function roundCost(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
