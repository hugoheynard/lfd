import type { CustomerMandateOptionsView, SetMandateOptionsPayload } from '@lfd/contracts';

/**
 * Les **zones facultatives du mandat** telles qu'on les saisit — zone 14 (le
 * code que le débiteur veut voir sur son relevé) et zone 19 (le numéro du
 * contrat). Le brouillon de `lfd-mandate-options-form`, sa lecture et son payload.
 *
 * Pur, sans Angular : la fiche staff et `/mon-compte` les écrivent chacune par
 * son chemin, avec les mêmes règles. Aucune n'est obligatoire — la norme les
 * dit indicatives —, donc aucune validation de forme : vides est un état normal.
 */
export interface MandateOptionsDraft {
  readonly debtorReference: string;
  readonly contractNumber: string;
}

export const EMPTY_MANDATE_OPTIONS_DRAFT: MandateOptionsDraft = {
  debtorReference: '',
  contractNumber: '',
};

/** Préremplit depuis la lecture — la vue client, ou la vue staff qui la contient. */
export function mandateOptionsDraftFrom(view: CustomerMandateOptionsView): MandateOptionsDraft {
  return { debtorReference: view.debtorReference, contractNumber: view.contractNumber };
}

/**
 * Le brouillon diffère-t-il des zones relues ? C'est ce qui arme « Enregistrer »
 * (règle « Saisir » de l'app cliente, 2026-09-14). Comparé zone par zone,
 * rognées : un espace ajouté n'est pas une modification. Sans zones lues
 * (`null`), la référence est le brouillon vide.
 */
export function mandateOptionsDraftChanged(
  draft: MandateOptionsDraft,
  view: CustomerMandateOptionsView | null,
): boolean {
  const origin = view === null ? EMPTY_MANDATE_OPTIONS_DRAFT : mandateOptionsDraftFrom(view);
  const now = toMandateOptionsPayload(draft);
  const before = toMandateOptionsPayload(origin);
  return (
    now.debtorReference !== before.debtorReference || now.contractNumber !== before.contractNumber
  );
}

/** Le payload d'écriture : les deux zones, rognées. */
export function toMandateOptionsPayload(draft: MandateOptionsDraft): SetMandateOptionsPayload {
  return {
    debtorReference: draft.debtorReference.trim(),
    contractNumber: draft.contractNumber.trim(),
  };
}

/** Les **libellés** de `lfd-mandate-options-form` ; le défaut est le texte de la fiche staff. */
export interface MandateOptionsFormLabels {
  readonly debtorReference: string;
  readonly debtorReferenceHint: string;
  readonly debtorReferencePlaceholder?: string;
  readonly contractNumber: string;
  readonly contractNumberHint: string;
  readonly contractNumberPlaceholder?: string;
}

export const MANDATE_OPTIONS_FORM_LABELS_FR: MandateOptionsFormLabels = {
  debtorReference: 'Code identifiant du débiteur',
  debtorReferenceHint: 'Zone 14 — ce que le client verra revenir sur son relevé bancaire.',
  debtorReferencePlaceholder: 'C-9P2X4B',
  contractNumber: 'Numéro du contrat',
  contractNumberHint: 'Zone 19 — facultatif.',
};
