import * as React from "react";
import { chakraRuntime } from "../../theme/chakra-runtime.js";

const ChakraBadge = chakraRuntime.Badge as React.ElementType;

export type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "destructive"
  | "info"
  | "neutral"
  | "sensitivity-public"
  | "sensitivity-internal"
  | "sensitivity-restricted"
  | "sensitivity-confidential"
  | "sensitivity-secret";

export type BadgeProps = Omit<React.ComponentProps<"span">, "color"> & {
  variant?: BadgeVariant | null;
};

function badgePalette(variant: BadgeVariant | null | undefined) {
  if (variant === "success" || variant === "sensitivity-public") return "green";
  if (variant === "warning" || variant === "sensitivity-restricted") return "orange";
  if (variant === "destructive" || variant === "sensitivity-confidential" || variant === "sensitivity-secret") return "red";
  if (variant === "info" || variant === "sensitivity-internal") return "blue";
  if (variant === "neutral") return "gray";
  return "brand";
}

function badgeVisualVariant(variant: BadgeVariant | null | undefined) {
  if (variant === "default" || variant === "sensitivity-secret") return "solid" as const;
  return "subtle" as const;
}

function badgeVariants(_props?: { variant?: BadgeVariant | null; className?: string }) {
  return _props?.className ?? "";
}

function Badge({ variant, ...props }: BadgeProps) {
  return (
    <ChakraBadge
      data-slot="badge"
      data-variant={variant ?? "default"}
      colorPalette={badgePalette(variant)}
      variant={badgeVisualVariant(variant)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
