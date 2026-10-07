import { z } from "zod";

import {
  BIN_TYPE_NAME_MAX_LENGTH,
  binDimensionsSchema,
  type BinDimensions,
} from "./delivery-bins.js";
import {
  vehicleCargoPayloadSchema,
  vehicleWheelArchesPayloadSchema,
  type VehicleCargoView,
  type VehicleWheelArchesView,
} from "./delivery-settings.js";

/**
 * **La bibliothèque d'achat** (`documentation/livraisons/chargement/plan-bibliotheque-d-achat.md`,
 * B-D1, lot B1) : des véhicules et des formats de bacs qu'on envisage
 * d'acheter, SÉPARÉS de la flotte et du catalogue des bacs — aucun n'apparaît
 * dans « Planifier », les tournées, le chargement ni le colisage.
 *
 * Le schéma ne tient que la FORME ; les bornes des dimensions, de la pile, du
 * prix et la forme du lien d'achat sont celles du domaine, qui refuse avec la
 * phrase à lire.
 *
 * Le prix est **HT, en centimes entiers, indicatif** (B-D3) : `null` = inconnu,
 * jamais zéro. Aucun prix ne quitte la bibliothèque.
 */

/** Le nom d'un candidat : la borne des types de bacs et des véhicules (60). */
export const PURCHASE_CANDIDATE_NAME_MAX_LENGTH = BIN_TYPE_NAME_MAX_LENGTH;
/** Référence et fournisseur : une ligne de catalogue. */
export const PURCHASE_CANDIDATE_TEXT_MAX_LENGTH = 120;
/** Un lien d'achat, https uniquement. */
export const PURCHASE_URL_MAX_LENGTH = 2000;
/** Un million d'euros HT : au-delà, c'est une faute de frappe, pas un devis. */
export const PURCHASE_PRICE_MAX_CENTS = 100_000_000;

const name = () =>
  z
    .string()
    .trim()
    .min(1, "nom du candidat requis")
    .max(PURCHASE_CANDIDATE_NAME_MAX_LENGTH, "nom trop long (60 caractères au plus)");

/** Texte libre facultatif : `null` ou absent = non renseigné. Bornes au domaine. */
const optionalText = () => z.string().nullable().optional();
/** Prix HT en centimes : `null` ou absent = inconnu. Signe et borne au domaine. */
const optionalCents = () => z.number().int().nullable().optional();

/**
 * Charge d'un véhicule candidat, à la création comme à la correction. COMPLÈTE :
 * un champ facultatif absent vaut `null` — jamais « inchangé ». Le plancher
 * est obligatoire (un candidat sans dimensions ne se compare à rien) ; les
 * passages de roue portent leur hauteur, comme ceux d'un vrai véhicule.
 */
export const purchaseVehicleCandidatePayloadSchema = z.object({
  name: name(),
  cargo: vehicleCargoPayloadSchema,
  wheelArches: vehicleWheelArchesPayloadSchema.nullable().optional(),
  reference: optionalText(),
  purchaseUrl: optionalText(),
  priceCentsExclVat: optionalCents(),
});
export type PurchaseVehicleCandidatePayload = z.infer<typeof purchaseVehicleCandidatePayloadSchema>;

/** Charge d'un format de bac candidat — la géométrie d'un type de bac, plus l'achat. */
export const purchaseBinCandidatePayloadSchema = z.object({
  name: name(),
  outer: binDimensionsSchema,
  inner: binDimensionsSchema,
  isotherm: z.boolean(),
  maxStack: z.number().int(),
  supplier: optionalText(),
  reference: optionalText(),
  purchaseUrl: optionalText(),
  unitPriceCentsExclVat: optionalCents(),
});
export type PurchaseBinCandidatePayload = z.infer<typeof purchaseBinCandidatePayloadSchema>;

/** `?archives=inclure` rend aussi les archivés ; sans, la liste n'a que les candidats en cours. */
export const purchaseLibraryListQuerySchema = z.object({
  archives: z.literal("inclure").optional(),
});
export type PurchaseLibraryListQuery = z.infer<typeof purchaseLibraryListQuerySchema>;

/** Qui a fait le dernier geste, figé à cet instant (nom et rôle vides si l'annuaire l'ignorait). */
export interface PurchaseCandidateAuthorView {
  readonly staffUserId: string;
  readonly name: string;
  readonly role: string;
}

/** Ce que les deux candidats ont en commun : l'achat et le cycle de vie. */
interface PurchaseCandidateCommonView {
  readonly id: string;
  readonly name: string;
  readonly reference: string | null;
  readonly purchaseUrl: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly updatedBy: PurchaseCandidateAuthorView;
  /** Archivé le, ou `null` s'il est en cours. */
  readonly archivedAt: string | null;
}

/** Un véhicule candidat : son plancher (volume DÉRIVÉ) et son prix HT. */
export interface PurchaseVehicleCandidateView extends PurchaseCandidateCommonView {
  readonly cargo: VehicleCargoView;
  readonly wheelArches: VehicleWheelArchesView | null;
  readonly priceCentsExclVat: number | null;
}

/** Un format de bac candidat : sa géométrie (volume intérieur DÉRIVÉ) et son prix unitaire HT. */
export interface PurchaseBinCandidateView extends PurchaseCandidateCommonView {
  readonly outer: BinDimensions;
  readonly inner: BinDimensions;
  readonly innerVolumeLiters: number;
  readonly isotherm: boolean;
  readonly maxStack: number;
  readonly supplier: string | null;
  readonly unitPriceCentsExclVat: number | null;
}

export interface PurchaseVehicleCandidatesView {
  readonly candidates: readonly PurchaseVehicleCandidateView[];
}

export interface PurchaseBinCandidatesView {
  readonly candidates: readonly PurchaseBinCandidateView[];
}
