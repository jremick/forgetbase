import * as React from "react";
import { AlertContent, AlertDescription, AlertRoot, AlertTitle, HStack, Stack } from "@chakra-ui/react";

export type StatusAlertStatus = "message" | "error" | "info" | "success" | "warning";

type AlertStatus = NonNullable<React.ComponentProps<typeof AlertRoot>["status"]>;

export type StatusAlertProps = Omit<React.ComponentProps<typeof AlertRoot>, "status"> & {
  status?: StatusAlertStatus;
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
};

const statusToAlertStatus: Record<StatusAlertStatus, AlertStatus> = {
  message: "neutral",
  error: "error",
  info: "info",
  success: "success",
  warning: "warning"
};

export function StatusAlert({
  status = "message",
  title,
  description,
  actions,
  className,
  role,
  children,
  ...props
}: StatusAlertProps) {
  const alertRole = role ?? (status === "error" || status === "warning" ? "alert" : "status");

  return (
    <AlertRoot
      role={alertRole}
      status={statusToAlertStatus[status]}
      variant="surface"
      className={className}
      {...props}
    >
      <AlertContent>
        <Stack direction={{ base: "column", sm: "row" }} gap="2" align={{ base: "stretch", sm: "start" }} justify="space-between" minW="0">
          <Stack gap="1" minW="0">
            {title ? <AlertTitle>{title}</AlertTitle> : null}
            {description || children ? <AlertDescription>{description ?? children}</AlertDescription> : null}
          </Stack>
          {actions ? (
            <HStack gap="2" align="center" flexWrap="wrap">
              {actions}
            </HStack>
          ) : null}
        </Stack>
      </AlertContent>
    </AlertRoot>
  );
}
