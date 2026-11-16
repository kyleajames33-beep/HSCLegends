/** Only allow an application-relative path after authentication. */
export function safeReturnPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  // Backslashes can be interpreted as slashes by URL parsers. Control
  // characters may be stripped during parsing, changing the destination.
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return '/';
  return value;
}
