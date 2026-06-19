"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils.js";

function Progress({ className, value, ...props }: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const boundedValue = Math.max(0, Math.min(100, numericValue));
  const progressValue = Math.round(boundedValue / 5) * 5;

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-primary/20", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        data-value={progressValue}
        className="h-full w-full flex-1 bg-primary transition-all"
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
