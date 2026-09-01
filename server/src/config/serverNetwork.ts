function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
}

function isTrustedProxyBindingEnabled(): boolean {
  const normalized = process.env.TRUSTED_REVERSE_PROXY?.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

/** Prevents the current no-auth server from being exposed directly in production. */
export function assertProductionNetworkBoundary(host: string): void {
  if (
    process.env.NODE_ENV === "production"
    && !isLoopbackHost(host)
    && !isTrustedProxyBindingEnabled()
  ) {
    throw new Error(
      "Production server must bind to a loopback host until real authentication is implemented. Use 127.0.0.1 behind a reverse proxy, or set TRUSTED_REVERSE_PROXY=true only when the API port is not published and a trusted proxy is the sole ingress.",
    );
  }
}
