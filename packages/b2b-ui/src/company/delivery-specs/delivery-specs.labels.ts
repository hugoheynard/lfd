import type { Weekday } from '@lfd/contracts';

/**
 * Les **libellés** du fragment `lfd-delivery-specs`.
 *
 * Le fragment les écrivait en français en dur. Le back-office ne parle que
 * français, l'app cliente parle aussi anglais et italien — et le même fragment
 * sert les deux, par construction (parité de champs sans réécriture). Les mots
 * entrent donc par une entrée typée, dont le défaut est EXACTEMENT le texte
 * d'avant : l'admin, qui ne passe rien, ne change pas d'un caractère.
 *
 * Pur, sans Angular : c'est ce qui laisse les tests du paquet (Jest, Node) le
 * vérifier.
 */
export interface DeliverySpecsLabels {
  readonly detailLegend: string;
  readonly slotsLegend: string;
  readonly sameEveryDay: string;
  readonly sameEveryDayHint: string;
  /** Le nom de l'unique ligne quand le créneau est le même chaque jour. */
  readonly everyDay: string;
  /** Le nom de chaque ligne quand le créneau change selon le jour. */
  readonly weekdays: Readonly<Record<Weekday, string>>;
  /** Repris dans l'`aria-label` de chaque champ horaire, suivi du nom de la ligne. */
  readonly slotStart: string;
  readonly slotEnd: string;
  readonly contactLegend: string;
  readonly noContact: string;
  readonly noContactHint: string;
  readonly knownContact: string;
  readonly knownContactPlaceholder: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string;
  /** Dit sous le contact incomplet ; la RÈGLE reste `contactIssueOf`, seul le mot change. */
  readonly contactIncomplete: string;
  readonly signature: string;
  readonly signatureHint: string;
  /** `{floor}` : ce dont l'adresse hérite, dit en toutes lettres. */
  readonly signatureInherit: string;
  /** Le socle, en bas de casse, dans `signatureInherit`. */
  readonly signatureFloorRequired: string;
  readonly signatureFloorNotRequired: string;
  readonly signatureRequired: string;
  readonly signatureNotRequired: string;
}

/** Le texte d'avant l'entrée, mot pour mot — le défaut, et ce que lit le back-office. */
export const DELIVERY_SPECS_LABELS_FR: DeliverySpecsLabels = {
  detailLegend: 'Détail de livraison',
  slotsLegend: 'Créneaux préférés',
  sameEveryDay: 'Le même créneau tous les jours',
  sameEveryDayHint: 'décochez pour définir un créneau par jour',
  everyDay: 'Tous les jours',
  weekdays: {
    mon: 'Lundi',
    tue: 'Mardi',
    wed: 'Mercredi',
    thu: 'Jeudi',
    fri: 'Vendredi',
    sat: 'Samedi',
    sun: 'Dimanche',
  },
  slotStart: 'Début',
  slotEnd: 'Fin',
  contactLegend: 'Contact sur place',
  noContact: 'Pas de contact de livraison dédié',
  noContactHint: "cochez si le livreur n'a personne à prévenir sur place",
  knownContact: 'Reprendre un contact connu',
  knownContactPlaceholder: 'Choisir un contact…',
  firstName: 'Prénom',
  lastName: 'Nom',
  phone: 'Téléphone',
  contactIncomplete: 'Renseignez prénom, nom et téléphone, ou cochez « pas de contact ».',
  signature: 'Signature à la remise',
  signatureHint: 'préremplit les commandes livrées ici ; modifiable au panier',
  signatureInherit: 'Comme la société ({floor})',
  signatureFloorRequired: 'exigée',
  signatureFloorNotRequired: 'non exigée',
  signatureRequired: 'Exigée',
  signatureNotRequired: 'Non exigée',
};

/** Les trois réponses à « signe-t-on ici ? » — l'héritage DIT ce dont il hérite. */
export function signatureOptionsOf(
  labels: DeliverySpecsLabels,
  floor: boolean,
): readonly { readonly value: string; readonly label: string }[] {
  const inherited = floor ? labels.signatureFloorRequired : labels.signatureFloorNotRequired;
  return [
    { value: 'inherit', label: labels.signatureInherit.replace('{floor}', inherited) },
    { value: 'yes', label: labels.signatureRequired },
    { value: 'no', label: labels.signatureNotRequired },
  ];
}
