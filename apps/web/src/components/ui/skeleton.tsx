import * as React from "react";
import * as chakraRuntime from "@chakra-ui/react/skeleton";

const ChakraSkeleton = chakraRuntime.Skeleton as React.ElementType;

function Skeleton(props: React.ComponentProps<"div">) {
  return <ChakraSkeleton data-slot="skeleton" {...props} />;
}

export { Skeleton };
