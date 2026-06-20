import * as React from "react";
import { chakraRuntime } from "../../theme/chakra-runtime.js";

const ChakraSkeleton = chakraRuntime.Skeleton as React.ElementType;

function Skeleton(props: React.ComponentProps<"div">) {
  return <ChakraSkeleton data-slot="skeleton" {...props} />;
}

export { Skeleton };
