const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const MONTHS_IN_YEAR = 12;
const FEBRUARY = 2;
const LEAP_FEBRUARY_DAYS = 29;
const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** `AAAA-MM-JJ`, et un jour qui existe au calendrier (le 30 février n'en est pas un). */
export function isCalendarDay(value: string): boolean {
  const match = DAY_PATTERN.exec(value);
  if (match === null) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= MONTHS_IN_YEAR && day >= 1 && day <= daysInMonth(year, month);
}

function daysInMonth(year: number, month: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return month === FEBRUARY && leap ? LEAP_FEBRUARY_DAYS : (MONTH_LENGTHS[month - 1] ?? 0);
}
