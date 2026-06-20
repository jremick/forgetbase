import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { chakraRuntime } from "../../theme/chakra-runtime.js";

const ChakraButton = chakraRuntime.Button as React.ElementType;

type AppButtonVariant = "default" | "primary" | "ghost" | "command" | "danger";
type AppButtonSize = "default" | "sm" | "icon";

export type ButtonProps = React.ComponentProps<"button"> & {
  asChild?: boolean;
  variant?: AppButtonVariant;
  size?: AppButtonSize;
};

function buttonVariantProps(variant: AppButtonVariant | null | undefined) {
  if (variant === "primary") {
    return { colorPalette: "brand", variant: "solid" as const };
  }

  if (variant === "ghost") {
    return { variant: "ghost" as const };
  }

  if (variant === "command") {
    return { justifyContent: "flex-start" as const, variant: "outline" as const, width: "full" };
  }

  if (variant === "danger") {
    return { colorPalette: "red", variant: "solid" as const };
  }

  return { variant: "outline" as const };
}

function buttonSizeProps(size: AppButtonSize | null | undefined) {
  if (size === "sm") {
    return { size: "sm" as const };
  }

  if (size === "icon") {
    return { minWidth: "10", paddingInline: "0", size: "md" as const };
  }

  return { size: "md" as const };
}

function buttonVariants(_props?: { variant?: AppButtonVariant | null; size?: AppButtonSize | null; className?: string }) {
  return _props?.className ?? "";
}

function Button({ variant, size, asChild = false, ...props }: ButtonProps) {
  if (asChild) {
    return <Slot data-slot="button" data-size={size ?? "default"} data-variant={variant ?? "default"} {...props} />;
  }

  return (
    <ChakraButton
      data-slot="button"
      data-size={size ?? "default"}
      data-variant={variant ?? "default"}
      {...buttonVariantProps(variant)}
      {...buttonSizeProps(size)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
