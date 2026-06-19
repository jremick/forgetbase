import * as React from "react";

import { Label } from "@/components/ui/label.js";
import { cn } from "@/lib/utils.js";

export type FormFieldProps = React.ComponentProps<"div"> & {
  label?: React.ReactNode;
  htmlFor?: string;
  helpText?: React.ReactNode;
  errorText?: React.ReactNode;
  required?: boolean;
  controlClassName?: string;
};

export function FormField({
  label,
  htmlFor,
  helpText,
  errorText,
  required,
  controlClassName,
  className,
  children,
  ...props
}: FormFieldProps) {
  return (
    <div className={cn("grid min-w-0 gap-2", className)} data-invalid={errorText ? "true" : undefined} {...props}>
      {label ? (
        <Label htmlFor={htmlFor}>
          {label}
          {required ? <span aria-hidden="true" className="text-destructive">*</span> : null}
        </Label>
      ) : null}
      <div className={cn("min-w-0", controlClassName)}>{children}</div>
      {helpText ? <p className="text-xs leading-5 text-muted-foreground">{helpText}</p> : null}
      {errorText ? <p className="text-xs font-medium leading-5 text-destructive">{errorText}</p> : null}
    </div>
  );
}
