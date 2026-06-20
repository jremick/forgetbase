"use client";

import * as React from "react";
import { chakraRuntime } from "../../theme/chakra-runtime.js";

const ChakraProgress = chakraRuntime.Progress as {
  Range: React.ElementType;
  Root: React.ElementType;
  Track: React.ElementType;
};

function Progress({ value, ...props }: React.ComponentProps<"div"> & { value?: number | null }) {
  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const boundedValue = Math.max(0, Math.min(100, numericValue));

  return (
    <ChakraProgress.Root data-slot="progress" colorPalette="brand" value={boundedValue} {...props}>
      <ChakraProgress.Track>
        <ChakraProgress.Range data-slot="progress-indicator" />
      </ChakraProgress.Track>
    </ChakraProgress.Root>
  );
}

export { Progress };
