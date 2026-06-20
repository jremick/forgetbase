import * as React from "react";
import { Badge, Box, CardBody, CardRoot, Heading, HStack, Stack, Text } from "@chakra-ui/react";

import type { BadgeVariant } from "@/components/ui/badge.js";

export type MetricCardBadge = {
  label: React.ReactNode;
  variant?: BadgeVariant;
};

export type MetricCardProps = React.ComponentProps<"div"> & {
  label: React.ReactNode;
  value: React.ReactNode;
  note?: React.ReactNode;
  badge?: React.ReactNode | MetricCardBadge;
  icon?: React.ReactNode;
};

function isMetricCardBadge(value: MetricCardProps["badge"]): value is MetricCardBadge {
  return Boolean(value && typeof value === "object" && !React.isValidElement(value) && "label" in value);
}

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

export function MetricCard({ label, value, note, badge, icon, className, ...props }: MetricCardProps) {
  return (
    <CardRoot minW="0" className={className} {...props}>
      <CardBody p="3">
        <Stack gap="2">
          <HStack align="start" justify="space-between" gap="2" minW="0">
            <Text color="fg.muted" fontWeight="medium" minW="0" textStyle="sm">
              {label}
            </Text>
            <HStack gap="2" align="center" flexShrink="0">
              {badge ? (
                isMetricCardBadge(badge) ? (
                  <Badge colorPalette={badgeColorPalette(badge.variant ?? "neutral")}>{badge.label}</Badge>
                ) : (
                  badge
                )
              ) : null}
              {icon ? (
                <Box color="fg.muted" fontSize="md" lineHeight="1">
                  {icon}
                </Box>
              ) : null}
            </HStack>
          </HStack>
          <Heading as="div" size="2xl" minW="0">
            {value}
          </Heading>
          {note ? (
            <Text color="fg.muted" textStyle="xs">
              {note}
            </Text>
          ) : null}
        </Stack>
      </CardBody>
    </CardRoot>
  );
}
