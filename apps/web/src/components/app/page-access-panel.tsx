import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Box, HStack, Stack, Text } from "@chakra-ui/react";
import type { PermissionAction, PermissionGrant, PermissionGrantMutationResponse, PermissionPrincipalType, Surface } from "@forgetbase/schema";
import type { AppRequest } from "../../lib/app-api.js";
import { grantMutationMessage, grantSurfaceOptions, loadGrantPrincipals, loadPageGrants, pageAccessError, pageGrantPayload } from "../../lib/page-access.js";
import { Button } from "../ui/button.js";
import { Input } from "../ui/input.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select.js";
import { FormField } from "./form-field.js";
import { StatusAlert } from "./status-alert.js";

export type PageAccessPanelProps = {
  pageId: string;
  request: AppRequest;
  canManage: boolean;
  canListPrincipals?: boolean;
  allowedSurfaces?: Surface[];
  audience?: string[];
};

const actionLabels: Record<PermissionAction, string> = { read: "Read", write: "Write", admin: "Administer", export: "Export", execute: "Execute" };
const surfaceLabels: Record<Surface, string> = { web: "Web", api: "API", cli: "CLI", mcp: "MCP", export: "Export" };
type Directory = Awaited<ReturnType<typeof loadGrantPrincipals>>;
const emptyDirectory: Directory = { users: [], groups: [], errors: [], mayBeIncomplete: false };

export function PageAccessPanel(props: PageAccessPanelProps) {
  return <Stack gap="4">
    <Text as="h3" fontWeight="semibold" overflowWrap="anywhere">Access to {props.pageId}</Text>
    <Text overflowWrap="anywhere">Audience labels: {props.audience === undefined ? "Not loaded" : props.audience.join(", ") || "None"}. These labels describe intended readers; they do not grant access.</Text>
    <Text color="fg.muted">Explicit grants work with the page’s publication state, sensitivity, allowed surfaces, roles, and group memberships. Removing one grant can leave access through another grant or role.</Text>
    {props.canManage
      ? <PageAccessEditor key={props.pageId} {...props} />
      : <StatusAlert status="info" title="Page access requires a permission administrator" description="An administrator with permission management access can list, grant, and revoke permissions for this page." />}
  </Stack>;
}

