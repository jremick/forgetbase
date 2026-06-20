import * as React from "react";
import { chakraRuntime } from "../../theme/chakra-runtime.js";

const ChakraSelect = (chakraRuntime.chakra as { select?: React.ElementType } | undefined)?.select ?? "select";

function NativeSelect(props: React.ComponentProps<"select">) {
  return (
    <ChakraSelect
      data-slot="native-select"
      minH="control"
      width="full"
      borderWidth="1px"
      borderRadius="md"
      paddingInline="3"
      fontSize="sm"
      _focusVisible={{ borderColor: "brand.500", boxShadow: "0 0 0 3px color-mix(in srgb, var(--chakra-colors-brand-500) 25%, transparent)" }}
      {...props}
    />
  );
}

export { NativeSelect };
