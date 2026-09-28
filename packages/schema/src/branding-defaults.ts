import type { Branding } from "./branding.js";

// This subpath has no validation runtime, so browser headers stay small.
export const brandingLogoMaxBytes = 256 * 1024;
export const brandingLogoMaxDimension = 2048;
export const defaultBranding: Branding = { displayName: "ForgetBase", logoDataUrl: null };
