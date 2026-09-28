import type { Branding } from "@forgetbase/schema";
import { defaultBranding } from "@forgetbase/schema/branding-defaults";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AppRequest } from "./app-api.js";


export function useBranding(request: AppRequest, tenantId: string) {
  const [state, setState] = useState({ tenantId, branding: defaultBranding });
  const epoch = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    const generation = ++epoch.current;
    void request<Branding>(`/branding?tenantId=${encodeURIComponent(tenantId)}`, { signal: controller.signal, credentials: "omit" }, "")
      .then(value => { if (epoch.current === generation) setState({ tenantId, branding: value }); })
      .catch(() => { if (!controller.signal.aborted && epoch.current === generation) setState({ tenantId, branding: defaultBranding }); });
    return () => { controller.abort(); epoch.current++; };
  }, [request, tenantId]);
  const updateBranding = useCallback((branding: Branding) => {
    epoch.current++;
    setState({ tenantId, branding });
  }, [tenantId]);
  return { branding: state.tenantId === tenantId ? state.branding : defaultBranding, updateBranding };
}
