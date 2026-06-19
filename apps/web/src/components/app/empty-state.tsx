import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.js";
import { Card, CardContent } from "@/components/ui/card.js";
import { cn } from "@/lib/utils.js";

export type EmptyStateVariant = "plain" | "card" | "alert";
export type EmptyStateStatus = "default" | "info" | "success" | "warning" | "destructive";

type AlertVariant = NonNullable<React.ComponentProps<typeof Alert>["variant"]>;

export type EmptyStateProps = Omit<React.ComponentProps<"div">, "title"> & {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  variant?: EmptyStateVariant;
  status?: EmptyStateStatus;
};

const emptyStateAlertVariant: Record<EmptyStateStatus, AlertVariant> = {
  default: "default",
  info: "info",
  success: "success",
  warning: "warning",
  destructive: "destructive"
};

function EmptyStateBody({
  icon,
  title,
  description,
  actions
}: Pick<EmptyStateProps, "icon" | "title" | "description" | "actions">) {
  return (
    <div className="grid justify-items-center gap-3 text-center">
      {icon ? <div className="text-muted-foreground [&_svg]:size-6">{icon}</div> : null}
      <div className="grid gap-1">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description ? <p className="max-w-md text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center justify-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  actions,
  variant = "plain",
  status = "default",
  className,
  ...props
}: EmptyStateProps) {
  if (variant === "alert") {
    return (
      <Alert
        variant={emptyStateAlertVariant[status]}
        className={cn("items-start", className)}
        role={status === "destructive" || status === "warning" ? "alert" : "status"}
        {...props}
      >
        <div className="col-start-2 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-2">
            {icon ? <span className="shrink-0 [&_svg]:size-4">{icon}</span> : null}
            <div className="min-w-0 space-y-1">
              <AlertTitle>{title}</AlertTitle>
              {description ? <AlertDescription>{description}</AlertDescription> : null}
            </div>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </Alert>
    );
  }

  if (variant === "card") {
    return (
      <Card className={cn("shadow-none", className)} {...props}>
        <CardContent className="p-6">
          <EmptyStateBody icon={icon} title={title} description={description} actions={actions} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn("rounded-md border border-dashed border-border p-6", className)} {...props}>
      <EmptyStateBody icon={icon} title={title} description={description} actions={actions} />
    </div>
  );
}
