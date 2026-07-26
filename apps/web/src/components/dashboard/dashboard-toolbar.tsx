import { useState } from "react";
import { useAtom } from "jotai";
import { Link } from "@tanstack/react-router";
import { Cloud, Laptop, MoonStar, RefreshCcw, SunMedium } from "lucide-react";
import type { RemoteUsagePayload, TimeRange } from "@opencode-dashboard/shared";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RangePicker } from "@/components/dashboard/range-picker";
import { themeAtom } from "@/lib/atoms";

const THEME_ITEMS = [
  { value: "light" as const, label: "Light", icon: SunMedium },
  { value: "dark" as const, label: "Dark", icon: MoonStar },
  { value: "system" as const, label: "System", icon: Laptop },
];

export function ControlBar({
  currentView,
  range,
  setRange,
  scannedAt,
  onRefresh,
  onForceRemoteSync,
  canRefresh = false,
  remoteUsage,
  remoteSyncing = false,
  remoteSyncStatus,
}: {
  currentView: "overview" | "providers";
  range: TimeRange;
  setRange: (range: TimeRange) => void;
  scannedAt?: string;
  onRefresh: () => Promise<void>;
  onForceRemoteSync: () => Promise<void>;
  canRefresh?: boolean;
  remoteUsage?: RemoteUsagePayload | null;
  remoteSyncing?: boolean;
  remoteSyncStatus?: string | null;
}) {
  const [theme, setTheme] = useAtom(themeAtom);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="grid gap-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <nav
          aria-label="Dashboard views"
          className="flex h-10 min-w-0 rounded-[10px] border border-[var(--border)] bg-[var(--panel)] p-1"
        >
          {(["overview", "providers"] as const).map((view) => (
            <Link
              key={view}
              to={`/${view}`}
              aria-current={currentView === view ? "page" : undefined}
              className={`inline-flex h-full items-center rounded-[8px] px-3 text-xs font-semibold capitalize outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
                currentView === view
                  ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--interactive-hover)] hover:text-[var(--foreground)]"
              }`}
            >
              {view}
            </Link>
          ))}
        </nav>

        <p className="ml-auto hidden text-right text-xs text-[var(--muted-foreground)] lg:block">
          Last scan
          <span className="ml-2 font-semibold text-[var(--foreground)]">
            {scannedAt ? new Date(scannedAt).toLocaleTimeString("en-US") : "Loading"}
          </span>
        </p>
        <ThemeToggleButton theme={theme} onChange={setTheme} compact />
        <HeaderRefreshButton
          canRefresh={canRefresh}
          refreshing={refreshing}
          disabledReason="Refresh is available when the range includes today."
          onRefresh={refresh}
        />
        <RemoteSyncButton
          remote={remoteUsage}
          syncing={remoteSyncing}
          status={remoteSyncStatus}
          onSync={onForceRemoteSync}
        />
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <RangePicker className="w-full shrink-0 sm:w-max" value={range} onChange={setRange} />
        <p
          aria-live="polite"
          className="ml-auto hidden max-w-72 truncate text-[10px] text-[var(--muted-foreground)] sm:block"
        >
          {remoteSyncStatus ?? getRemoteStateLabel(remoteUsage)}
        </p>
      </div>
    </div>
  );
}

function RemoteSyncButton({
  remote,
  syncing,
  status,
  onSync,
}: {
  remote?: RemoteUsagePayload | null;
  syncing: boolean;
  status?: string | null;
  onSync: () => Promise<void>;
}) {
  const state = status ?? getRemoteStateLabel(remote);
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-10"
      onClick={onSync}
      disabled={syncing || remote?.enabled === false}
      aria-label={`${syncing ? "Syncing" : "Sync"} Cloudflare Remote. ${state}`}
      title={state}
    >
      <Cloud className={`size-4 ${syncing ? "animate-pulse" : ""}`} />
      <span className="hidden sm:inline">{syncing ? "Syncing" : "Remote"}</span>
    </Button>
  );
}

function getRemoteStateLabel(remote?: RemoteUsagePayload | null) {
  if (!remote) return "Remote loading";
  if (!remote.enabled) return "Remote disabled";
  if (remote.status === "stale") return remote.error ?? "Remote unavailable";
  return remote.lastFetchedAt
    ? `Pulled ${new Date(remote.lastFetchedAt).toLocaleTimeString("en-US")}`
    : "Remote ready";
}

export function HeaderRefreshButton({
  canRefresh,
  refreshing,
  disabledReason,
  onRefresh,
}: {
  canRefresh: boolean;
  refreshing: boolean;
  disabledReason: string;
  onRefresh: () => void | Promise<void>;
}) {
  const button = (
    <Button
      variant="outline"
      size="sm"
      className="h-10"
      onClick={onRefresh}
      disabled={!canRefresh || refreshing}
      aria-label={refreshing ? "Refreshing usage" : "Refresh usage"}
    >
      <RefreshCcw className={`size-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
      <span className="hidden sm:inline">Refresh</span>
    </Button>
  );

  if (canRefresh) return button;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>{button}</span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{disabledReason}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ThemeToggleButton({
  theme,
  onChange,
  compact = false,
}: {
  theme: "light" | "dark" | "system";
  onChange: (theme: "light" | "dark" | "system") => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const active = THEME_ITEMS.find((item) => item.value === theme) ?? THEME_ITEMS[2];
  const ActiveIcon = active.icon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Theme mode (${active.label})`}
          className={compact ? "size-10 p-0" : "h-10"}
        >
          <ActiveIcon className={compact ? "size-[20px] shrink-0" : "size-4"} />
          {compact ? null : active.label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-40 p-1.5" align="end">
        {THEME_ITEMS.map((item) => {
          const ItemIcon = item.icon;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                onChange(item.value);
                setOpen(false);
              }}
              className={`flex h-10 w-full items-center gap-2 px-3 text-sm outline-none transition ${
                item.value === theme
                  ? "bg-[var(--accent-soft)] font-semibold text-[var(--foreground)]"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--interactive-hover)]"
              }`}
            >
              <ItemIcon className="size-4" />
              {item.label}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
