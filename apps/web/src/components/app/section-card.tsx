import * as React from "react";
import {
  CardBody,
  CardDescription,
  CardFooter,
  CardHeader,
  CardRoot,
  CardTitle,
  HStack,
  Stack
} from "@chakra-ui/react";

export type SectionCardVariant = "default" | "compact" | "tool";

export type SectionCardProps = Omit<React.ComponentProps<"div">, "title"> & {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  variant?: SectionCardVariant;
  headerClassName?: string;
  contentClassName?: string;
  footerClassName?: string;
};

const sectionCardSize: Record<SectionCardVariant, React.ComponentProps<typeof CardRoot>["size"]> = {
  default: "md",
  compact: "sm",
  tool: "md"
};

const sectionCardPadding: Record<SectionCardVariant, { header: string; content: string; footer: string }> = {
  default: {
    header: "4",
    content: "4",
    footer: "4"
  },
  compact: {
    header: "3",
    content: "3",
    footer: "3"
  },
  tool: {
    header: "4",
    content: "4",
    footer: "3"
  }
};

export function SectionCard({
  title,
  description,
  actions,
  footer,
  variant = "default",
  headerClassName,
  contentClassName,
  footerClassName,
  className,
  children,
  ...props
}: SectionCardProps) {
  const padding = sectionCardPadding[variant];
  const hasHeader = title || description || actions;

  return (
    <CardRoot size={sectionCardSize[variant]} variant="outline" className={className} {...props}>
      {hasHeader ? (
        <CardHeader p={padding.header} pb={children ? "3" : padding.header} className={headerClassName}>
          <HStack align="start" justify="space-between" gap="3" minW="0">
            <Stack gap="1" minW="0">
              {title ? <CardTitle>{title}</CardTitle> : null}
              {description ? <CardDescription>{description}</CardDescription> : null}
            </Stack>
            {actions ? (
              <HStack gap="2" align="center" justify="end" flexShrink="0" flexWrap="wrap">
                {actions}
              </HStack>
            ) : null}
          </HStack>
        </CardHeader>
      ) : null}
      {children ? (
        <CardBody p={padding.content} pt={hasHeader ? "0" : padding.content} className={contentClassName}>
          {children}
        </CardBody>
      ) : null}
      {footer ? (
        <CardFooter borderTopWidth={variant === "tool" ? "1px" : undefined} p={padding.footer} pt={variant === "tool" ? padding.footer : "0"} className={footerClassName}>
          {footer}
        </CardFooter>
      ) : null}
    </CardRoot>
  );
}
