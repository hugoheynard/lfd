/**
 * Les mots de l'écran **Prélèvement du mois** (plan
 * `documentation/facturation/prelevement-automatique.md`, PA4) : un mois
 * se nomme par son nom, jamais par « cycle » ni par une plage d'instants.
 *
 * ## Le mois d'une clôture se lit à Paris
 *
 * Une clôture est le 1er à 00h00 de Paris, soit la veille au soir en UTC. Le
 * mois qu'elle FERME est celui de l'instant juste avant elle, lu dans le
 * fuseau des affaires — le lire en UTC nommerait le bon mois par hasard
 * seulement.
 */

const PARIS_MONTH = new Intl.DateTimeFormat('fr-FR', {
  year: 'numeric',
  month: 'numeric',
  timeZone: 'Europe/Paris',
});

const LONG_DAY = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Paris',
});

interface YearMonth {
  readonly year: number;
  /** 1 à 12. */
  readonly month: number;
}

/** Le mois civil (Paris) que cette clôture ferme. */
function monthClosedBy(closesAtIso: string): YearMonth {
  const before = new Date(new Date(closesAtIso).getTime() - 1);
  const parts = PARIS_MONTH.formatToParts(before);
  const value = (type: 'year' | 'month'): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: value('year'), month: value('month') };
}

function previous({ year, month }: YearMonth): YearMonth {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function nameOf({ year, month }: YearMonth): string {
  return new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString('fr-FR', {
    month: 'long',
    timeZone: 'UTC',
  });
}

/** « octobre » — le mois que la PROCHAINE clôture fermera : celui de l'aperçu. */
export function currentMonthName(nextClosesAtIso: string): string {
  return nameOf(monthClosedBy(nextClosesAtIso));
}

/** « septembre » — le mois déjà clos, dont on prépare le lot. */
export function monthToPrepareName(nextClosesAtIso: string): string {
  return nameOf(previous(monthClosedBy(nextClosesAtIso)));
}

/** « septembre » — le mois d'un lot, lu sur la clôture qu'il porte. */
export function batchMonthName(cycleClosesAtIso: string): string {
  return nameOf(monthClosedBy(cycleClosesAtIso));
}

/** « septembre » — un mois écrit `AAAA-MM` (la facture du mois, E4). */
export function monthKeyName(key: string): string {
  return nameOf({ year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) });
}

/** `2026-09` — le mois qu'une clôture ferme, comparable d'une année à l'autre. */
export function closedMonthKey(cycleClosesAtIso: string): string {
  return keyOf(monthClosedBy(cycleClosesAtIso));
}

/** `2026-09` — le mois clos dont on prépare le lot. */
export function monthToPrepareKey(nextClosesAtIso: string): string {
  return keyOf(previous(monthClosedBy(nextClosesAtIso)));
}

function keyOf({ year, month }: YearMonth): string {
  return `${String(year)}-${String(month).padStart(2, '0')}`;
}

/** « de septembre », « d’octobre » : l'élision devant une voyelle. */
export function ofMonth(name: string): string {
  return /^[aeiouyàâéèêîôû]/iu.test(name) ? `d’${name}` : `de ${name}`;
}

/** « 1er novembre 2026 » — un instant, en jour de Paris. */
export function longDay(iso: string): string {
  const parts = LONG_DAY.formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  const date = part('day') === '1' ? '1er' : part('day');
  return `${date} ${part('month')} ${part('year')}`;
}

/** Pourquoi l'aperçu est vide quand la mise en service tombe après la clôture. */
export function notYetOpenSentence(floorAtIso: string, firstClosureIso: string): string {
  return (
    `Le premier mois prélevable se clôt le ${longDay(firstClosureIso)} : les commandes ` +
    `passées avant le ${longDay(floorAtIso)} (mise en service du prélèvement) ` +
    'n’entrent dans aucun lot.'
  );
}

/**
 * Pourquoi l'aperçu d'un mois prélevable est vide. L'aperçu lit TOUT ce qui
 * reste à prélever depuis la mise en service — un bon écarté d'un mois passé
 * revient — donc « vide » veut dire « rien depuis la mise en service ».
 */
export function emptyPreviewSentence(floorAtIso: string): string {
  return (
    'Aucune commande au compte n’attend d’être prélevée : ni ce mois-ci, ni d’un mois ' +
    `précédent depuis la mise en service du prélèvement (${longDay(floorAtIso)}).`
  );
}
