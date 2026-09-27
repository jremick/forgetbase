// Adapted from the official shadcn/ui new-york registry (MIT). Utilities use the fb prefix during Content migration.
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../../lib/utils.js"

const buttonVariants = cva(
  "fb:inline-flex fb:items-center fb:justify-center fb:gap-2 fb:whitespace-nowrap fb:rounded-md fb:text-sm fb:font-medium fb:transition-colors fb:focus-visible:outline-none fb:focus-visible:ring-1 fb:focus-visible:ring-ring fb:disabled:pointer-events-none fb:disabled:opacity-50 fb:[&_svg]:pointer-events-none fb:[&_svg]:size-4 fb:[&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "fb:bg-primary fb:text-primary-foreground fb:shadow fb:hover:bg-primary/90",
        destructive:
          "fb:bg-destructive fb:text-destructive-foreground fb:shadow-sm fb:hover:bg-destructive/90",
        outline:
          "fb:border fb:border-input fb:bg-background fb:shadow-sm fb:hover:bg-accent fb:hover:text-accent-foreground",
        secondary:
          "fb:bg-secondary fb:text-secondary-foreground fb:shadow-sm fb:hover:bg-secondary/80",
        ghost: "fb:hover:bg-accent fb:hover:text-accent-foreground",
        link: "fb:text-primary fb:underline-offset-4 fb:hover:underline",
      },
      size: {
        default: "fb:h-9 fb:px-4 fb:py-2",
        sm: "fb:h-8 fb:rounded-md fb:px-3 fb:text-xs",
        lg: "fb:h-10 fb:rounded-md fb:px-8",
        icon: "fb:h-9 fb:w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
