import {
  PURCHASE_CANDIDATE_NAME_MAX_LENGTH,
  type PurchaseBinCandidatePayload,
  type PurchaseBinCandidateView,
  type PurchaseVehicleCandidatePayload,
  type PurchaseVehicleCandidateView,
} from '@lfd/contracts';

import { centsToEurosInput, parseEurosToCents } from './purchase-price';

/**
 * Les saisies de **la bibliothèque d'achat**
 * (`documentation/livraisons/plan-bibliotheque-d-achat.md`, B-D1, lot B4) :
 * ce qu'on tape dans les dialogues, et la charge COMPLÈTE qui part — un champ
 * facultatif absent vaut `null` côté serveur, jamais « inchangé ».
 *
 * L'écran ne dit que ce qu'il sait sans le domaine : un champ vide, un prix
 * illisible, des passages de roue à moitié saisis. Les bornes des cotes, la
 * pile, le lien https sont au serveur, dont le refus s'affiche tel quel.
 */

/** Trois cotes saisies ; `null` tant que le champ est vide. */
export interface CmDraft {
  readonly lengthCm: number | null;
  readonly widthCm: number | null;
  readonly heightCm: number | null;
}

export interface VehicleCandidateDraft {
  readonly name: string;
  readonly cargo: CmDraft;
  readonly archLengthCm: number | null;
  readonly archProtrusionCm: number | null;
  readonly archFromBackCm: number | null;
  readonly archHeightCm: number | null;
  readonly reference: string;
  readonly purchaseUrl: string;
  /** Le prix HT tel que tapé, en euros : « 12,50 ». */
  readonly price: string;
}

export interface BinCandidateDraft {
  readonly name: string;
  readonly outer: CmDraft;
  readonly inner: CmDraft;
  readonly maxStack: number | null;
  readonly isotherm: boolean;
  readonly supplier: string;
  readonly reference: string;
  readonly purchaseUrl: string;
  readonly price: string;
}

export type Reading<T> =
  { readonly ok: true; readonly payload: T } | { readonly ok: false; readonly issue: string };

const EMPTY_CM: CmDraft = { lengthCm: null, widthCm: null, heightCm: null };

/** Le brouillon d'un ajout (`undefined`) ou d'une correction. */
export function vehicleDraftOf(
  view: PurchaseVehicleCandidateView | undefined,
): VehicleCandidateDraft {
  const arches = view?.wheelArches ?? null;
  return {
    name: view?.name ?? '',
    cargo:
      view === undefined
        ? EMPTY_CM
        : {
            lengthCm: view.cargo.lengthCm,
            widthCm: view.cargo.widthCm,
            heightCm: view.cargo.heightCm,
          },
    archLengthCm: arches?.lengthCm ?? null,
    archProtrusionCm: arches?.protrusionCm ?? null,
    archFromBackCm: arches?.fromBackCm ?? null,
    archHeightCm: arches?.heightCm ?? null,
    reference: view?.reference ?? '',
    purchaseUrl: view?.purchaseUrl ?? '',
    price: centsToEurosInput(view?.priceCentsExclVat ?? null),
  };
}

export function binDraftOf(view: PurchaseBinCandidateView | undefined): BinCandidateDraft {
  return {
    name: view?.name ?? '',
    outer: view?.outer ?? EMPTY_CM,
    inner: view?.inner ?? EMPTY_CM,
    maxStack: view?.maxStack ?? null,
    isotherm: view?.isotherm ?? false,
    supplier: view?.supplier ?? '',
    reference: view?.reference ?? '',
    purchaseUrl: view?.purchaseUrl ?? '',
    price: centsToEurosInput(view?.unitPriceCentsExclVat ?? null),
  };
}

/** Un texte facultatif : rogné, et vide → `null`. */
function optional(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}

function readName(name: string, what: string): string | { readonly issue: string } {
  const trimmed = name.trim();
  if (trimmed === '') return { issue: `Nommez ${what}.` };
  if (trimmed.length > PURCHASE_CANDIDATE_NAME_MAX_LENGTH) {
    return {
      issue: `Nom trop long (${String(PURCHASE_CANDIDATE_NAME_MAX_LENGTH)} caractères au plus).`,
    };
  }
  return trimmed;
}

