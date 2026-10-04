import type { Weekday, WindowMode } from '@lfd/contracts';

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
  /** Le bouton qui ajoute un créneau à la liste (CA3b). */
  readonly slotAdd: string;
  /** `{slot}` : le créneau retiré, dans le nom accessible du bouton. */
  readonly slotRemove: string;
  /** Dit sous une liste vide. */
  readonly slotsNone: string;
  /** Dit quand le créneau tapé en chevauche un déjà posé. */
  readonly slotOverlap: string;
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
  /** Remplace `signatureHint` quand « pas de contact » est coché : il dit pourquoi « exigée » a disparu. */
  readonly signatureNoContactHint: string;
  /** « Créneau ou échéance » pour cette adresse (CA-D2). */
  readonly windowMode: string;
  readonly windowModeHint: string;
  /** `{mode}` : ce dont l'adresse hérite, dit en toutes lettres. */
  readonly windowModeInherit: string;
  /** Le mode, en bas de casse, dans `windowModeInherit`. */
  readonly windowModeSlotLower: string;
  readonly windowModeDeadlineLower: string;
  readonly windowModeSlot: string;
  readonly windowModeDeadline: string;
  readonly deadlinesLegend: string;
  readonly sameDeadlinesEveryDay: string;
  readonly sameDeadlinesEveryDayHint: string;
  /** Le mot devant une échéance : « avant 06:00 ». */
  readonly deadlineBefore: string;
  /** Le libellé du champ horaire qui ajoute une échéance. */
  readonly deadlineNew: string;
  readonly deadlineAdd: string;
  /** `{deadline}` : l'échéance retirée, dans le nom accessible du bouton. */
  readonly deadlineRemove: string;
  /** Dit sous une liste vide. */
  readonly deadlinesNone: string;
}

/** Le texte d'avant l'entrée, mot pour mot — le défaut, et ce que lit le back-office. */
export const DELIVERY_SPECS_LABELS_FR: DeliverySpecsLabels = {
  detailLegend: 'Détail de livraison',
  slotsLegend: 'Créneaux préférés',
  sameEveryDay: 'Les mêmes créneaux tous les jours',
  sameEveryDayHint: 'décochez pour définir des créneaux par jour',
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
  slotAdd: 'Ajouter',
  slotRemove: 'Retirer {slot}',
  slotsNone: 'Aucun créneau',
  slotOverlap: 'Ce créneau en chevauche un autre déjà posé.',
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
  signatureNoContactHint: 'sans contact sur place, personne ne peut signer à la remise',
  windowMode: 'Créneau ou échéance',
  windowModeHint: 'un créneau a un début et une fin ; une échéance, seulement une heure limite',
  windowModeInherit: 'Comme le réglage général ({mode})',
  windowModeSlotLower: 'créneau',
  windowModeDeadlineLower: 'échéance',
  windowModeSlot: 'Créneau',
  windowModeDeadline: 'Échéance',
  deadlinesLegend: 'Échéances préférées',
  sameDeadlinesEveryDay: 'Les mêmes échéances tous les jours',
  sameDeadlinesEveryDayHint: 'décochez pour définir des échéances par jour',
  deadlineBefore: 'avant',
  deadlineNew: 'Nouvelle échéance',
  deadlineAdd: 'Ajouter',
  deadlineRemove: 'Retirer {deadline}',
  deadlinesNone: 'Aucune échéance',
};

/** Les trois réponses à « créneau ou échéance ? » — l'héritage DIT ce dont il hérite. */
export function windowModeOptionsOf(
  labels: DeliverySpecsLabels,
  globalMode: WindowMode,
): readonly { readonly value: string; readonly label: string }[] {
  const inherited =
    globalMode === 'deadline' ? labels.windowModeDeadlineLower : labels.windowModeSlotLower;
  return [
    { value: 'inherit', label: labels.windowModeInherit.replace('{mode}', inherited) },
    { value: 'slot', label: labels.windowModeSlot },
    { value: 'deadline', label: labels.windowModeDeadline },
  ];
}

/** Les trois réponses à « signe-t-on ici ? » — l'héritage DIT ce dont il hérite. */
export function signatureOptionsOf(
  labels: DeliverySpecsLabels,
  floor: boolean,
  noContact = false,
): readonly { readonly value: string; readonly label: string }[] {
  const inherited = floor ? labels.signatureFloorRequired : labels.signatureFloorNotRequired;
  const options = [
    { value: 'inherit', label: labels.signatureInherit.replace('{floor}', inherited) },
    { value: 'yes', label: labels.signatureRequired },
    { value: 'no', label: labels.signatureNotRequired },
  ];
  // Sans contact sur place, personne ne signe (Hugo, 2026-09-14) : ce qui exigerait
  // une signature — l'exigence posée ici, ou l'héritage d'une société qui l'exige —
  // n'est pas proposé. Inexprimable plutôt que refusé à l'envoi.
  if (!noContact) {
    return options;
  }
  return options.filter(
    (option) => option.value !== 'yes' && !(floor && option.value === 'inherit'),
  );
}
