/**
 * Un **jour de service** `AAAA-MM-JJ` qui existe au calendrier : le 30 février
 * ne passe pas. Le contrat n'en vérifie que la forme ; la tournée refuse le
 * reste à sa création.
 */
export function isCalendarDay(day: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(day);
  if (match === null) {
    return false;
  }
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const lastOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return month >= 1 && month <= 12 && date >= 1 && date <= lastOfMonth;
}
