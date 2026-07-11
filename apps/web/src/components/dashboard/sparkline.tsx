import type { CostSeriesLine } from "@opencode-dashboard/shared";

type SparklinePoint = { date: string; value: number };

function buildPath(points: SparklinePoint[], width: number, height: number) {
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min;

  return points
    .map((point, index) => {
      const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
      const y =
        spread === 0 ? height / 2 : height - 2 - ((point.value - min) / spread) * (height - 4);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function Sparkline({
  points,
  label,
  accent,
  className = "h-16 w-full",
}: {
  points: SparklinePoint[];
  label: string;
  accent: string;
  className?: string;
}) {
  if (points.length === 0) {
    return <div aria-label={`No ${label.toLowerCase()} data`} role="img" className={className} />;
  }

  const width = 320;
  const height = 64;
  const path = buildPath(points, width, height);

  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${width} ${height}`} className={className}>
      <title>{label}</title>
      <path
        d={`${path} L${width},${height} L0,${height} Z`}
        fill={`color-mix(in oklch, ${accent} 12%, transparent)`}
      />
      <path
        d={path}
        fill="none"
        stroke={accent}
        strokeWidth="2.5"
        strokeLinecap="square"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function LedgerSparkline({ line }: { line: CostSeriesLine | null }) {
  const points = line?.points.map((point) => ({ date: point.date, value: point.cost })) ?? [];

  return (
    <Sparkline
      points={points}
      label={line ? `${line.label} daily spend` : "No daily spend data"}
      accent="var(--accent)"
      className="h-8 w-full"
    />
  );
}
