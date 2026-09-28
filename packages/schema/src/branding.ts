import { z } from "zod";
import { brandingLogoMaxBytes } from "./branding-defaults.js";
export * from "./branding-defaults.js";

export const brandingSchema = z.object({
  displayName: z.string().trim().min(1).max(64).refine(value => !/[\u0000-\u001f\u007f]/.test(value), "Use a single line of text."),
  logoDataUrl: z.string().max(4 * Math.ceil(brandingLogoMaxBytes / 3) + 32)
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/).nullable()
}).strict();
export type Branding = z.infer<typeof brandingSchema>;
export const brandingTenantQuerySchema = z.object({ tenantId: z.string().trim().min(1).max(200).default("tenant_demo") }).strict();
