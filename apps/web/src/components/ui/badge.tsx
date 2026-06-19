import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils.js";

const badgeVariants = cva("ui-badge", {
  variants: {
    variant: {
      default: "ui-badge-default",
      success: "ui-badge-success",
      warning: "ui-badge-warning",
      destructive: "ui-badge-destructive",
      info: "ui-badge-info",
      neutral: "ui-badge-neutral",
      "sensitivity-public": "ui-badge-sensitivity-public",
      "sensitivity-internal": "ui-badge-sensitivity-internal",
      "sensitivity-restricted": "ui-badge-sensitivity-restricted",
      "sensitivity-confidential": "ui-badge-sensitivity-confidential",
      "sensitivity-secret": "ui-badge-sensitivity-secret"
    }
  },
  defaultVariants: {
    variant: "default"
  }
});

export type BadgeProps = React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>;
export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}

export { Badge, badgeVariants };
