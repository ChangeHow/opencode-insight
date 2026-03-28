import { ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface MetricCardProps {
  eyebrow: string;
  value: string;
  detail: string;
}

export function MetricCard({ eyebrow, value, detail }: MetricCardProps) {
  return (
    <Card className="bg-[var(--panel-strong)]">
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
          <span>{eyebrow}</span>
          <ArrowUpRight className="size-4" />
        </div>
        <div className="space-y-2">
          <p className="font-[Newsreader_Variable] text-4xl leading-none text-[var(--foreground)] sm:text-5xl">
            {value}
          </p>
          <p className="max-w-[18rem] text-sm leading-6 text-[var(--muted-foreground)]">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}
