import type { JournalUnit } from '@lfd/contracts/journal-facts';
import { formatCents, formatMillicents, formatVatPercent } from '@lfd/b2b-ui/order';

/**
 * **Les formateurs par unité** — ce qu'un nombre ou une chaîne de charge devient
 * à l'écran, d'après l'unité que son schéma déclare (`.meta({ unit })`).
 *
 * L'unité vient du catalogue, jamais du nom de la clé : `priceCents` et
 * `priceMillicents` sont deux `number`, à trois ordres de grandeur l'un de
 * l'autre, et deviner l'unité d'après un suffixe finit par afficher un prix
 * cent fois trop grand. Un `Record` exhaustif : une unité ajoutée au catalogue
 * ne compile pas tant qu'elle n'a pas sa mise en forme ici.
 */
const FORMATTERS: Readonly<Record<JournalUnit, (value: number | string) => string | null>> = {
  cents: (value) => (typeof value === 'number' ? formatCents(value) : null),
  millicents: (value) => (typeof value === 'number' ? formatMillicents(value) : null),
  // 10 000 points de base = 100 % : la division vit ici, nommée, une fois.
  basisPoints: (value) =>
    typeof value === 'number' ? formatVatPercent(value / BASIS_POINTS_PER_PERCENT) : null,
  percent: (value) => (typeof value === 'number' ? formatVatPercent(value) : null),
  instant: (value) => (typeof value === 'string' ? factWhen(value) : null),
  day: (value) => (typeof value === 'string' ? factDay(value) : null),
  clockTime: (value) => (typeof value === 'string' ? value : null),
  minutes: (value) => (typeof value === 'number' ? `${formatNumber(value)} min` : null),
  days: (value) =>
    typeof value === 'number'
      ? `${formatNumber(value)} ${Math.abs(value) > 1 ? 'jours' : 'jour'}`
      : null,
  grams: (value) => (typeof value === 'number' ? `${formatNumber(value)} g` : null),
  kcal: (value) => (typeof value === 'number' ? `${formatNumber(value)} kcal` : null),
};

const BASIS_POINTS_PER_PERCENT = 100;

/** La valeur dans son unité, ou `null` si elle n'a pas la forme que l'unité attend. */
export function formatUnit(unit: JournalUnit, value: unknown): string | null {
  return typeof value === 'number' || typeof value === 'string' ? FORMATTERS[unit](value) : null;
}

/** « 1 234,5 » — un nombre sans unité, à la française. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 5 }).format(value);
}

/**
 * « 1 famille », « 12 familles ». En français, zéro et un sont au singulier :
 * « 0 article », pas « 0 articles ».
 */
export function formatCount(count: number, singular: string, plural: string): string {
  return `${formatNumber(count)} ${Math.abs(count) < 2 ? singular : plural}`;
}

/**
 * « 21 août 2026 à 14:32 ». Le journal affichait l'ISO brut, ce qui est lisible
 * par une machine et par personne d'autre — or il est fait pour être lu par des
 * humains. Heure **locale** : celui qui lit cherche « ce qui s'est passé ce
 * matin », pas un instant UTC.
 */
export function factWhen(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(at);
}

/**
 * « 19 septembre 2026 » — un jour CIVIL (`AAAA-MM-JJ`). Lu en UTC : un jour n'a
 * pas d'heure, et le lire en heure locale le ferait reculer d'une date à
 * l'ouest de Greenwich.
 */
export function factDay(iso: string): string {
  const at = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(at.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' }).format(at);
}
