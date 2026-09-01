function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
}

/** Prevents the current no-auth server from being exposed directly in production. */
export function assertProductionNetworkBoundary(host: string): void {
  if (process.env.NODE_ENV === "production" && !isLoopbackHost(host)) {
    throw new Error(
      "Production server must bind to a loopback host until real authentication is implemented. Use 127.0.0.1 behind a reverse proxy.",
    );
  }
}
