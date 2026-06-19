import * as React from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "@/components/ui/breadcrumb.js";
import { cn } from "@/lib/utils.js";

export type RouteHeaderBreadcrumb = {
  label: React.ReactNode;
  href?: string;
  onClick?: () => void;
  current?: boolean;
};

export type RouteHeaderProps = Omit<React.ComponentProps<"header">, "title"> & {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  lede?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: React.ReactNode | RouteHeaderBreadcrumb[];
  meta?: React.ReactNode;
};

function isBreadcrumbItems(value: RouteHeaderProps["breadcrumbs"]): value is RouteHeaderBreadcrumb[] {
  return Array.isArray(value);
}

function RouteHeaderBreadcrumbs({ breadcrumbs }: { breadcrumbs: React.ReactNode | RouteHeaderBreadcrumb[] }) {
  if (!isBreadcrumbItems(breadcrumbs)) {
    return <div className="min-w-0">{breadcrumbs}</div>;
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {breadcrumbs.map((item, index) => {
          const isCurrent = item.current ?? index === breadcrumbs.length - 1;
          const key = typeof item.label === "string" ? item.label : index;

          return (
            <React.Fragment key={key}>
              <BreadcrumbItem>
                {isCurrent ? (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                ) : item.onClick ? (
                  <BreadcrumbLink asChild>
                    <button
                      type="button"
                      className="rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      onClick={item.onClick}
                    >
                      {item.label}
                    </button>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbLink href={item.href ?? "#"}>{item.label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {index < breadcrumbs.length - 1 ? <BreadcrumbSeparator /> : null}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export function RouteHeader({
  eyebrow,
  title,
  lede,
  actions,
  breadcrumbs,
  meta,
  className,
  children,
  ...props
}: RouteHeaderProps) {
  return (
    <header className={cn("grid gap-3", className)} {...props}>
      {breadcrumbs ? <RouteHeaderBreadcrumbs breadcrumbs={breadcrumbs} /> : null}
      <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-1">
          {eyebrow ? <p className="text-xs font-medium text-muted-foreground uppercase tracking-normal">{eyebrow}</p> : null}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="min-w-0 text-2xl font-semibold leading-tight text-foreground">{title}</h1>
            {meta}
          </div>
          {lede ? <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{lede}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}
