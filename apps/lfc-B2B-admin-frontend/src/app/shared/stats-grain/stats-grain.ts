/**
 * La **temporalité** d'un écran de statistiques : une granularité, et la fenêtre
 * de périodes qu'elle découpe.
 *
 * Une seule notion pour tout le back-office. Chaque graphe qui se choisissait sa
 * propre échelle finissait par répondre à une autre question que son voisin, et
 * personne ne pouvait comparer deux cartes de la même page.
 *
 * La **profondeur est attachée à la granularité**, pas au réglage : sept jours,
 * huit semaines, douze mois, huit trimestres, cinq ans. Ce ne sont pas des
 * nombres ronds mais des habitudes de lecture — une semaine se lit en jours, une
 * saison en mois, une tendance en années. Laisser l'écran choisir « 30 jours ou
 * 90 » aurait ajouté un second réglage pour la même question.
 *
 * Tout est en **heure locale** : une commande passée le 1er à 00h30 appartient
 * au 1er tel que l'équipe le dit, pas à la veille en UTC.
 */

/** Le pas de temps, du plus fin au plus large. */
export type StatsGrain = 'day' | 'week' | 'month' | 'quarter' | 'year';

/** Les segments du sélecteur, dans l'ordre du plus fin au plus large. */
export const STATS_GRAIN_OPTIONS = [
  { value: 'day', label: 'Jours' },
  { value: 'week', label: 'Semaines' },
  { value: 'month', label: 'Mois' },
  { value: 'quarter', label: 'Trimestres' },
  { value: 'year', label: 'Années' },
] as const satisfies ReadonlyArray<{ readonly value: StatsGrain; readonly label: string }>;

/** Combien de périodes la fenêtre montre, par granularité. */
export const STATS_GRAIN_SPANS: Readonly<Record<StatsGrain, number>> = {
  day: 7,
  week: 8,
  month: 12,
  quarter: 8,
  year: 5,
};

/** Une période de la fenêtre : `[start, end[`, et de quoi l'afficher. */
export interface StatsBucket {
  /** Clé stable et triable — `month-2026-08-01`. */
  readonly key: string;
  /** Ce que l'axe affiche — « août 26 », « T3 26 », « lun. 14 ». */
  readonly label: string;
  /** Premier instant de la période (inclus). */
  readonly start: Date;
  /** Premier instant de la période suivante (exclu). */
  readonly end: Date;
}

/** Vrai quand la chaîne est une granularité connue — garde pour une valeur d'écran. */
export function isStatsGrain(value: string): value is StatsGrain {
  return STATS_GRAIN_OPTIONS.some((option) => option.value === value);
}

const DAY_LABEL = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' });
const WEEK_LABEL = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' });
const MONTH_LABEL = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit' });

/** Le début de la période qui contient cet instant. */
function startOf(date: Date, grain: StatsGrain): Date {
  const [year, month, day] = [date.getFullYear(), date.getMonth(), date.getDate()];
  switch (grain) {
    case 'day':
      return new Date(year, month, day);
    case 'week': {
      // Semaine ISO : lundi. `getDay()` compte dimanche = 0, d'où le décalage.
      const monday = new Date(year, month, day);
      monday.setDate(day - ((monday.getDay() + 6) % 7));
      return monday;
    }
    case 'month':
      return new Date(year, month, 1);
    case 'quarter':
      return new Date(year, Math.floor(month / 3) * 3, 1);
    case 'year':
      return new Date(year, 0, 1);
  }
}

/**
 * Décale un **début de période** de `steps` périodes. Toujours appliqué au début
 * courant, jamais cumulé : `new Date(y, m + steps, 1)` normalise les débordements
 * d'année, là où douze soustractions successives auraient dérivé.
 */
function shift(start: Date, grain: StatsGrain, steps: number): Date {
  const [year, month, day] = [start.getFullYear(), start.getMonth(), start.getDate()];
  switch (grain) {
    case 'day':
      return new Date(year, month, day + steps);
    case 'week':
      return new Date(year, month, day + steps * 7);
    case 'month':
      return new Date(year, month + steps, 1);
    case 'quarter':
      return new Date(year, month + steps * 3, 1);
    case 'year':
      return new Date(year + steps, 0, 1);
  }
}

/** Le libellé d'axe d'une période, d'après son début. */
function labelOf(start: Date, grain: StatsGrain): string {
  switch (grain) {
    case 'day':
      return DAY_LABEL.format(start);
    case 'week':
      return WEEK_LABEL.format(start);
    case 'month':
      return MONTH_LABEL.format(start);
    case 'quarter':
      return `T${Math.floor(start.getMonth() / 3) + 1} ${`${start.getFullYear()}`.slice(2)}`;
    case 'year':
      return `${start.getFullYear()}`;
  }
}

/** `month-2026-08-01` — la granularité fait partie de la clé, deux fenêtres ne se mélangent pas. */
function keyOf(start: Date, grain: StatsGrain): string {
  const month = `${start.getMonth() + 1}`.padStart(2, '0');
  const day = `${start.getDate()}`.padStart(2, '0');
  return `${grain}-${start.getFullYear()}-${month}-${day}`;
}

/**
 * La fenêtre de périodes, **la plus ancienne en tête**, la période en cours en
 * queue. Elle est toujours pleine : les périodes sans rien y figurent, et c'est
 * le point — un trou doit se voir, pas se refermer.
 */
export function grainBuckets(grain: StatsGrain, today: Date): readonly StatsBucket[] {
  const current = startOf(today, grain);
  const buckets: StatsBucket[] = [];
  for (let back = STATS_GRAIN_SPANS[grain] - 1; back >= 0; back -= 1) {
    const start = shift(current, grain, -back);
    buckets.push({
      key: keyOf(start, grain),
      label: labelOf(start, grain),
      start,
      end: shift(current, grain, 1 - back),
    });
  }
  return buckets;
}

/** L'index de la période qui contient cet instant, ou `-1` hors fenêtre. */
export function bucketIndexOf(buckets: readonly StatsBucket[], iso: string): number {
  const at = new Date(iso).getTime();
  return buckets.findIndex((bucket) => at >= bucket.start.getTime() && at < bucket.end.getTime());
}
