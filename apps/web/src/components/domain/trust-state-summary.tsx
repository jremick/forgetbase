import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.js";
import { Badge, type BadgeVariant } from "@/components/ui/badge.js";
import { Card, CardContent } from "@/components/ui/card.js";
import { cn } from "@/lib/utils.js";

export type TrustState = "trusted" | "needs-review" | "restricted" | "blocked" | "unknown";

export type TrustStateSignal = {
  label: React.ReactNode;
  variant?: BadgeVariant;
};

type AlertVariant = NonNullable<React.ComponentProps<typeof Alert>["variant"]>;

export type TrustStateSummaryProps = Omit<React.ComponentProps<typeof Card>, "title"> & {
  state?: TrustState;
  label?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  signals?: TrustStateSignal[];
  actions?: React.ReactNode;
};

const trustStateConfig: Record<TrustState, { label: string; badge: BadgeVariant; alert: AlertVariant }> = {
  trusted: {
    label: "Trusted",
    badge: "success",
    alert: "success"
  },
  "needs-review": {
    label: "Needs review",
    badge: "warning",
    alert: "warning"
  },
  restricted: {
    label: "Restricted",
    badge: "info",
    alert: "info"
  },
  blocked: {
    label: "Blocked",
    badge: "destructive",
    alert: "destructive"
  },
  unknown: {
    label: "Unknown",
    badge: "neutral",
    alert: "default"
  }
};

export function TrustStateSummary({
  state = "unknown",
  label,
  title,
  description,
  signals,
  actions,
  className,
  children,
  ...props
}: TrustStateSummaryProps) {
  const config = trustStateConfig[state];

  return (
    <Card className={cn("shadow-none", className)} {...props}>
      <CardContent className="grid gap-3 p-4">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge variant={config.badge}>{label ?? config.label}</Badge>
              {signals?.map((signal, index) => (
                <Badge key={index} variant={signal.variant ?? "neutral"}>
                  {signal.label}
                </Badge>
              ))}
            </div>
            {title ? <h3 className="text-sm font-semibold text-foreground">{title}</h3> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
        {description || children ? (
          <Alert variant={config.alert} role={state === "blocked" ? "alert" : "status"}>
            <div className="col-start-2 min-w-0 space-y-1">
              <AlertTitle>{config.label}</AlertTitle>
              <AlertDescription>{description ?? children}</AlertDescription>
            </div>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
