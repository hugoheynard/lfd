/**
 * **Le jour de service d'à côté** — `AAAA-MM-JJ` décalé de `days` jours.
 *
 * Calculé en UTC sur la date seule, jamais sur un instant local : un jour de
 * service n'a pas d'heure, et un décalage d'heure d'été ferait sauter ou
 * répéter un jour si l'on passait par minuit local. Le serveur reste celui qui
 * dit quel jour est « aujourd'hui » ; cette fonction ne fait que compter.
 */
export function shiftServiceDay(isoDay: string, days: number): string {
  const [year, month, day] = isoDay.split('-').map(Number);
  const shifted = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days));
  return shifted.toISOString().slice(0, 10);
}

/** Une date de requête plausible — `AAAA-MM-JJ` — ou `null` : l'adresse se tape à la main. */
export function serviceDayParam(raw: string | null): string | null {
  return raw !== null && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}
