import * as React from "react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card.js";
import { cn } from "@/lib/utils.js";

export type SectionCardVariant = "default" | "compact" | "tool";

export type SectionCardProps = Omit<React.ComponentProps<typeof Card>, "title"> & {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  variant?: SectionCardVariant;
  headerClassName?: string;
  contentClassName?: string;
  footerClassName?: string;
};

const sectionCardPadding: Record<SectionCardVariant, { header: string; content: string; footer: string }> = {
  default: {
    header: "p-4",
    content: "p-4 pt-0",
    footer: "p-4 pt-0"
  },
  compact: {
    header: "p-3",
    content: "p-3 pt-0",
    footer: "p-3 pt-0"
  },
  tool: {
    header: "p-4 pb-3",
    content: "p-4 pt-0",
    footer: "border-t border-border p-3"
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
    <Card className={cn(variant === "tool" && "shadow-none", className)} {...props}>
      {hasHeader ? (
        <CardHeader className={cn("grid-cols-[minmax(0,1fr)_auto] items-start gap-3", padding.header, headerClassName)}>
          <div className="min-w-0 space-y-1">
            {title ? <CardTitle>{title}</CardTitle> : null}
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          {actions ? <CardAction>{actions}</CardAction> : null}
        </CardHeader>
      ) : null}
      {children ? <CardContent className={cn(padding.content, !hasHeader && "pt-4", contentClassName)}>{children}</CardContent> : null}
      {footer ? <CardFooter className={cn(padding.footer, footerClassName)}>{footer}</CardFooter> : null}
    </Card>
  );
}
