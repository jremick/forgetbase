import * as React from "react";

import { cn } from "@/lib/utils.js";

import { EmptyState } from "./empty-state.js";

export type DataTableShellProps = Omit<React.ComponentProps<"section">, "title"> & {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  isEmpty?: boolean;
  emptyState?: React.ReactNode;
  emptyTitle?: React.ReactNode;
  emptyDescription?: React.ReactNode;
  tableLabel?: string;
  contentClassName?: string;
};

export function DataTableShell({
  title,
  description,
  actions,
  isEmpty = false,
  emptyState,
  emptyTitle = "No records",
  emptyDescription,
  tableLabel,
  contentClassName,
  className,
  children,
  ...props
}: DataTableShellProps) {
  const headingId = React.useId();

  return (
    <section
      aria-label={title ? undefined : tableLabel}
      aria-labelledby={title ? headingId : undefined}
      className={cn("grid min-w-0 gap-3", className)}
      {...props}
    >
      {title || description || actions ? (
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-1">
            {title ? (
              <h2 id={headingId} className="text-base font-semibold leading-none text-foreground">
                {title}
              </h2>
            ) : null}
            {description ? <p className="text-sm leading-6 text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn("min-w-0 overflow-hidden rounded-md border border-border bg-card", contentClassName)}>
        {isEmpty ? (
          <div className="p-4">
            {emptyState ?? <EmptyState title={emptyTitle} description={emptyDescription} />}
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
