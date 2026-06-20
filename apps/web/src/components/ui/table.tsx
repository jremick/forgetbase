"use client";

import * as React from "react";
import { chakraRuntime } from "../../theme/chakra-runtime.js";

const ChakraTable = chakraRuntime.Table as {
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

function Table(props: React.ComponentProps<"table">) {
  return (
    <ChakraTable.ScrollArea data-slot="table-container">
      <ChakraTable.Root data-slot="table" size="sm" variant="line" {...props} />
    </ChakraTable.ScrollArea>
  );
}

function TableHeader(props: React.ComponentProps<"thead">) {
  return <ChakraTable.Header data-slot="table-header" {...props} />;
}

function TableBody(props: React.ComponentProps<"tbody">) {
  return <ChakraTable.Body data-slot="table-body" {...props} />;
}

function TableFooter(props: React.ComponentProps<"tfoot">) {
  return <ChakraTable.Footer data-slot="table-footer" {...props} />;
}

function TableRow(props: React.ComponentProps<"tr">) {
  return <ChakraTable.Row data-slot="table-row" {...props} />;
}

function TableHead(props: React.ComponentProps<"th">) {
  return <ChakraTable.ColumnHeader data-slot="table-head" {...props} />;
}

function TableCell(props: React.ComponentProps<"td">) {
  return <ChakraTable.Cell data-slot="table-cell" {...props} />;
}

function TableCaption(props: React.ComponentProps<"caption">) {
  return <ChakraTable.Caption data-slot="table-caption" {...props} />;
}

export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow
};
