"use client";

import * as React from "react";
import { chakraRuntime } from "../../theme/chakra-runtime.js";

const ChakraSeparator = chakraRuntime.Separator as React.ElementType;

function Separator({
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<"span"> & { decorative?: boolean; orientation?: "horizontal" | "vertical" }) {
  return <ChakraSeparator data-slot="separator" aria-hidden={decorative || undefined} orientation={orientation} {...props} />;
}

export { Separator };
