import type { ApiKeyRecord, AuthLoginResponse, AuthOidcLoginResponse, AuthPrincipal } from "@forgetbase/schema";
import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ErrorInfo, type FormEvent, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert.js";
import { Button } from "./components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card.js";
import { Input } from "./components/ui/input.js";
import { Label } from "./components/ui/label.js";
import { createAppBinaryRequest, createAppRequest, shouldProbeAuthenticatedSession } from "./lib/app-api.js";
import { useBrowserApiKey } from "./lib/browser-auth.js";
import { canUseAdministration, canonicalAppHash, isAdminRoute, isReaderRoute, normalizeAppRoute, type AppRoute } from "./lib/app-routing.js";
import {
  apiUrlStorageKey,
  localDevLoginDefaults,
  localSplitOriginAuthKey,
  loginTenantStorageKey,
  readInitialApiUrl,
  readInitialLoginEmail,
  readInitialLoginPassword,
  readInitialLoginTenantId
} from "./local-dev-auth.js";
import { ReaderSurface } from "./ReaderSurface.js";
import "./styles.css";

const LazyAdminSurface = lazy(() => import("./AdminSurface.js").then((module) => ({ default: module.AdminSurface })));
const configuredApiUrl = import.meta.env.VITE_FORGETBASE_API_URL?.trim();
const sessionCookieActiveStorageKey = "forgetbase-session-cookie-active";

type AuthState = "checking" | "authenticated" | "unauthenticated";
type OidcWebTransaction = {
  tenantId: string;
  provider: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
};

type LazyBoundaryProps = { children: ReactNode };
type LazyBoundaryState = { error: Error | null };

class LazyBoundary extends Component<LazyBoundaryProps, LazyBoundaryState> {
  override state: LazyBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): LazyBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Admin surface failed to load", error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return <main className="public-entry-main login-entry-main" id="main">
      <Card className="login-panel">
        <CardHeader><CardTitle><h1>Admin failed to load</h1></CardTitle><CardDescription>The operational console could not be downloaded. Your reader session is still available.</CardDescription></CardHeader>
        <CardContent className="public-login-actions">
          <Button type="button" onClick={() => { window.location.hash = "reader"; this.setState({ error: null }); }}>Return to reader</Button>
          <Button type="button" variant="ghost" onClick={() => window.location.reload()}>Retry</Button>
        </CardContent>
      </Card>
    </main>;
  }
}

function principalFromLogin(response: AuthLoginResponse | AuthOidcLoginResponse): AuthPrincipal {
  return {
    tenantId: response.user.tenantId,
    principalType: "user",
    principalId: response.user.id,
    userId: response.user.id,
    serviceAccountId: null,
    apiKeyId: response.apiKey.id,
    email: response.user.email,
    displayName: response.user.displayName,
    role: response.user.role,
    scopes: response.apiKey.scopes,
    allowedSurfaces: response.apiKey.allowedSurfaces,
    groupIds: []
  };
}

