import * as React from "react";
import { Box, Heading, HStack, Stack, Text } from "@chakra-ui/react";

import { EmptyState } from "./empty-state.js";

export type DataTableShellProps = Omit<React.ComponentProps<"section">, "title"> & {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  isEmpty?: boolean;
  emptyState?: React.ReactNode;
  emptyTitle?: React.ReactNode;
  emptyDescription?: React.ReactNode;
  tableLabel?: string;
  contentClassName?: string;
};

export function DataTableShell({
  title,
  description,
  actions,
  isEmpty = false,
  emptyState,
  emptyTitle = "No records",
  emptyDescription,
  tableLabel,
  contentClassName,
  className,
  children,
  ...props
}: DataTableShellProps) {
  const headingId = React.useId();

  return (
    <Stack
      as="section"
      aria-label={title ? undefined : tableLabel}
      aria-labelledby={title ? headingId : undefined}
      gap="3"
      minW="0"
      className={className}
      {...props}
    >
      {title || description || actions ? (
        <Stack direction={{ base: "column", sm: "row" }} gap="2" align={{ base: "stretch", sm: "end" }} justify="space-between" minW="0">
          <Stack gap="1" minW="0">
            {title ? (
              <Heading as="h2" id={headingId} size="md">
                {title}
              </Heading>
            ) : null}
            {description ? (
              <Text color="fg.muted" textStyle="sm">
                {description}
              </Text>
            ) : null}
          </Stack>
          {actions ? (
            <HStack gap="2" align="center" flexWrap="wrap" flexShrink="0">
              {actions}
            </HStack>
          ) : null}
        </Stack>
      ) : null}
      <Box minW="0" overflow="hidden" rounded="md" borderWidth="1px" bg="bg.panel" className={contentClassName}>
        {isEmpty ? (
          <Box p="4">
            {emptyState ?? <EmptyState title={emptyTitle} description={emptyDescription} />}
          </Box>
        ) : (
          children
        )}
      </Box>
    </Stack>
  );
}
