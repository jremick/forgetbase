import type { Branding } from "@forgetbase/schema";

export function BrandLogo({ branding, className = "" }: { branding: Branding; className?: string }) {
  return <span className={`mark ${className}`} aria-hidden="true">
    <img key={branding.logoDataUrl} className="mark-image" src={branding.logoDataUrl ?? "/favicon.svg"} alt=""
      onError={(event) => { if (event.currentTarget.getAttribute("src") !== "/favicon.svg") event.currentTarget.src = "/favicon.svg"; }} />
  </span>;
}

export function Brand({ branding }: { branding: Branding }) {
  return <><BrandLogo branding={branding} /><span className="brand-name" title={branding.displayName}>{branding.displayName}</span></>;
}
