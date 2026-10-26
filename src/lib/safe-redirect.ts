/**
 * Prevent open redirects: only allow relative paths on this origin.
 */
export function safeRedirectPath(
  next: string | null | undefined,
  fallback = '/'
): string {
  if (!next) return fallback;
  // Must be a same-origin relative path (not //evil.com or https://…)
  if (!next.startsWith('/') || next.startsWith('//')) {
    return fallback;
  }
  // Block backslash tricks and embedded protocols
  if (next.includes('\\') || /[\r\n]/.test(next)) {
    return fallback;
  }
  return next;
}
