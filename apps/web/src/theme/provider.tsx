import * as Chakra from "@chakra-ui/react";
import type { ReactNode } from "react";
import { system } from "./system.js";

type ChakraProviderProps = {
  value: unknown;
  children: ReactNode;
};

const { ChakraProvider } = Chakra as typeof Chakra & {
  ChakraProvider: (props: ChakraProviderProps) => ReactNode;
};

type ProviderProps = {
  children: ReactNode;
};

export function Provider({ children }: ProviderProps) {
  return <ChakraProvider value={system}>{children}</ChakraProvider>;
}
