// True when `value` is an IANA time zone the runtime can format with.
export function isValidTimeZone(value: string): boolean {
  if (value === "") {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
