// Utility functions — intentionally not imported by anything (dead code candidates)

export function formatDate(d: Date): string {
  return d.toISOString();
}

export function parseQuery(q: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(q));
}

// Unexported and unreferenced — should appear in dead code results
function internalHelper(x: number): number {
  return x * 2;
}
