import * as React from "react";

import { Separator } from "@/components/ui/separator.js";
import { cn } from "@/lib/utils.js";

export type ToolbarProps = React.ComponentProps<"div"> & {
  leading?: React.ReactNode;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  divided?: boolean;
};

export function Toolbar({
  leading,
  filters,
  actions,
  divided = true,
  className,
  children,
  ...props
}: ToolbarProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-border bg-card p-2 text-card-foreground",
        className
      )}
      {...props}
    >
      {leading ? <div className="flex min-w-0 flex-wrap items-center gap-2">{leading}</div> : null}
      {leading && (filters || children) && divided ? <Separator orientation="vertical" className="hidden h-6 sm:block" /> : null}
      {filters ? <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{filters}</div> : null}
      {children ? <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div> : null}
      {actions ? <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div> : null}
    </div>
  );
}
