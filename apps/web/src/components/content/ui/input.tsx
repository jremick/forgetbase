// Adapted from the official shadcn/ui new-york registry (MIT). Utilities use the fb prefix during Content migration.
import * as React from "react"

import { cn } from "../../../lib/utils.js"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "fb:flex fb:h-9 fb:w-full fb:rounded-md fb:border fb:border-input fb:bg-transparent fb:px-3 fb:py-1 fb:text-base fb:shadow-sm fb:transition-colors fb:file:border-0 fb:file:bg-transparent fb:file:text-sm fb:file:font-medium fb:file:text-foreground fb:placeholder:text-muted-foreground fb:focus-visible:outline-none fb:focus-visible:ring-1 fb:focus-visible:ring-ring fb:disabled:cursor-not-allowed fb:disabled:opacity-50 fb:md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
