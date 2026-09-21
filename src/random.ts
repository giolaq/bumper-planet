// getRandomValues works on LAN HTTP pages; randomUUID requires a secure context.
export function randomToken(bytes = 32) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), n => n.toString(16).padStart(2, '0')).join('');
}
