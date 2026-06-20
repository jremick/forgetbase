import * as React from "react";
import {
  AlertContent,
  AlertDescription,
  AlertIndicator,
  AlertRoot,
  AlertTitle,
  Box,
  CardBody,
  CardRoot,
  Heading,
  Stack,
  Text
} from "@chakra-ui/react";

export type EmptyStateVariant = "plain" | "card" | "alert";
export type EmptyStateStatus = "default" | "info" | "success" | "warning" | "destructive";

type AlertStatus = NonNullable<React.ComponentProps<typeof AlertRoot>["status"]>;

export type EmptyStateProps = Omit<React.ComponentProps<typeof Box>, "title"> & {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  variant?: EmptyStateVariant;
  status?: EmptyStateStatus;
};

const emptyStateAlertStatus: Record<EmptyStateStatus, AlertStatus> = {
  default: "neutral",
  info: "info",
  success: "success",
  warning: "warning",
  destructive: "error"
};

function EmptyStateBody({
  icon,
  title,
  description,
  actions
}: Pick<EmptyStateProps, "icon" | "title" | "description" | "actions">) {
  return (
    <Stack align="center" gap="3" textAlign="center">
      {icon ? (
        <Box color="fg.muted" fontSize="xl" lineHeight="1">
          {icon}
        </Box>
      ) : null}
      <Stack gap="1" align="center">
        <Heading as="h3" size="sm">
          {title}
        </Heading>
        {description ? (
          <Text color="fg.muted" maxW="md" textStyle="sm">
            {description}
          </Text>
        ) : null}
      </Stack>
      {actions ? (
        <Stack direction="row" gap="2" align="center" justify="center" flexWrap="wrap">
          {actions}
        </Stack>
      ) : null}
    </Stack>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  actions,
  variant = "plain",
  status = "default",
  className,
  ...props
}: EmptyStateProps) {
  if (variant === "alert") {
    return (
      <AlertRoot
        status={emptyStateAlertStatus[status]}
        variant="surface"
        className={className}
        role={status === "destructive" || status === "warning" ? "alert" : "status"}
        {...props}
      >
        {icon ? <AlertIndicator>{icon}</AlertIndicator> : null}
        <AlertContent>
          <Stack direction={{ base: "column", sm: "row" }} gap="3" align={{ base: "stretch", sm: "start" }} justify="space-between">
            <Stack gap="1" minW="0">
              <AlertTitle>{title}</AlertTitle>
              {description ? <AlertDescription>{description}</AlertDescription> : null}
            </Stack>
            {actions ? (
              <Stack direction="row" gap="2" align="center" flexWrap="wrap">
                {actions}
              </Stack>
            ) : null}
          </Stack>
        </AlertContent>
      </AlertRoot>
    );
  }

  if (variant === "card") {
    return (
      <CardRoot className={className} {...props}>
        <CardBody p="6">
          <EmptyStateBody icon={icon} title={title} description={description} actions={actions} />
        </CardBody>
      </CardRoot>
    );
  }

  return (
    <Box borderWidth="1px" borderStyle="dashed" rounded="md" p="6" className={className} {...props}>
      <EmptyStateBody icon={icon} title={title} description={description} actions={actions} />
    </Box>
  );
}
