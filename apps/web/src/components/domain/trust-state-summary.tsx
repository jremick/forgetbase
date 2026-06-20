import * as React from "react";
import {
  AlertContent,
  AlertDescription,
  AlertRoot,
  AlertTitle,
  Badge,
  CardBody,
  CardRoot,
  Heading,
  HStack,
  Stack
} from "@chakra-ui/react";

import type { BadgeVariant } from "@/components/ui/badge.js";

export type TrustState = "trusted" | "needs-review" | "restricted" | "blocked" | "unknown";

export type TrustStateSignal = {
  label: React.ReactNode;
  variant?: BadgeVariant;
};

type AlertStatus = NonNullable<React.ComponentProps<typeof AlertRoot>["status"]>;

export type TrustStateSummaryProps = Omit<React.ComponentProps<"div">, "title"> & {
  state?: TrustState;
  label?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  signals?: TrustStateSignal[];
  actions?: React.ReactNode;
};

const trustStateConfig: Record<TrustState, { label: string; badge: BadgeVariant; alert: AlertStatus }> = {
  trusted: {
    label: "Trusted",
    badge: "success",
    alert: "success"
  },
  "needs-review": {
    label: "Needs review",
    badge: "warning",
    alert: "warning"
  },
  restricted: {
    label: "Restricted",
    badge: "info",
    alert: "info"
  },
  blocked: {
    label: "Blocked",
    badge: "destructive",
    alert: "error"
  },
  unknown: {
    label: "Unknown",
    badge: "neutral",
    alert: "neutral"
  }
};

function badgeColorPalette(variant?: BadgeVariant) {
  switch (variant) {
    case "success":
    case "sensitivity-public":
      return "green";
    case "warning":
    case "sensitivity-restricted":
      return "yellow";
    case "destructive":
    case "sensitivity-confidential":
    case "sensitivity-secret":
      return "red";
    case "info":
    case "sensitivity-internal":
      return "teal";
    case "default":
      return "brand";
    case "neutral":
    default:
      return "gray";
  }
}

export function TrustStateSummary({
  state = "unknown",
  label,
  title,
  description,
  signals,
  actions,
  className,
  children,
  ...props
}: TrustStateSummaryProps) {
  const config = trustStateConfig[state];

  return (
    <CardRoot className={className} {...props}>
      <CardBody p="4">
        <Stack gap="3">
          <Stack direction={{ base: "column", sm: "row" }} gap="2" align={{ base: "stretch", sm: "start" }} justify="space-between" minW="0">
            <Stack gap="1" minW="0">
              <HStack gap="2" align="center" flexWrap="wrap" minW="0">
                <Badge colorPalette={badgeColorPalette(config.badge)}>{label ?? config.label}</Badge>
                {signals?.map((signal, index) => (
                  <Badge key={index} colorPalette={badgeColorPalette(signal.variant ?? "neutral")}>
                    {signal.label}
                  </Badge>
                ))}
              </HStack>
              {title ? (
                <Heading as="h3" size="sm">
                  {title}
                </Heading>
              ) : null}
            </Stack>
            {actions ? (
              <HStack gap="2" align="center" flexWrap="wrap" flexShrink="0">
                {actions}
              </HStack>
            ) : null}
          </Stack>
          {description || children ? (
            <AlertRoot status={config.alert} variant="surface" role={state === "blocked" ? "alert" : "status"}>
              <AlertContent>
                <AlertTitle>{config.label}</AlertTitle>
                <AlertDescription>{description ?? children}</AlertDescription>
              </AlertContent>
            </AlertRoot>
          ) : null}
        </Stack>
      </CardBody>
    </CardRoot>
  );
}