function PageAccessEditor({ pageId, request, canListPrincipals = false, allowedSurfaces = grantSurfaceOptions }: PageAccessPanelProps) {
  const id = useId();
  const requestRef = useRef(request);
  const active = useRef(true);
  const listRequest = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const directoryGeneration = useRef(0);
  const [grants, setGrants] = useState<PermissionGrant[]>([]);
  const [directory, setDirectory] = useState<Directory>(emptyDirectory);
  const [directoryLoading, setDirectoryLoading] = useState(canListPrincipals);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [principalType, setPrincipalType] = useState<PermissionPrincipalType>("user");
  const [principalId, setPrincipalId] = useState("");
  const [action, setAction] = useState<PermissionAction>("read");
  const [surfaces, setSurfaces] = useState<Surface[]>(allowedSurfaces.includes("web") ? ["web"] : allowedSurfaces.slice(0, 1));
  const [manualId, setManualId] = useState(!canListPrincipals);
  const [filter, setFilter] = useState("");
  const [pendingRevoke, setPendingRevoke] = useState<string | null>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => { requestRef.current = request; }, [request]);
  useEffect(() => {
    active.current = true;
    void refreshGrants();
    return () => { active.current = false; generation.current += 1; listRequest.current?.abort(); };
  }, [pageId]);
  useEffect(() => {
    const current = ++directoryGeneration.current;
    if (!canListPrincipals) {
      setDirectory(emptyDirectory);
      setDirectoryLoading(false);
      setManualId(true);
      return;
    }
    const controller = new AbortController();
    setDirectoryLoading(true);
    void loadGrantPrincipals(requestRef.current, controller.signal).then((result) => {
      if (!controller.signal.aborted && current === directoryGeneration.current) { setDirectory(result); setDirectoryLoading(false); }
    });
    return () => { controller.abort(); directoryGeneration.current += 1; };
  }, [canListPrincipals]);

  async function refreshGrants(): Promise<boolean> {
    listRequest.current?.abort();
    const controller = new AbortController();
    listRequest.current = controller;
    const current = ++generation.current;
    setLoading(true);
    setLoaded(false);
    setError("");
    try {
      const result = await loadPageGrants(requestRef.current, pageId, controller.signal);
      if (!active.current || current !== generation.current) return false;
      setGrants(result);
      setLoaded(true);
      return true;
    } catch (failure) {
      if (active.current && current === generation.current) setError(pageAccessError(failure));
      return false;
    } finally {
      if (active.current && current === generation.current) setLoading(false);
    }
  }

  async function refreshDirectory() {
    const current = ++directoryGeneration.current;
    setDirectoryLoading(true);
    const result = await loadGrantPrincipals(requestRef.current);
    if (active.current && current === directoryGeneration.current) { setDirectory(result); setDirectoryLoading(false); }
  }

  function choosePrincipal(nextId: string, nextType = principalType, nextAction = action) {
    setPrincipalId(nextId);
    setPrincipalType(nextType);
    setAction(nextAction);
    const existing = grants.find((grant) => grant.principalType === nextType && grant.principalId === nextId && grant.action === nextAction);
    setSurfaces(existing?.surfaces.filter((surface) => allowedSurfaces.includes(surface)) ?? (allowedSurfaces.includes("web") ? ["web"] : allowedSurfaces.slice(0, 1)));
  }

  async function mutateGrant(revokeId?: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await requestRef.current<PermissionGrantMutationResponse>(
        `/assets/${encodeURIComponent(pageId)}/grants${revokeId ? `/${encodeURIComponent(revokeId)}` : ""}`,
        revokeId ? { method: "DELETE" } : {
          method: "POST",
          body: JSON.stringify(pageGrantPayload({ principalType, principalId, action, surfaces }, allowedSurfaces))
        }
      );
      if (!active.current) return;
      setPendingRevoke(null);
      const refreshed = await refreshGrants();
      if (!active.current) return;
      setNotice(refreshed
        ? grantMutationMessage(result, revokeId ? "revoked" : "saved")
        : `Grant ${revokeId ? "revoked" : "saved"}. Refresh the grant list before making another change.`);
      if (revokeId && refreshed) listHeading.current?.focus();
    } catch (failure) {
      if (active.current) setError(pageAccessError(failure));
    } finally {
      if (active.current) setBusy(false);
    }
  }

  const existingGrant = grants.find((grant) => grant.principalType === principalType && grant.principalId === principalId.trim() && grant.action === action);
  const pickerOptions = principalType === "user"
    ? directory.users.filter((user) => user.status === "active").map((user) => ({ id: user.id, label: `${user.displayName} (${user.email})` }))
    : directory.groups.map((group) => ({ id: group.id, label: group.name }));
  const visibleOptions = pickerOptions.filter((option) => option.id === principalId || option.label.toLowerCase().includes(filter.trim().toLowerCase()));
  const isManual = manualId || principalType === "service-account";
  const disabled = busy || loading || !loaded;
  const principalLabel = (grant: PermissionGrant) => grant.principalType === "user"
    ? directory.users.find((user) => user.id === grant.principalId)?.displayName ?? grant.principalId
    : grant.principalType === "group"
      ? directory.groups.find((group) => group.id === grant.principalId)?.name ?? grant.principalId
      : grant.principalId;

  return <Stack gap="4" aria-busy={loading || busy}>
    <HStack justify="space-between" flexWrap="wrap" gap="3">
      <Box as="h3" ref={listHeading} tabIndex={-1} id={`${id}-grants`} fontWeight="semibold">Explicit page grants{loaded ? ` (${grants.length})` : ""}</Box>
      <Button type="button" onClick={() => void refreshGrants()} disabled={busy || loading}>{loading ? "Loading grants…" : "Refresh grants"}</Button>
    </HStack>
    {loading ? <Text role="status">Loading page access…</Text> : null}
    {error ? <StatusAlert status="error" title="Page access needs attention" description={error} actions={!busy && !loading ? <Button type="button" onClick={() => void refreshGrants()}>Retry access load</Button> : undefined} /> : null}
    {notice ? <StatusAlert status="info" description={notice} /> : null}
    {!loading && loaded && !grants.length ? <Text>No explicit grants for this page.</Text> : null}
    {grants.length ? <Stack as="ul" gap="3" aria-labelledby={`${id}-grants`} padding="0" margin="0" listStyleType="none">
      {grants.map((grant) => <Box as="li" key={grant.id} borderWidth="1px" borderRadius="md" padding="3">
        <HStack align="start" justify="space-between" flexWrap="wrap" gap="3">
          <Stack gap="1" minW="0" flex="1">
            <Text fontWeight="medium" overflowWrap="anywhere">{principalLabel(grant)}</Text>
            <Text color="fg.muted">{grant.principalType} · {actionLabels[grant.action]} · {grant.surfaces.map((surface) => surfaceLabels[surface]).join(", ")}</Text>
            <Text fontSize="sm" color="fg.muted" overflowWrap="anywhere">ID: {grant.principalId}</Text>
          </Stack>
          <HStack flexWrap="wrap" gap="2">
            <Button type="button" size="sm" disabled={disabled} aria-label={`Edit ${actionLabels[grant.action].toLowerCase()} grant for ${principalLabel(grant)}`} onClick={() => { choosePrincipal(grant.principalId, grant.principalType, grant.action); setManualId(!pickerOptions.some((option) => option.id === grant.principalId)); document.getElementById(`${id}-principal-type`)?.focus(); }}>Edit grant</Button>
            <Button type="button" size="sm" disabled={disabled} aria-label={`Revoke ${actionLabels[grant.action].toLowerCase()} grant for ${principalLabel(grant)}`} onClick={() => setPendingRevoke(grant.id)}>Revoke</Button>
          </HStack>
        </HStack>
        {pendingRevoke === grant.id ? <Stack gap="2" marginTop="3">
          <Text role="alert">Revoke this {actionLabels[grant.action].toLowerCase()} grant for {principalLabel(grant)}? Other grants and role access will remain.</Text>
          <HStack flexWrap="wrap" gap="2"><Button type="button" variant="danger" disabled={disabled} onClick={() => void mutateGrant(grant.id)}>Revoke grant</Button><Button type="button" disabled={busy} onClick={() => setPendingRevoke(null)}>Keep grant</Button></HStack>
        </Stack> : null}
      </Box>)}
    </Stack> : null}
    <Box as="form" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!disabled) void mutateGrant(); }} borderTopWidth="1px" paddingTop="4">
      <Stack gap="4">
        <Text as="h3" fontWeight="semibold">{existingGrant ? "Update explicit grant" : "Add explicit grant"}</Text>
        {!canListPrincipals ? <Text color="fg.muted">Your account cannot list the people and groups directory. Enter an existing principal ID to manage its grant.</Text> : null}
        {directory.errors.length ? <StatusAlert status="warning" title="Directory partly unavailable" description={`${directory.errors.join(" ")} You can enter an existing principal ID.`} actions={<Button type="button" disabled={directoryLoading} onClick={() => void refreshDirectory()}>Retry directory</Button>} /> : null}
        {directory.mayBeIncomplete ? <Text color="fg.muted">The picker shows up to 200 people and 200 groups. Enter the principal ID if the required entry is missing.</Text> : null}
        <FormField label="Principal type" htmlFor={`${id}-principal-type`}>
          <Select value={principalType} onValueChange={(value) => { choosePrincipal("", value as PermissionPrincipalType); setFilter(""); }} disabled={disabled}>
            <SelectTrigger id={`${id}-principal-type`}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="user">Person</SelectItem><SelectItem value="group">Group</SelectItem><SelectItem value="service-account">Service account</SelectItem></SelectContent>
          </Select>
        </FormField>
        {canListPrincipals && principalType !== "service-account" ? <Button type="button" variant="ghost" disabled={disabled} onClick={() => { setManualId(!manualId); choosePrincipal(""); }}>{manualId ? "Choose from directory" : "Enter principal ID"}</Button> : null}
        {isManual ? <FormField label="Principal ID" htmlFor={`${id}-principal`} required helpText="Use an existing ID in this workspace."><Input id={`${id}-principal`} value={principalId} onChange={(event) => choosePrincipal(event.target.value)} disabled={disabled} required /></FormField>
          : <Stack gap="3"><FormField label={principalType === "user" ? "Find a person" : "Find a group"} htmlFor={`${id}-filter`}><Input id={`${id}-filter`} value={filter} onChange={(event) => setFilter(event.target.value)} disabled={disabled || directoryLoading} /></FormField>
            <FormField label={principalType === "user" ? "Person" : "Group"} htmlFor={`${id}-principal`} required>
              <Select value={principalId} onValueChange={(value) => choosePrincipal(value)} disabled={disabled || directoryLoading} required><SelectTrigger id={`${id}-principal`}><SelectValue placeholder={directoryLoading ? "Loading directory…" : "Choose an entry"} /></SelectTrigger><SelectContent>{visibleOptions.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent></Select>
              {!directoryLoading && !visibleOptions.length ? <Text marginTop="2">No matching entries. Adjust the search or enter a principal ID.</Text> : null}
            </FormField></Stack>}
        <FormField label="Permission" htmlFor={`${id}-action`} helpText="Permissions are separate. Editors of restricted pages need both Read and Write grants; their role and account scopes must also allow editing.">
          <Select value={action} onValueChange={(value) => choosePrincipal(principalId, principalType, value as PermissionAction)} disabled={disabled}><SelectTrigger id={`${id}-action`}><SelectValue /></SelectTrigger><SelectContent>{Object.entries(actionLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
        </FormField>
        <Box as="fieldset" border="0" padding="0" margin="0" disabled={disabled}>
          <Text as="legend" fontWeight="medium" marginBottom="2">Allowed surfaces</Text>
          <HStack flexWrap="wrap" gap="4">{grantSurfaceOptions.filter((surface) => allowedSurfaces.includes(surface)).map((surface) => <Box as="label" key={surface} display="flex" alignItems="center" gap="2" minH="10"><input type="checkbox" checked={surfaces.includes(surface)} onChange={(event) => setSurfaces((current) => event.target.checked ? [...current, surface] : current.filter((item) => item !== surface))} />{surfaceLabels[surface]}</Box>)}</HStack>
        </Box>
        {existingGrant ? <Text color="fg.muted">Saving replaces this principal’s existing {actionLabels[action].toLowerCase()} grant surfaces ({existingGrant.surfaces.map((surface) => surfaceLabels[surface]).join(", ")}) with the selected surfaces.</Text> : null}
        <HStack><Button type="submit" variant="primary" disabled={disabled || !principalId.trim() || !surfaces.some((surface) => allowedSurfaces.includes(surface))}>{busy ? "Saving…" : existingGrant ? "Update grant" : "Grant access"}</Button></HStack>
      </Stack>
    </Box>
  </Stack>;
}
