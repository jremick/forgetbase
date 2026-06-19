import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils.js";

const badgeVariants = cva(
  "inline-flex min-h-6 w-fit max-w-full shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        success: "border-success bg-success text-success-foreground",
        warning: "border-warning bg-warning text-warning-foreground",
        destructive: "border-destructive/30 bg-destructive/10 text-destructive",
        info: "border-info bg-info text-info-foreground",
        neutral: "border-border bg-muted text-muted-foreground",
        "sensitivity-public": "border-success bg-success text-success-foreground",
        "sensitivity-internal": "border-info bg-info text-info-foreground",
        "sensitivity-restricted": "border-warning bg-warning text-warning-foreground",
        "sensitivity-confidential": "border-destructive/30 bg-destructive/10 text-destructive",
        "sensitivity-secret": "border-destructive bg-destructive text-destructive-foreground"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export type BadgeProps = React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>;
export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      data-variant={variant ?? "default"}
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
