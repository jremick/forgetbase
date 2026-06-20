import * as React from "react";
import { chakraRuntime } from "../../theme/chakra-runtime.js";

const ChakraCard = chakraRuntime.Card as {
  Body: React.ElementType;
  Description: React.ElementType;
  Footer: React.ElementType;
  Header: React.ElementType;
  Root: React.ElementType;
  Title: React.ElementType;
};

function Card(props: React.ComponentProps<"div">) {
  return <ChakraCard.Root data-slot="card" variant="outline" {...props} />;
}

function CardHeader(props: React.ComponentProps<"div">) {
  return <ChakraCard.Header data-slot="card-header" {...props} />;
}

function CardTitle(props: React.ComponentProps<"div">) {
  return <ChakraCard.Title as="div" data-slot="card-title" {...props} />;
}

function CardDescription(props: React.ComponentProps<"div">) {
  return <ChakraCard.Description data-slot="card-description" {...props} />;
}

function CardAction(props: React.ComponentProps<"div">) {
  return <div data-slot="card-action" {...props} />;
}

function CardContent(props: React.ComponentProps<"div">) {
  return <ChakraCard.Body data-slot="card-content" {...props} />;
}

function CardFooter(props: React.ComponentProps<"div">) {
  return <ChakraCard.Footer data-slot="card-footer" {...props} />;
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
