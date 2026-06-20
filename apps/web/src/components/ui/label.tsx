"use client";

import * as React from "react";
import { chakraRuntime } from "../../theme/chakra-runtime.js";

function Label(props: React.ComponentProps<"label">) {
  const ChakraText = chakraRuntime.Text as React.ElementType;
  return <ChakraText as="label" data-slot="label" textStyle="sm" fontWeight="medium" {...props} />;
}

export { Label };
