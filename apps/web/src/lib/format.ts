import { formatDateLabelInTimeZone, getCurrentTimeZone } from "@opencode-dashboard/shared";

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
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