function readCm(draft: CmDraft): { lengthCm: number; widthCm: number; heightCm: number } | null {
  const { lengthCm, widthCm, heightCm } = draft;
  return lengthCm === null || widthCm === null || heightCm === null
    ? null
    : { lengthCm, widthCm, heightCm };
}

type ArchesReading =
  | { readonly ok: true; readonly arches: PurchaseVehicleCandidatePayload['wheelArches'] }
  | { readonly ok: false; readonly issue: string };

/** Les quatre cotes des passages de roue, ou aucune. */
function readArches(draft: VehicleCandidateDraft): ArchesReading {
  const { archLengthCm, archProtrusionCm, archFromBackCm, archHeightCm } = draft;
  if (
    archLengthCm !== null &&
    archProtrusionCm !== null &&
    archFromBackCm !== null &&
    archHeightCm !== null
  ) {
    return {
      ok: true,
      arches: {
        lengthCm: archLengthCm,
        protrusionCm: archProtrusionCm,
        fromBackCm: archFromBackCm,
        heightCm: archHeightCm,
      },
    };
  }
  const none =
    archLengthCm === null &&
    archProtrusionCm === null &&
    archFromBackCm === null &&
    archHeightCm === null;
  return none
    ? { ok: true, arches: null }
    : { ok: false, issue: 'Passages de roue : les quatre cotes, ou aucune.' };
}

export function readVehicleDraft(
  draft: VehicleCandidateDraft,
): Reading<PurchaseVehicleCandidatePayload> {
  const name = readName(draft.name, 'le véhicule');
  if (typeof name !== 'string') return { ok: false, issue: name.issue };
  const cargo = readCm(draft.cargo);
  if (cargo === null) return { ok: false, issue: 'Saisissez les trois cotes du plancher.' };
  const arches = readArches(draft);
  if (!arches.ok) return arches;
  const price = parseEurosToCents(draft.price);
  if (!price.ok) return price;
  return {
    ok: true,
    payload: {
      name,
      cargo,
      wheelArches: arches.arches,
      reference: optional(draft.reference),
      purchaseUrl: optional(draft.purchaseUrl),
      priceCentsExclVat: price.cents,
    },
  };
}

export function readBinDraft(draft: BinCandidateDraft): Reading<PurchaseBinCandidatePayload> {
  const name = readName(draft.name, 'le format');
  if (typeof name !== 'string') return { ok: false, issue: name.issue };
  const outer = readCm(draft.outer);
  if (outer === null) return { ok: false, issue: 'Saisissez les trois cotes extérieures.' };
  const inner = readCm(draft.inner);
  if (inner === null) return { ok: false, issue: 'Saisissez les trois cotes intérieures.' };
  if (draft.maxStack === null) return { ok: false, issue: 'Saisissez la pile maximale.' };
  const price = parseEurosToCents(draft.price);
  if (!price.ok) return price;
  return {
    ok: true,
    payload: {
      name,
      outer,
      inner,
      isotherm: draft.isotherm,
      maxStack: draft.maxStack,
      supplier: optional(draft.supplier),
      reference: optional(draft.reference),
      purchaseUrl: optional(draft.purchaseUrl),
      unitPriceCentsExclVat: price.cents,
    },
  };
}

const ARCHIVED_DAY = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeZone: 'Europe/Paris',
});

/** « archivé le 12 septembre 2026 » — le jour à Paris, pas en UTC. */
export function archivedOnLabel(archivedAt: string): string {
  return `archivé le ${ARCHIVED_DAY.format(new Date(archivedAt))}`;
}

/** « 60 × 40 × 30 cm » */
export function cmLabel(dims: { lengthCm: number; widthCm: number; heightCm: number }): string {
  return `${String(dims.lengthCm)} × ${String(dims.widthCm)} × ${String(dims.heightCm)} cm`;
}
