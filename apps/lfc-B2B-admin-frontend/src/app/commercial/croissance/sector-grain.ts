import type { SectorRevenueView } from '@lfd/contracts';

/** Granularité temporelle du CA par secteur NAF. */
export type SectorGrain = 'day' | 'week' | 'month' | 'quarter' | 'year';

/** Options du `<select>` de granularité (ordre du plus fin au plus large). */
export const SECTOR_GRAINS: ReadonlyArray<{ readonly value: SectorGrain; readonly label: string }> = [
  { value: 'day', label: 'Jour' },
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'quarter', label: 'Trimestre' },
  { value: 'year', label: 'Année' },
];

/** Séries ré-agrégées sur un axe de périodes (labels prêts à l'affichage). */
export interface BucketedRevenue {
  readonly labels: readonly string[];
  readonly series: ReadonlyArray<{ readonly label: string; readonly values: readonly number[] }>;
}

const MONTHS = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];

/** « 2026-08-17 » → « 17/08 ». */
function weekLabel(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${day}/${month}`;
}

/** Lundi (ISO) de la semaine d'un jour — même convention que le backend (semaine ISO). */
function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  const diff = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

/** Clé de regroupement d'un jour (ISO) selon la granularité. */
function bucketKey(iso: string, grain: SectorGrain): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  switch (grain) {
    case 'day':
      return iso;
    case 'week':
      return mondayOf(iso);
    case 'month':
      return `${year}-${String(month + 1).padStart(2, '0')}`;
    case 'quarter':
      return `${year}-Q${Math.floor(month / 3) + 1}`;
    case 'year':
      return `${year}`;
  }
}

/** Libellé d'affichage d'une clé de période. */
function bucketLabel(key: string, grain: SectorGrain): string {
  switch (grain) {
    case 'day':
    case 'week':
      return weekLabel(key);
    case 'month': {
      const [year, month] = key.split('-');
      return `${MONTHS[Number(month) - 1] ?? month} ${year}`;
    }
    case 'quarter': {
      const [year, quarter] = key.split('-Q');
      return `T${quarter} ${year}`;
    }
    case 'year':
      return key;
  }
}

/**
 * Ré-agrège un `SectorRevenueView` **quotidien** vers la granularité choisie en
 * additionnant les jours qui tombent dans la même période (semaine/mois/trimestre/année,
 * d'après la date du jour ; « jour » est l'identité). Fonction pure ; l'axe reste
 * chronologique (l'ordre des jours source est préservé) et les libellés sont prêts à afficher.
 */
export function bucketSectorRevenue(view: SectorRevenueView, grain: SectorGrain): BucketedRevenue {
  const order: string[] = [];
  const indexOf = new Map<string, number>();
  for (const iso of view.days) {
    const key = bucketKey(iso, grain);
    if (!indexOf.has(key)) {
      indexOf.set(key, order.length);
      order.push(key);
    }
  }
  const series = view.series.map((s) => {
    const values = new Array<number>(order.length).fill(0);
    view.days.forEach((iso, i) => {
      const bucket = indexOf.get(bucketKey(iso, grain)) ?? 0;
      values[bucket] = (values[bucket] ?? 0) + (s.daily[i] ?? 0);
    });
    return { label: s.label, values };
  });
  return { labels: order.map((k) => bucketLabel(k, grain)), series };
}
