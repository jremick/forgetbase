import * as React from "react";
import { chakraRuntime } from "../../theme/chakra-runtime.js";

const ChakraTextarea = chakraRuntime.Textarea as React.ElementType;

function Textarea(props: React.ComponentProps<"textarea">) {
  return <ChakraTextarea data-slot="textarea" size="md" {...props} />;
}

export { Textarea };
