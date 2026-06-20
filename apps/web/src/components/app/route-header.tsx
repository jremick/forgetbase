import * as React from "react";
import {
  Box,
  BreadcrumbCurrentLink,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbRoot,
  BreadcrumbSeparator,
  Button,
  Heading,
  HStack,
  Stack,
  Text
} from "@chakra-ui/react";

export type RouteHeaderBreadcrumb = {
  label: React.ReactNode;
  href?: string;
  onClick?: () => void;
  current?: boolean;
};

export type RouteHeaderProps = Omit<React.ComponentProps<"header">, "title"> & {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  lede?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: React.ReactNode | RouteHeaderBreadcrumb[];
  meta?: React.ReactNode;
};

function isBreadcrumbItems(value: RouteHeaderProps["breadcrumbs"]): value is RouteHeaderBreadcrumb[] {
  return Array.isArray(value);
}

function RouteHeaderBreadcrumbs({ breadcrumbs }: { breadcrumbs: React.ReactNode | RouteHeaderBreadcrumb[] }) {
  if (!isBreadcrumbItems(breadcrumbs)) {
    return <Box minW="0">{breadcrumbs}</Box>;
  }

  return (
    <BreadcrumbRoot>
      <BreadcrumbList>
        {breadcrumbs.map((item, index) => {
          const isCurrent = item.current ?? index === breadcrumbs.length - 1;
          const key = typeof item.label === "string" ? item.label : index;

          return (
            <React.Fragment key={key}>
              <BreadcrumbItem>
                {isCurrent ? (
                  <BreadcrumbCurrentLink>{item.label}</BreadcrumbCurrentLink>
                ) : item.onClick ? (
                  <BreadcrumbLink asChild>
                    <Button type="button" variant="plain" size="xs" h="auto" minH="0" p="0" onClick={item.onClick}>
                      {item.label}
                    </Button>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbLink href={item.href ?? "#"}>{item.label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {index < breadcrumbs.length - 1 ? <BreadcrumbSeparator /> : null}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </BreadcrumbRoot>
  );
}

export function RouteHeader({
  eyebrow,
  title,
  lede,
  actions,
  breadcrumbs,
  meta,
  className,
  children,
  ...props
}: RouteHeaderProps) {
  return (
    <Stack as="header" gap="3" className={className} {...props}>
      {breadcrumbs ? <RouteHeaderBreadcrumbs breadcrumbs={breadcrumbs} /> : null}
      <Stack direction={{ base: "column", md: "row" }} gap="3" align={{ base: "stretch", md: "start" }} justify="space-between" minW="0">
        <Stack gap="1" minW="0">
          {eyebrow ? (
            <Text color="fg.muted" fontWeight="medium" textStyle="xs" textTransform="uppercase">
              {eyebrow}
            </Text>
          ) : null}
          <HStack gap="2" align="center" flexWrap="wrap" minW="0">
            <Heading as="h1" size="2xl" minW="0">
              {title}
            </Heading>
            {meta}
          </HStack>
          {lede ? (
            <Text color="fg.muted" maxW="3xl" textStyle="sm">
              {lede}
            </Text>
          ) : null}
        </Stack>
        {actions ? (
          <HStack gap="2" align="center" flexWrap="wrap" flexShrink="0">
            {actions}
          </HStack>
        ) : null}
      </Stack>
      {children}
    </Stack>
  );
}
