/**
 * Production hook for client-side faults. Intentionally silent; extend for remote logging if required.
 */
export function reportClientFault(_error: unknown): void {}
