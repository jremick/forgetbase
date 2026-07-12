import { defaultConfig } from "@chakra-ui/react/preset";
import { createSystem, defineConfig } from "@chakra-ui/react/styled-system";

const systemFont = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

const config = defineConfig({
  theme: {
    tokens: {
      colors: {
        brand: {
          50: { value: "#e6fffb" },
          100: { value: "#b2f5ea" },
          200: { value: "#81e6d9" },
          300: { value: "#4fd1c5" },
          400: { value: "#38b2ac" },
          500: { value: "#319795" },
          600: { value: "#2c7a7b" },
          700: { value: "#285e61" },
          800: { value: "#234e52" },
          900: { value: "#1d4044" },
          950: { value: "#102a2d" }
        }
      },
      fonts: {
        body: { value: systemFont },
        heading: { value: systemFont }
      },
      radii: {
        sm: { value: "4px" },
        md: { value: "6px" },
        lg: { value: "6px" },
        xl: { value: "6px" }
      },
      sizes: {
        control: { value: "40px" }
      }
    },
    semanticTokens: {
      colors: {
        brand: {
          solid: { value: "{colors.brand.500}" },
          contrast: { value: "white" },
          fg: { value: "{colors.brand.700}" },
          muted: { value: "{colors.brand.100}" },
          subtle: { value: "{colors.brand.50}" },
          emphasized: { value: "{colors.brand.200}" },
          focusRing: { value: "{colors.brand.500}" }
        }
      }
    }
  }
});

export const system = createSystem(defaultConfig, config);
