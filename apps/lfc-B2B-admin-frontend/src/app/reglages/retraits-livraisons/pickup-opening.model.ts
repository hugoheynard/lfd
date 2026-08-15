import type { FulfillmentWindow, PickupOpening } from '@lfd/contracts';

/**
 * Brouillon de saisie des **heures d'un point de retrait**. Tout est chaîne
 * (`''` = vide), comme les autres formulaires d'adresse : la validité de forme
 * se contrôle ici, le backend garde le dernier mot.
 *
 * Les deux fenêtres restent **nommées et séparées** — c'est le contrat
 * (`pickupOpeningSchema`), pas une commodité d'écran : entre le créneau pro et
 * l'ouverture au public il peut y avoir une porte close, et les aplatir
 * inventerait une disponibilité qui n'existe pas.
 */
export interface OpeningDraft {
  readonly publicStart: string;
  readonly publicEnd: string;
  readonly proStart: string;
  readonly proEnd: string;
}

export const EMPTY_OPENING_DRAFT: OpeningDraft = {
  publicStart: '',
  publicEnd: '',
  proStart: '',
  proEnd: '',
};

/** Préremplit le brouillon depuis les heures enregistrées. */
export function openingDraftFrom(opening: PickupOpening): OpeningDraft {
  return {
    publicStart: opening.publicOpening?.start ?? '',
    publicEnd: opening.publicOpening?.end ?? '',
    proStart: opening.proPickup?.start ?? '',
    proEnd: opening.proPickup?.end ?? '',
  };
}

/**
 * Une fenêtre déclarée, ou `null` si les deux bornes sont vides.
 *
 * Ici les **deux** bornes sont exigées : une plage d'ouverture se lit « de X à
 * Y ». Le contrat autorise un début absent parce qu'un *client* peut demander
 * « avant 8h » — ce n'est pas la même phrase, et l'admettre dans un réglage
 * ferait ouvrir le point à minuit.
 */
function windowOf(start: string, end: string): FulfillmentWindow | null {
  return start !== '' && end !== '' && start < end ? { start, end } : null;
}

/** Une fenêtre *entamée mais fausse* : une seule borne, ou fin ≤ début. */
function isBadWindow(start: string, end: string): boolean {
  const touched = start !== '' || end !== '';
  return touched && windowOf(start, end) === null;
}

/** Message d'erreur des heures (`''` si valide). */
export function openingIssueOf(draft: OpeningDraft): string {
  const bad =
    isBadWindow(draft.publicStart, draft.publicEnd) || isBadWindow(draft.proStart, draft.proEnd);
  return bad ? 'Renseignez une heure d’ouverture ET de fermeture, la fermeture après.' : '';
}

/** Une plage déclarée, prête à lire. */
export interface OpeningRow {
  readonly label: string;
  readonly text: string;
}

/**
 * Les plages déclarées, nommées, le créneau pro en tête. Liste **vide** = le
 * point n'oppose aucune heure — l'écran doit le dire, parce qu'alors n'importe
 * quelle heure de retrait sera acceptée.
 */
export function openingRows(opening: PickupOpening): readonly OpeningRow[] {
  const rows: OpeningRow[] = [];
  if (opening.proPickup !== null) {
    rows.push({ label: 'Pro', text: textOf(opening.proPickup) });
  }
  if (opening.publicOpening !== null) {
    rows.push({ label: 'Public', text: textOf(opening.publicOpening) });
  }
  return rows;
}

function textOf(window: FulfillmentWindow): string {
  return window.start === null ? `jusqu'à ${window.end}` : `${window.start}–${window.end}`;
}

/** Brouillon → heures du point. Une fenêtre non renseignée vaut `null`. */
export function toPickupOpening(draft: OpeningDraft): PickupOpening {
  return {
    publicOpening: windowOf(draft.publicStart, draft.publicEnd),
    proPickup: windowOf(draft.proStart, draft.proEnd),
  };
}
