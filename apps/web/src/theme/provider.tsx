import { ChakraProvider } from "@chakra-ui/react/styled-system";
import type { ReactNode } from "react";
import { system } from "./system.js";

type ProviderProps = {
  children: ReactNode;
};

export function Provider({ children }: ProviderProps) {
  return <ChakraProvider value={system}>{children}</ChakraProvider>;
}
