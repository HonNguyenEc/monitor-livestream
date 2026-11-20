const DATE_PAD = 2;

/** `YYYY-MM-DD` of the machine's local calendar day, the `date` the board is read for. */
export function localDate(ms: number): string {
  const day = new Date(ms);
  const part = (value: number): string => String(value).padStart(DATE_PAD, '0');
  return `${day.getFullYear()}-${part(day.getMonth() + 1)}-${part(day.getDate())}`;
}
