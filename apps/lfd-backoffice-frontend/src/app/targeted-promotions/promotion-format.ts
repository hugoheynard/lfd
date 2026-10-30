import type {
  PromotionAudienceKindValue,
  PromotionLifecycleState,
  PromotionView,
} from '@lfd/contracts';
import type { FoldBadgeVariant } from 'fold-ng';

/**
 * **Les mots de l'écran Promotions** — purs, partagés par la liste, la
 * fiche et la carte du site.
 */

export const STATE_LABEL: Readonly<Record<PromotionLifecycleState, string>> = {
  active: 'Active',
  scheduled: 'Programmée',
  paused: 'En pause',
  ended: 'Terminée',
  archived: 'Archivée',
};

export const STATE_VARIANT: Readonly<Record<PromotionLifecycleState, FoldBadgeVariant>> = {
  active: 'success',
  scheduled: 'info',
  paused: 'warning',
  ended: 'neutral',
  archived: 'neutral',
};

/** Un nœud de l'arbre des publics : le groupe, puis le choix dans le groupe. */
export interface AudienceNode {
  readonly kind: PromotionAudienceKindValue;
  readonly label: string;
}

export interface AudienceGroup {
  readonly label: string;
  readonly nodes: readonly AudienceNode[];
}

/**
 * **L'arbre des publics** (plan § 9 et § 12) : un seul menu, trois groupes.
 * « Tous sauf les pros actifs » n'est pas un choix de l'éditeur : c'est le
 * public de la reprise des remises de retrait, montré tel quel.
 */
export const AUDIENCE_TREE: readonly AudienceGroup[] = [
  { label: 'Tout le monde', nodes: [{ kind: 'everyone', label: 'Tout le monde' }] },
  {
    label: 'Particuliers',
    nodes: [
      { kind: 'individuals', label: 'Tous' },
      { kind: 'individuals_guest', label: 'Invités (sans compte)' },
      { kind: 'individuals_registered', label: 'Inscrits' },
    ],
  },
  {
    label: 'Pros',
    nodes: [
      { kind: 'pros', label: 'Tous' },
      { kind: 'pros_active', label: 'Actifs' },
      { kind: 'pros_pending', label: "En cours d'inscription" },
      { kind: 'company', label: 'Une société' },
      { kind: 'company_and_sites', label: 'Une société et ses sites' },
    ],
  },
];

const REPRISE_AUDIENCE = 'Tous sauf les pros actifs';

/** Le public en une ligne : « Pros · actifs ». */
export function audiencePhrase(audience: PromotionView['audience']): string {
  if (audience.kind === 'everyone_but_active_pros') {
    return REPRISE_AUDIENCE;
  }
  for (const group of AUDIENCE_TREE) {
    const node = group.nodes.find((candidate) => candidate.kind === audience.kind);
    if (node !== undefined) {
      return group.nodes.length === 1 ? node.label : `${group.label} · ${node.label.toLowerCase()}`;
    }
  }
  return audience.kind;
}

/** L'acheminement en une ligne ; le point nommé quand on connaît son nom. */
export function fulfillmentPhrase(
  fulfillment: PromotionView['fulfillment'],
  pickupNames: ReadonlyMap<string, string>,
): string {
  switch (fulfillment.kind) {
    case 'any':
      return 'Tous les acheminements';
    case 'pickup':
      return 'Retrait · tous les points';
    case 'pickup_point': {
      const id = fulfillment.pickupId ?? '';
      return `Retrait · ${pickupNames.get(id) ?? id}`;
    }
    case 'delivery':
      return 'Livraison';
  }
}

const BP_PER_PERCENT = 100;
const MILLICENTS_PER_EURO = 100_000;
const CENTS_PER_EURO = 100;

const EUROS = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const PERCENT = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

/** L'effet, dans son unité : « −20 % », « −0,50 € l'unité », « prix posé 1,20 € ». */
export function effectPhrase(effect: PromotionView['effect']): string {
  switch (effect.kind) {
    case 'percent_off':
      return `−${PERCENT.format(effect.value / BP_PER_PERCENT)} %`;
    case 'unit_amount_off':
      return `−${EUROS.format(effect.value / MILLICENTS_PER_EURO)} l'unité`;
    case 'fixed_unit_price':
      return `Prix posé ${EUROS.format(effect.value / MILLICENTS_PER_EURO)}`;
    case 'basket_amount_off':
      return `−${EUROS.format(effect.value / CENTS_PER_EURO)} sur le panier`;
  }
}

const DAY = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Paris',
});

/** La fin est exclue : le dernier jour couvert est la veille de la borne. */
const LAST_COVERED_MS = 1;

/** La fenêtre : « du 1 novembre 2026 au 30 novembre 2026 », ou « depuis le … ». */
export function windowPhrase(validFrom: string, validTo: string | null): string {
  const from = DAY.format(new Date(validFrom));
  if (validTo === null) {
    return `Depuis le ${from}, sans fin`;
  }
  const to = DAY.format(new Date(new Date(validTo).getTime() - LAST_COVERED_MS));
  return `Du ${from} au ${to}`;
}

/** Le résumé que le staff lit : « −20 % · Particuliers · inscrits · Retrait · Cœur de station ». */
export function summaryPhrase(
  view: PromotionView,
  pickupNames: ReadonlyMap<string, string>,
): string {
  return [
    effectPhrase(view.effect),
    audiencePhrase(view.audience),
    fulfillmentPhrase(view.fulfillment, pickupNames),
  ].join(' · ');
}

/** L'origine d'une promotion reprise, en mots ; `null` pour une saisie. */
export function originPhrase(legacySource: string | null): string | null {
  if (legacySource === null) {
    return null;
  }
  return legacySource.startsWith('pickup_discount:')
    ? 'Reprise de la remise de retrait du site'
    : "Reprise d'une règle des Règles de prix (étage promotion)";
}
