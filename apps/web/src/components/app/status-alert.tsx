import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.js";
import { cn } from "@/lib/utils.js";

export type StatusAlertStatus = "message" | "error" | "info" | "success" | "warning";

type AlertVariant = NonNullable<React.ComponentProps<typeof Alert>["variant"]>;

export type StatusAlertProps = Omit<React.ComponentProps<typeof Alert>, "variant"> & {
  status?: StatusAlertStatus;
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
};

const statusToAlertVariant: Record<StatusAlertStatus, AlertVariant> = {
  message: "default",
  error: "destructive",
  info: "info",
  success: "success",
  warning: "warning"
};

export function StatusAlert({
  status = "message",
  title,
  description,
  actions,
  className,
  role,
  children,
  ...props
}: StatusAlertProps) {
  const alertRole = role ?? (status === "error" || status === "warning" ? "alert" : "status");

  return (
    <Alert
      role={alertRole}
      variant={statusToAlertVariant[status]}
      className={cn(actions && "items-start", className)}
      {...props}
    >
      <div className="col-start-2 grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0 space-y-1">
          {title ? <AlertTitle>{title}</AlertTitle> : null}
          {description || children ? <AlertDescription>{description ?? children}</AlertDescription> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </Alert>
  );
}
