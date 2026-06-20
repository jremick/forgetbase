import * as React from "react";
import { Box, FieldErrorText, FieldHelperText, FieldLabel, FieldRequiredIndicator, FieldRoot } from "@chakra-ui/react";

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
    <FieldRoot invalid={Boolean(errorText)} required={required} gap="2" minW="0" className={className} {...props}>
      {label ? (
        <FieldLabel htmlFor={htmlFor}>
          {label}
          <FieldRequiredIndicator />
        </FieldLabel>
      ) : null}
      <Box minW="0" className={controlClassName}>
        {children}
      </Box>
      {helpText ? <FieldHelperText>{helpText}</FieldHelperText> : null}
      {errorText ? <FieldErrorText>{errorText}</FieldErrorText> : null}
    </FieldRoot>
  );
}
