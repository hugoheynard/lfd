import type { AppointmentPurpose } from '@lfd/contracts';

/**
 * Les **libellés des motifs**, partagés entre l'app client (qui les propose) et
 * l'admin (qui les lit dans sa file). Ici plutôt que dans `@lfd/contracts` :
 * le contrat porte le vocabulaire, pas la façon de l'écrire à l'écran.
 *
 * Deux libellés par motif — l'un se lit à la première personne dans le
 * formulaire (« Je veux… »), l'autre à la troisième dans une file (« Devis »).
 * Une seule formulation obligerait l'un des deux écrans à mal parler.
 */
interface PurposeCopy {
  /** Ce que le client choisit, à sa place — une phrase. */
  readonly choice: string;
  /** Ce que le staff lit en liste — deux mots, alignables en colonne. */
  readonly short: string;
}

const PURPOSES: Readonly<Record<AppointmentPurpose, PurposeCopy>> = {
  discover: { choice: "Découvrir l'offre et les tarifs", short: 'Découverte' },
  quote: { choice: 'Demander un devis', short: 'Devis' },
  order: { choice: 'Une commande en cours', short: 'Commande' },
  // Famille, et non action : le détail (créer, changer la fréquence, sauter une
  // échéance) est porté par le **sujet**, cf. `topic-labels`.
  recurring: { choice: 'Un panier récurrent', short: 'Récurrence' },
  billing: { choice: 'Facturation ou paiement', short: 'Facturation' },
  account: { choice: 'Mon compte et mon entreprise', short: 'Compte' },
  other: { choice: 'Autre demande', short: 'Autre' },
};

/** Les motifs dans l'ordre où on les propose — du plus fréquent au fourre-tout. */
export const APPOINTMENT_PURPOSES: readonly AppointmentPurpose[] = [
  'discover',
  'quote',
  'order',
  'recurring',
  'billing',
  'account',
  'other',
];

/** Le libellé long, tel que le client le choisit. */
export function purposeChoice(purpose: AppointmentPurpose): string {
  return PURPOSES[purpose].choice;
}

/** Le libellé court, tel que le staff le lit en file — et l'objet d'un e-mail. */
export function purposeShort(purpose: AppointmentPurpose): string {
  return PURPOSES[purpose].short;
}
