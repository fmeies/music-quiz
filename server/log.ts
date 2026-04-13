export function log(...args: unknown[]): void {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 23);
  console.log(`[${ts}]`, ...args);
}
