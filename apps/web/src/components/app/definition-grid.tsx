import * as React from "react";
import { Box, Grid, Text } from "@chakra-ui/react";

export type DefinitionGridItem = {
  term: React.ReactNode;
  description: React.ReactNode;
  key?: React.Key;
  hidden?: boolean;
  className?: string;
};

export type DefinitionGridProps = React.ComponentProps<"dl"> & {
  items?: DefinitionGridItem[];
  compact?: boolean;
};

export function DefinitionGrid({ items, compact = false, className, children, ...props }: DefinitionGridProps) {
  const visibleItems = items?.filter((item) => !item.hidden);

  return (
    <Grid
      as="dl"
      templateColumns="repeat(auto-fit, minmax(min(100%, 180px), 1fr))"
      gap="1px"
      minW="0"
      overflow="hidden"
      rounded="md"
      borderWidth="1px"
      bg="border"
      textStyle={compact ? "xs" : "sm"}
      className={className}
      {...props}
    >
      {visibleItems
        ? visibleItems.map((item, index) => (
            <Box key={item.key ?? index} bg="bg.panel" minW="0" p="3" className={item.className}>
              <Text as="dt" color="fg.muted">
                {item.term}
              </Text>
              <Text as="dd" color="fg" fontWeight="medium" minW="0" overflowWrap="break-word">
                {item.description}
              </Text>
            </Box>
          ))
        : children}
    </Grid>
  );
}
