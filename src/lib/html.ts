/** Escape user-supplied strings for safe interpolation into HTML-formatted Telegram messages. */
export function esc(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