export function App() {
  const [apiUrl] = useState(() => readInitialApiUrl(configuredApiUrl));
  const [apiKey, setApiKey] = useBrowserApiKey();
  const [sessionCookieActive, setSessionCookieActive] = useState(() => localStorage.getItem(sessionCookieActiveStorageKey) === "true");
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [principal, setPrincipal] = useState<AuthPrincipal | null>(null);
  const [loginTenantId] = useState(readInitialLoginTenantId);
  const [loginEmail, setLoginEmail] = useState(readInitialLoginEmail);
  const [loginPassword, setLoginPassword] = useState(readInitialLoginPassword);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [route, setRoute] = useState<AppRoute>(() => normalizeAppRoute(window.location.hash));
  const apiUrlRef = useRef(apiUrl);
  const apiKeyRef = useRef(apiKey);

  apiUrlRef.current = apiUrl;
  apiKeyRef.current = apiKey;
  const request = useMemo(() => createAppRequest(() => apiUrlRef.current, () => apiKeyRef.current), []);
  const requestBinary = useMemo(() => createAppBinaryRequest(() => apiUrlRef.current, () => apiKeyRef.current), []);
  const administrator = principal ? canUseAdministration(principal) : false;

  useEffect(() => {
    localStorage.setItem(apiUrlStorageKey, apiUrl);
  }, [apiUrl]);

  useEffect(() => {
    if (sessionCookieActive) localStorage.setItem(sessionCookieActiveStorageKey, "true");
    else localStorage.removeItem(sessionCookieActiveStorageKey);
  }, [sessionCookieActive]);

  useEffect(() => {
    localStorage.removeItem(loginTenantStorageKey);
    localStorage.removeItem("forgetbase-login-email");
  }, []);

  useEffect(() => {
    const syncRoute = () => {
      const rawRoute = window.location.hash.replace(/^#/, "");
      const nextRoute = normalizeAppRoute(rawRoute);
      const canonicalHash = canonicalAppHash(nextRoute);
      setRoute(nextRoute);
      if (rawRoute && rawRoute !== canonicalHash) window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}#${canonicalHash}`);
    };
    syncRoute();
    window.addEventListener("hashchange", syncRoute);
    return () => window.removeEventListener("hashchange", syncRoute);
  }, []);

  useEffect(() => {
    let active = true;

    if (!shouldProbeAuthenticatedSession(apiKeyRef.current, sessionCookieActive)) {
      setPrincipal(null);
      setAuthState("unauthenticated");
      return () => { active = false; };
    }

    setAuthState("checking");
    void request<AuthPrincipal>("/auth/me")
      .then((nextPrincipal) => {
        if (!active) return;
        setPrincipal(nextPrincipal);
        setSessionCookieActive(!apiKeyRef.current);
        setAuthState("authenticated");
      })
      .catch((sessionError) => {
        if (!active) return;
        const detail = sessionError instanceof Error ? sessionError.message : String(sessionError);
        if (apiKeyRef.current && detail.startsWith("401 ")) setApiKey("");
        setSessionCookieActive(false);
        setPrincipal(null);
        setAuthState("unauthenticated");
        if ((apiKeyRef.current || sessionCookieActive) && !detail.startsWith("401 ")) setError(detail);
      });
    return () => { active = false; };
  }, [request]);

  useEffect(() => {
    if (!principal) return;
    if (isAdminRoute(route) && !administrator) {
      setRoute("reader");
      window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}#reader`);
    }
  }, [administrator, principal, route]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const providerError = params.get("error");
    if (providerError) {
      setError(providerError);
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }
    if (!code || !state) return;
    const rawTransaction = localStorage.getItem("forgetbase-oidc-transaction");
    localStorage.removeItem("forgetbase-oidc-transaction");
    window.history.replaceState({}, document.title, window.location.pathname);
    if (!rawTransaction) { setError("Missing OIDC login state"); return; }
    try {
      const transaction = JSON.parse(rawTransaction) as OidcWebTransaction;
      void completeOidcLogin(code, state, transaction);
    } catch {
      setError("Invalid OIDC login state");
    }
  }, []);

  async function login(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError("");
    try {
      const response = await request<AuthLoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          tenantId: loginTenantId.trim() || localDevLoginDefaults.tenantId,
          email: loginEmail.trim(),
          password: loginPassword,
          keyName: "web-login",
          deviceLabel: "Web browser"
        })
      }, "");
      const localAuthKey = localSplitOriginAuthKey(response.secret);
      setApiKey(localAuthKey);
      setSessionCookieActive(!localAuthKey);
      setPrincipal(principalFromLogin(response));
      setAuthState("authenticated");
      setLoginPassword("");
      setMessage(`Signed in as ${response.user.email}`);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : String(loginError));
    }
  }

  async function completeOidcLogin(code: string, state: string, transaction: OidcWebTransaction): Promise<void> {
    setError("");
    try {
      const response = await request<AuthOidcLoginResponse>("/auth/oidc/callback", {
        method: "POST",
        body: JSON.stringify({ ...transaction, code, state, keyName: "web-oidc-login", deviceLabel: "Web OIDC browser" })
      }, "");
      const localAuthKey = localSplitOriginAuthKey(response.secret);
      setApiKey(localAuthKey);
      setSessionCookieActive(!localAuthKey);
      setPrincipal(principalFromLogin(response));
      setAuthState("authenticated");
      setMessage(`Signed in as ${response.user.email}`);
    } catch (oidcError) {
      setError(oidcError instanceof Error ? oidcError.message : String(oidcError));
      setAuthState("unauthenticated");
    }
  }

  function clearSession(): void {
    setApiKey("");
    setSessionCookieActive(false);
    setPrincipal(null);
    setAuthState("unauthenticated");
  }

  async function logout(): Promise<void> {
    setError("");
    let nextMessage = "Signed out locally";
    try {
      if (apiKey || sessionCookieActive) {
        const response = await request<{ apiKey: ApiKeyRecord }>("/auth/logout", { method: "POST", body: JSON.stringify({}) });
        nextMessage = `Signed out and revoked ${response.apiKey.secretPreview}`;
      }
    } catch (logoutError) {
      setError(`Logout request failed; local key cleared. ${logoutError instanceof Error ? logoutError.message : String(logoutError)}`);
    } finally {
      clearSession();
      setMessage(nextMessage);
    }
  }

  function navigate(nextRoute: string): void {
    window.location.hash = canonicalAppHash(nextRoute);
  }

  if (authState === "authenticated" && principal) {
    if (isReaderRoute(route)) {
      return <ReaderSurface principal={principal} route={route as Extract<AppRoute, "reader" | "account-settings">} request={request} requestBinary={requestBinary} onLogout={logout} onNavigate={navigate} canUseAdministration={administrator} />;
    }

    if (administrator) {
      return <LazyBoundary><Suspense fallback={<div className="app-shell admin-shell"><main className="main" id="main"><Alert variant="info"><AlertDescription>Loading administration…</AlertDescription></Alert></main></div>}><LazyAdminSurface onSessionEnded={clearSession} /></Suspense></LazyBoundary>;
    }
  }

  return <div className="app-shell auth-shell">
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="topbar"><div className="brand"><span className="mark" aria-hidden="true"><img className="mark-image" src="/favicon.svg" alt="" /></span><span className="brand-name">ForgetBase</span></div><div className="topbar-main public-topbar-main"><span aria-hidden="true" /></div></header>
    <main className="public-entry-main login-entry-main" id="main">
      <Card className="login-panel" aria-labelledby="login-title">
        <CardHeader className="login-dialog-header"><span className="mark login-mark" aria-hidden="true"><img className="mark-image" src="/favicon.svg" alt="" /></span><div><CardDescription className="eyebrow">ForgetBase</CardDescription><CardTitle><h1 id="login-title">Log in to ForgetBase</h1></CardTitle><CardDescription id="login-description" className="lede">Use your account to read pages or manage the knowledge base.</CardDescription></div></CardHeader>
        <CardContent className="login-panel-content">
          {authState === "checking" ? <Alert variant="info" className="public-session-alert"><AlertDescription>Checking session</AlertDescription></Alert> : null}
          <form className="public-login-form" onSubmit={(event) => void login(event)}><div className="public-login-field"><Label htmlFor="login-email">Username / email</Label><Input id="login-email" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} type="text" autoComplete="username" required /></div><div className="public-login-field"><Label htmlFor="login-password">Password</Label><Input id="login-password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} type="password" autoComplete="current-password" required /></div><div className="public-login-actions"><Button type="submit" variant="primary" disabled={authState === "checking" || !loginEmail.trim() || !loginPassword}>Log in</Button></div></form>
          {message ? <Alert variant="success" className="public-login-alert"><AlertDescription>{message}</AlertDescription></Alert> : null}
          {error ? <Alert variant="destructive" className="public-login-alert"><AlertTitle>Login failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        </CardContent>
      </Card>
    </main>
  </div>;
}
