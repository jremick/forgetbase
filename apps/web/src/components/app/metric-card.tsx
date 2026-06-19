import * as React from "react";

import { Badge, type BadgeVariant } from "@/components/ui/badge.js";
import { Card, CardContent } from "@/components/ui/card.js";
import { cn } from "@/lib/utils.js";

export type MetricCardBadge = {
  label: React.ReactNode;
  variant?: BadgeVariant;
};

export type MetricCardProps = React.ComponentProps<typeof Card> & {
  label: React.ReactNode;
  value: React.ReactNode;
  note?: React.ReactNode;
  badge?: React.ReactNode | MetricCardBadge;
  icon?: React.ReactNode;
};

function isMetricCardBadge(value: MetricCardProps["badge"]): value is MetricCardBadge {
  return Boolean(value && typeof value === "object" && !React.isValidElement(value) && "label" in value);
}

export function MetricCard({ label, value, note, badge, icon, className, ...props }: MetricCardProps) {
  return (
    <Card className={cn("min-w-0 shadow-none", className)} {...props}>
      <CardContent className="grid gap-2 p-3">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 text-sm font-medium text-muted-foreground">{label}</div>
          <div className="flex shrink-0 items-center gap-2">
            {badge ? (
              isMetricCardBadge(badge) ? (
                <Badge variant={badge.variant ?? "neutral"}>{badge.label}</Badge>
              ) : (
                badge
              )
            ) : null}
            {icon ? <span className="text-muted-foreground [&_svg]:size-4">{icon}</span> : null}
          </div>
        </div>
        <div className="min-w-0 text-2xl font-semibold leading-tight text-foreground">{value}</div>
        {note ? <div className="text-xs leading-5 text-muted-foreground">{note}</div> : null}
      </CardContent>
    </Card>
  );
}
