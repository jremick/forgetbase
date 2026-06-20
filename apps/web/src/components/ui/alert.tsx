import * as React from "react";
import { chakraRuntime } from "../../theme/chakra-runtime.js";

const ChakraAlert = chakraRuntime.Alert as {
  Content: React.ElementType;
  Description: React.ElementType;
  Indicator: React.ElementType;
  Root: React.ElementType;
  Title: React.ElementType;
};

type AlertVariant = "default" | "destructive" | "info" | "success" | "warning";

type AlertProps = React.ComponentProps<"div"> & {
  variant?: AlertVariant | null;
};

function alertStatus(variant: AlertVariant | null | undefined) {
  if (variant === "destructive") return "error" as const;
  if (variant === "success") return "success" as const;
  if (variant === "warning") return "warning" as const;
  if (variant === "info") return "info" as const;
  return "neutral" as const;
}

function Alert({ variant, children, ...props }: AlertProps) {
  return (
    <ChakraAlert.Root role="alert" data-slot="alert" status={alertStatus(variant)} {...props}>
      <ChakraAlert.Indicator />
      <ChakraAlert.Content>{children}</ChakraAlert.Content>
    </ChakraAlert.Root>
  );
}

function AlertTitle(props: React.ComponentProps<"div">) {
  return <ChakraAlert.Title data-slot="alert-title" {...props} />;
}

function AlertDescription(props: React.ComponentProps<"div">) {
  return <ChakraAlert.Description data-slot="alert-description" {...props} />;
}

export { Alert, AlertTitle, AlertDescription };
