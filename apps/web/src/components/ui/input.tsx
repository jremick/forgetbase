import * as React from "react";
import { chakraRuntime } from "../../theme/chakra-runtime.js";

const ChakraInput = chakraRuntime.Input as React.ElementType;

function Input(props: React.ComponentProps<"input">) {
  return <ChakraInput data-slot="input" size="md" {...props} />;
}

export { Input };
