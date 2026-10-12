/**
 * Les mots de l'écran **Prélèvement du mois** (plan
 * `documentation/comptabilite/prelevement/prelevement-automatique.md`, PA4).
 * Depuis M4b (plan `plan-rythme-de-facturation.md`, §16.9), un lot se nomme
 * par sa CLÔTURE et sa période, plus par un mois : les clients hebdomadaires
 * et bimensuels en ferment plusieurs par mois. L'écran garde son nom, que
 * trois messages du serveur citent.
 *
 * ## Une clôture se lit à Paris
 *
 * Une clôture est à 00h00 de Paris, soit la veille au soir en UTC. Le dernier
 * jour qu'elle FERME est celui de l'instant juste avant elle, lu dans le
 * fuseau des affaires.
 */

const LONG_DAY = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Paris',
});

interface DayParts {
  readonly day: string;
  readonly month: string;
  readonly year: string;
}

function partsOf(instant: Date): DayParts {
  const parts = LONG_DAY.formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  const day = part('day');
  return { day: day === '1' ? '1er' : day, month: part('month'), year: part('year') };
}

/**
 * « du 1er au 30 septembre 2026 », « du 28 septembre au 4 octobre 2026 » — la
 * période `[startsAt, closesAt[` d'un lot, jours de Paris, dernier jour
 * inclus : la forme du libellé que le serveur écrit (`periodLabelOf`), pour
 * les lots figés dont la vue ne porte que les deux instants.
 */
export function periodBetween(startsAtIso: string, closesAtIso: string): string {
  const first = partsOf(new Date(startsAtIso));
  const last = partsOf(new Date(new Date(closesAtIso).getTime() - 1));
  const lastText = `${last.day} ${last.month} ${last.year}`;
  if (first.year !== last.year) {
    return `du ${first.day} ${first.month} ${first.year} au ${lastText}`;
  }
  if (first.month !== last.month) {
    return `du ${first.day} ${first.month} au ${lastText}`;
  }
  return `du ${first.day} au ${lastText}`;
}

/** Deux instants ISO désignent-ils la même clôture ? Comparés en instants, pas en chaînes. */
export function sameClosure(a: string, b: string): boolean {
  return new Date(a).getTime() === new Date(b).getTime();
}

/** « 1er novembre 2026 » — un instant, en jour de Paris. */
export function longDay(iso: string): string {
  const { day, month, year } = partsOf(new Date(iso));
  return `${day} ${month} ${year}`;
}

/** Pourquoi l'aperçu est vide quand la mise en service tombe après la clôture. */
export function notYetOpenSentence(floorAtIso: string, firstClosureIso: string): string {
  return (
    `La première période prélevable se clôt le ${longDay(firstClosureIso)} : les commandes ` +
    `passées avant le ${longDay(floorAtIso)} (mise en service du prélèvement) ` +
    'n’entrent dans aucun lot.'
  );
}

/**
 * Pourquoi l'aperçu d'une période prélevable est vide. L'aperçu lit TOUT ce qui
 * reste à prélever depuis la mise en service — un bon écarté d'un mois passé
 * revient — donc « vide » veut dire « rien depuis la mise en service ».
 */
export function emptyPreviewSentence(floorAtIso: string): string {
  return (
    'Aucune commande au compte n’attend d’être prélevée : ni de cette période, ni d’une période ' +
    `précédente depuis la mise en service du prélèvement (${longDay(floorAtIso)}).`
  );
}
