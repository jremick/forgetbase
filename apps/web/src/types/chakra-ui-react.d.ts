declare module "@chakra-ui/react" {
  import type * as React from "react";

  export const Alert: {
    Content: React.ElementType;
    Description: React.ElementType;
    Indicator: React.ElementType;
    Root: React.ElementType;
    Title: React.ElementType;
  };
  export const AlertContent: React.ElementType;
  export const AlertDescription: React.ElementType;
  export const AlertIndicator: React.ElementType;
  export const AlertRoot: React.ElementType;
  export const AlertTitle: React.ElementType;
  export const Badge: React.ElementType;
  export const Box: React.ElementType;
  export const Breadcrumb: {
    CurrentLink: React.ElementType;
    Item: React.ElementType;
    Link: React.ElementType;
    List: React.ElementType;
    Root: React.ElementType;
    Separator: React.ElementType;
  };
  export const BreadcrumbCurrentLink: React.ElementType;
  export const BreadcrumbItem: React.ElementType;
  export const BreadcrumbLink: React.ElementType;
  export const BreadcrumbList: React.ElementType;
  export const BreadcrumbRoot: React.ElementType;
  export const BreadcrumbSeparator: React.ElementType;
  export const Button: React.ElementType;
  export const Card: {
    Body: React.ElementType;
    Description: React.ElementType;
    Footer: React.ElementType;
    Header: React.ElementType;
    Root: React.ElementType;
    Title: React.ElementType;
  };
  export const CardBody: React.ElementType;
  export const CardDescription: React.ElementType;
  export const CardFooter: React.ElementType;
  export const CardHeader: React.ElementType;
  export const CardRoot: React.ElementType;
  export const CardTitle: React.ElementType;
  export const Field: {
    ErrorText: React.ElementType;
    HelperText: React.ElementType;
    Label: React.ElementType;
    RequiredIndicator: React.ElementType;
    Root: React.ElementType;
  };
  export const FieldErrorText: React.ElementType;
  export const FieldHelperText: React.ElementType;
  export const FieldLabel: React.ElementType;
  export const FieldRequiredIndicator: React.ElementType;
  export const FieldRoot: React.ElementType;
  export const Grid: React.ElementType;
  export const Heading: React.ElementType;
  export const HStack: React.ElementType;
  export const Input: React.ElementType;
  export const Progress: {
    Range: React.ElementType;
    Root: React.ElementType;
    Track: React.ElementType;
  };
  export const Separator: React.ElementType;
  export const SimpleGrid: React.ElementType;
  export const Skeleton: React.ElementType;
  export const Stack: React.ElementType;
  export const Table: {
    Body: React.ElementType;
    Caption: React.ElementType;
    Cell: React.ElementType;
    ColumnHeader: React.ElementType;
    Footer: React.ElementType;
    Header: React.ElementType;
    Root: React.ElementType;
    Row: React.ElementType;
    ScrollArea: React.ElementType;
  };
  export const Text: React.ElementType;
  export const Textarea: React.ElementType;
  export const chakra: {
    select: React.ElementType;
  };
}

declare module "@chakra-ui/react/preset" {
  export const defaultConfig: Record<string, unknown>;
}

declare module "@chakra-ui/react/styled-system" {
  import type * as React from "react";

  type SystemConfig = Record<string, unknown>;
  type SystemContext = Record<string, unknown>;

  export const ChakraProvider: React.ElementType<{
    value: SystemContext;
    children: React.ReactNode;
  }>;
  export const chakra: {
    select: React.ElementType;
  };
  export const createSystem: (...configs: SystemConfig[]) => SystemContext;
  export const defineConfig: (config: SystemConfig) => SystemConfig;
}
