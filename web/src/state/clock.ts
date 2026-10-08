/** The current time as a UTC ISO string. One place, so components don't read the clock directly. */
export function nowIso(): string {
  return new Date().toISOString();
}
