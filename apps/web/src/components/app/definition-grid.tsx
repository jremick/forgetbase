import * as React from "react";

import { cn } from "@/lib/utils.js";

export type DefinitionGridItem = {
  term: React.ReactNode;
  description: React.ReactNode;
  key?: React.Key;
  hidden?: boolean;
  className?: string;
};

export type DefinitionGridProps = React.ComponentProps<"dl"> & {
  items?: DefinitionGridItem[];
  compact?: boolean;
};

export function DefinitionGrid({ items, compact = false, className, children, ...props }: DefinitionGridProps) {
  const visibleItems = items?.filter((item) => !item.hidden);

  return (
    <dl
      className={cn(
        "grid min-w-0 gap-px overflow-hidden rounded-md border border-border bg-border text-sm sm:grid-cols-2",
        compact && "text-xs",
        className
      )}
      {...props}
    >
      {visibleItems
        ? visibleItems.map((item, index) => (
            <div key={item.key ?? index} className={cn("grid min-w-0 gap-1 bg-card p-3", item.className)}>
              <dt className="text-muted-foreground">{item.term}</dt>
              <dd className="min-w-0 break-words font-medium text-card-foreground">{item.description}</dd>
            </div>
          ))
        : children}
    </dl>
  );
}
