// --- Local date helper -------------------------------------------------------
// The server keys rounds off the CLIENT's local date, so both phones (in the
// same household/timezone) roll over at their own midnight. Never use
// toISOString() here — that's UTC and would flip the day at 8pm EST.

export function getLocalDateString() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
