// A platform key names an MCP connection. It is stored lowercase and shown in
// the chat and on the OAuth callback page, so keep it to a safe, short charset.
const PLATFORM_KEY = /^[a-z0-9-]{1,40}$/;

export function isValidPlatformKey(value: string): boolean {
  return PLATFORM_KEY.test(value);
}
