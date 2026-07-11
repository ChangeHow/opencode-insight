import { formatDuration as formatDateFnsDuration, intervalToDuration } from "date-fns";
import { formatDateLabelInTimeZone, getCurrentTimeZone } from "@opencode-dashboard/shared";

const compactIntegerFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 0,
});
const compactDecimalFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCompactNumber(value: number) {
  return (value >= 1000 ? compactDecimalFormatter : compactIntegerFormatter).format(value);
}

export function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

export function formatDuration(valueMs: number) {
  const durationMs = Math.max(0, Math.round(valueMs / 1000) * 1000);
  const duration = intervalToDuration({ start: 0, end: durationMs });

  return formatDateFnsDuration(duration, { zero: false }) || "0 seconds";
}

export function formatCompactDuration(valueMs: number) {
  const totalSeconds = Math.max(0, Math.round(valueMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${totalSeconds % 60}s`;
  return `${totalSeconds}s`;
}

export function formatDateLabel(value: string) {
  if (!value) {
    return value || "—";
  }

  return (
    formatDateLabelInTimeZone(
      value,
      {
        month: "short",
        day: "numeric",
      },
      getCurrentTimeZone(),
    ) ?? value
  );
}

export function formatLongDateLabel(value: string) {
  if (!value) {
    return value || "—";
  }

  return (
    formatDateLabelInTimeZone(
      value,
      {
        weekday: "short",
        month: "long",
        day: "numeric",
        year: "numeric",
      },
      getCurrentTimeZone(),
    ) ?? value
  );
}

export function formatDateWithYearLabel(value: string) {
  if (!value) {
    return value || "—";
  }

  return (
    formatDateLabelInTimeZone(
      value,
      {
        month: "short",
        day: "numeric",
        year: "numeric",
      },
      getCurrentTimeZone(),
    ) ?? value
  );
}

export function formatDateSpan(start?: string, end?: string) {
  return start && end
    ? `${formatDateWithYearLabel(start)} - ${formatDateWithYearLabel(end)}`
    : "Selected range";
}
