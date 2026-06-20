import * as React from "react";
import { Box, HStack, Separator } from "@chakra-ui/react";

export type ToolbarProps = React.ComponentProps<"div"> & {
  leading?: React.ReactNode;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  divided?: boolean;
};

export function Toolbar({
  leading,
  filters,
  actions,
  divided = true,
  className,
  children,
  ...props
}: ToolbarProps) {
  return (
    <HStack
      gap="2"
      align="center"
      flexWrap="wrap"
      minW="0"
      rounded="md"
      borderWidth="1px"
      bg="bg.panel"
      p="2"
      className={className}
      {...props}
    >
      {leading ? (
        <HStack gap="2" align="center" flexWrap="wrap" minW="0">
          {leading}
        </HStack>
      ) : null}
      {leading && (filters || children) && divided ? (
        <Separator orientation="vertical" h="6" hideBelow="sm" />
      ) : null}
      {filters ? (
        <HStack gap="2" align="center" flex="1" flexWrap="wrap" minW="0">
          {filters}
        </HStack>
      ) : null}
      {children ? (
        <HStack gap="2" align="center" flex="1" flexWrap="wrap" minW="0">
          {children}
        </HStack>
      ) : null}
      {actions ? (
        <Box ms="auto">
          <HStack gap="2" align="center" justify="end" flexWrap="wrap">
            {actions}
          </HStack>
        </Box>
      ) : null}
    </HStack>
  );
}
