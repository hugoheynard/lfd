import type { CustomerAudience, OrderOpeningExemptionView } from '@lfd/contracts';

/** Où en est une clientèle, pour son badge : fermée, ouverte sous date, ouverte. */
export type OpeningState = 'closed' | 'from-date' | 'open';

/** La règle en vigueur d'une clientèle : son état, et la phrase qui la dit. */
export interface OpeningRule {
  readonly state: OpeningState;
  readonly sentence: string;
}

/** Ce qu'il faut savoir d'une clientèle pour dire sa règle. */
export interface OpeningFacts {
  readonly audience: CustomerAudience;
  readonly open: boolean;
  /** `AAAA-MM-JJ` ; `null` = aucune date. */
  readonly firstDay: string | null;
  /** Le jour à Paris, `AAAA-MM-JJ`. */
  readonly today: string;
  /** Les exemptions actives, toutes clientèles confondues. */
  readonly exemptions: readonly OrderOpeningExemptionView[];
}

const PEOPLE: Readonly<Record<CustomerAudience, { one: string; many: string }>> = {
  b2b: { one: 'aucun pro', many: 'les pros' },
  b2c: { one: 'aucun particulier', many: 'les particuliers' },
};

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];
/** Décalages de Sakamoto, un par mois, pour le jour de la semaine. */
const MONTH_OFFSETS = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];

/**
 * « jeudi 27 novembre » pour `2026-11-27`. Calculé sur les trois nombres de la
 * journée, sans passer par un instant : une journée nue n'a pas de fuseau, et
 * le poste ne doit pas pouvoir la décaler.
 */
export function frenchDay(day: string): string {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  const y = month < 3 ? year - 1 : year;
  const weekday =
    (y +
      Math.floor(y / 4) -
      Math.floor(y / 100) +
      Math.floor(y / 400) +
      (MONTH_OFFSETS[month - 1] ?? 0) +
      date) %
    7;
  return `${WEEKDAYS[weekday] ?? ''} ${String(date)} ${MONTHS[month - 1] ?? ''}`;
}

/**
 * Les exemptions qui jouent pour une clientèle. Une **société** est un compte
 * pro : elle ne vaut que pour les pros. Une **adresse** peut être celle d'un
 * pro comme d'un particulier — la vue ne le dit pas — et compte des deux côtés.
 */
export function exemptionsFor(
  audience: CustomerAudience,
  exemptions: readonly OrderOpeningExemptionView[],
): number {
  return audience === 'b2b'
    ? exemptions.length
    : exemptions.filter((exemption) => exemption.kind === 'email').length;
}

/** Une date restreint seulement si elle est postérieure à aujourd'hui. */
export function restricts(firstDay: string | null, today: string): boolean {
  return firstDay !== null && firstDay > today;
}

/**
 * **La règle en vigueur, en une phrase** (Hugo, 2026-10-28 : « que le panel
 * admin soit plus clair »). Fermée l'emporte sur la date ; une date passée ne
 * restreint plus rien. Pur, sans Angular.
 */
export function openingRule(facts: OpeningFacts): OpeningRule {
  const people = PEOPLE[facts.audience];
  if (!facts.open) {
    const count = exemptionsFor(facts.audience, facts.exemptions);
    const except = count === 0 ? '' : `, sauf ${String(count)} exemption${count > 1 ? 's' : ''}`;
    const later =
      facts.firstDay !== null && restricts(facts.firstDay, facts.today)
        ? ` À la réouverture, seuls les retraits et livraisons à partir du ${frenchDay(facts.firstDay)} seront acceptés.`
        : '';
    return {
      state: 'closed',
      sentence: `Fermée : ${people.one} ne peut commander${except}.${later}`,
    };
  }
  if (facts.firstDay !== null && restricts(facts.firstDay, facts.today)) {
    return {
      state: 'from-date',
      sentence: `Ouverte : commandes dès maintenant, pour un retrait ou une livraison à partir du ${frenchDay(facts.firstDay)}. Un jour antérieur est refusé, sauf exemption.`,
    };
  }
  return {
    state: 'open',
    sentence: `Ouverte : ${people.many} commandent pour n’importe quel jour servi.`,
  };
}

/**
 * Ce que la confirmation annonce avant de poser (ou de vider, `null`) la date
 * « Retraits et livraisons à partir du » : elle borne la JOURNÉE servie, pas
 * le moment où l'on commande.
 */
export function firstDayEffect(
  audience: CustomerAudience,
  day: string | null,
  today: string,
): string {
  const people = PEOPLE[audience].many;
  const capitalized = people.charAt(0).toUpperCase() + people.slice(1);
  if (day === null) {
    return `${capitalized} pourront commander pour n’importe quel jour servi.`;
  }
  if (!restricts(day, today)) {
    return day < today
      ? 'Cette date est passée : elle ne restreindra rien.'
      : 'Cette date est aujourd’hui : elle ne restreindra rien.';
  }
  return `${capitalized} pourront commander dès maintenant, mais seulement pour un retrait ou une livraison à partir du ${frenchDay(day)}.`;
}
