import type {
  LocalDeviceAuthorizationApproveResponse,
  LocalDeviceAuthorizationPreview,
  LocalDeviceSessionListResponse,
  LoginSessionRecord
} from "@forgetbase/schema";
import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert.js";
import { Button } from "../ui/button.js";
import type { AppRequest } from "../../lib/app-api.js";

type LocalDevicesPanelProps = {
  request: AppRequest;
};

export function LocalDevicesPanel({ request }: LocalDevicesPanelProps) {
  const requestToken = useMemo(
    () => new URLSearchParams(window.location.search).get("local-device-request")?.trim() ?? "",
    []
  );
  const [preview, setPreview] = useState<LocalDeviceAuthorizationPreview | null>(null);
  const [devices, setDevices] = useState<LoginSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (requestToken) {
      const url = new URL(window.location.href);
      url.searchParams.delete("local-device-request");
      window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
    }
    const loads: Promise<void>[] = [request<LocalDeviceSessionListResponse>("/local-sync/v1/device-sessions")
      .then((response) => { if (active) setDevices(response.devices); })];
    if (requestToken) {
      loads.push(request<LocalDeviceAuthorizationPreview>(
        "/local-sync/v1/device-sessions/authorization/preview",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ requestToken })
        }
      ).then((response) => { if (active) setPreview(response); }));
    }
    void Promise.all(loads)
      .catch((loadError) => { if (active) setError(safeError(loadError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [request, requestToken]);

  async function approve(): Promise<void> {
    if (!requestToken) return;
    setApproving(true);
    setError("");
    try {
      const response = await request<LocalDeviceAuthorizationApproveResponse>(
        "/local-sync/v1/device-sessions/authorization",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ requestToken })
        }
      );
      window.location.assign(response.redirectUrl);
    } catch (approvalError) {
      setError(safeError(approvalError));
      setApproving(false);
    }
  }

  async function revoke(device: LoginSessionRecord): Promise<void> {
    if (!window.confirm(`Revoke ${device.deviceLabel ?? "this local device"}? Its cache will stop renewing.`)) return;
    setError("");
    try {
      await request(`/local-sync/v1/device-sessions/${encodeURIComponent(device.id)}`, { method: "DELETE" });
      setDevices((current) => current.filter((candidate) => candidate.id !== device.id));
    } catch (revokeError) {
      setError(safeError(revokeError));
    }
  }

  return <section className="local-devices-panel" aria-labelledby="local-devices-title">
    <header>
      <p className="eyebrow">Local agent access</p>
      <h2 id="local-devices-title">Local devices</h2>
      <p>Each device can only synchronize the approved knowledge that your account may cache.</p>
    </header>
    {error ? <Alert variant="destructive"><AlertTitle>Local device request failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    {requestToken && preview ? <div className="local-device-approval">
      <div>
        <h3>Approve {preview.deviceName}</h3>
        <p>Server <code>{new URL(preview.serverOrigin).host}</code> will send a one-time result to <code>{preview.redirectHost}</code>.</p>
        <p className="muted">This grants local sync access only. It does not grant admin or content-edit access.</p>
      </div>
      <Button type="button" onClick={() => void approve()} disabled={approving}>
        {approving ? "Approving…" : "Approve device"}
      </Button>
    </div> : null}
    {!loading && requestToken && !preview && !error ? <p>This approval request is no longer valid.</p> : null}
    <div className="local-device-list">
      {loading ? <p>Loading devices…</p> : devices.length ? devices.map((device) => <article key={device.id} className="local-device-row">
        <div>
          <h3>{device.deviceLabel ?? "Local device"}</h3>
          <p>Added {formatDate(device.createdAt)} · Last used {device.lastSeenAt ? formatDate(device.lastSeenAt) : "not yet"}</p>
        </div>
        <Button type="button" variant="ghost" onClick={() => void revoke(device)}>Revoke</Button>
      </article>) : <p>No local devices are connected.</p>}
    </div>
  </section>;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : "The request could not be completed.";
}
