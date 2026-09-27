// Adapted from the official shadcn/ui new-york registry (MIT). Utilities use the fb prefix during Content migration.
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../../lib/utils.js"

const badgeVariants = cva(
  "fb:inline-flex fb:items-center fb:rounded-md fb:border fb:px-2.5 fb:py-0.5 fb:text-xs fb:font-semibold fb:transition-colors fb:focus:outline-none fb:focus:ring-2 fb:focus:ring-ring fb:focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "fb:border-transparent fb:bg-primary fb:text-primary-foreground fb:shadow fb:hover:bg-primary/80",
        secondary:
          "fb:border-transparent fb:bg-secondary fb:text-secondary-foreground fb:hover:bg-secondary/80",
        destructive:
          "fb:border-transparent fb:bg-destructive fb:text-destructive-foreground fb:shadow fb:hover:bg-destructive/80",
        outline: "fb:text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
