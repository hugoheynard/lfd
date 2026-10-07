import { z } from "zod";

import { BIN_TYPE_NAME_MAX_LENGTH, binDimensionsSchema } from "./delivery-bins.js";
import { vehicleCargoPayloadSchema, vehicleWheelArchesPayloadSchema } from "./delivery-settings.js";

/**
 * **L'assistant d'achat** (`documentation/livraisons/chargement/plan-geometrie-du-plancher.md`,
 * G-D3) : combien de bacs de tel format tiennent dans tel plancher, par
 * rangées transversales.
 *
 * Une LECTURE : `POST admin/livraison/assistant-achat` parce que le scénario
 * est un corps. Ni table, ni journal. Le schéma ne tient que la FORME ; les
 * bornes des dimensions, du jeu et de la pile sont celles du domaine
 * (`CargoSpace`, `BinTypeDimensions`, `BinType`), qui refuse avec la phrase à lire.
 */

/** Au plus dix formats comparés côte à côte. */
export const PURCHASE_ASSISTANT_MAX_FORMATS = 10;

/**
 * Une paire symétrique de passages de roue, mesurée au sol depuis le fond —
 * celle du véhicule, la HAUTEUR en moins d'obligation. Connue, des bacs
 * s'empilent par-dessus (G-D2 bis) ; absente, aucun (le calcul d'avant).
 */
export const wheelArchesPayloadSchema = vehicleWheelArchesPayloadSchema.extend({
  heightCm: z.number().int().optional(),
});
export type WheelArchesPayload = z.infer<typeof wheelArchesPayloadSchema>;

/** Un plancher : l'espace utile d'un véhicule, et ses passages de roue (`null` = rectangle). */
export const cargoFloorPayloadSchema = vehicleCargoPayloadSchema.extend({
  wheelArches: wheelArchesPayloadSchema.nullable(),
});
export type CargoFloorPayload = z.infer<typeof cargoFloorPayloadSchema>;

/** Un format de bac essayé : la géométrie d'un type de bac, sans identité — en mm, comme lui. */
export const purchaseAssistantFormatSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "nom du format requis")
    .max(BIN_TYPE_NAME_MAX_LENGTH, "nom trop long (60 caractères au plus)"),
  outer: binDimensionsSchema,
  inner: binDimensionsSchema,
  maxStack: z.number().int(),
});
export type PurchaseAssistantFormat = z.infer<typeof purchaseAssistantFormatSchema>;

export const purchaseAssistantPayloadSchema = z.object({
  floor: cargoFloorPayloadSchema,
  /** Le jeu entre bacs, ajouté à l'empreinte en long et en large (défaut côté écran : 1). */
  gapCm: z.number().int(),
  formats: z
    .array(purchaseAssistantFormatSchema)
    .min(1, "au moins un format de bac")
    .max(PURCHASE_ASSISTANT_MAX_FORMATS, "dix formats au plus"),
});
export type PurchaseAssistantPayload = z.infer<typeof purchaseAssistantPayloadSchema>;

/** Une rangée transversale, pour dessiner le plancher vu de dessus. */
export interface PurchaseAssistantRowView {
  /** Début de la rangée, depuis le fond. */
  readonly fromCm: number;
  /** Profondeur occupée, jeu compris. */
  readonly depthCm: number;
  /** Bacs en travers AU SOL. */
  readonly count: number;
  /** `length` : la longueur du bac dans celle du véhicule ; `turned` : tourné. */
  readonly orientation: "length" | "turned";
  /**
   * Bacs en travers AU-DESSUS des passages de roue (G-D2 bis), portés par la
   * colonne centrale. 0 sans hauteur de passage, hors passage, ou sans étage libre.
   */
  readonly overArchCount: number;
  /** Étage où ils commencent (0 = le sol), `⌈passage ÷ bac⌉` ; `null` si aucun. */
  readonly overArchFromLevel: number | null;
  /** Bacs de la rangée, tous étages. */
  readonly total: number;
}

/** Le meilleur rangement PAR RANGÉES d'un format — pas le meilleur de tous. */
export interface PurchaseAssistantFormatView {
  readonly name: string;
  /** Bacs au sol. */
  readonly floorCount: number;
  /** Étages des colonnes centrales. */
  readonly levels: number;
  /** Tous étages, bacs latéraux compris : plus `floorCount × levels` dès qu'il y en a. */
  readonly total: number;
  /** Volume INTÉRIEUR des bacs posés, litres arrondis à l'inférieur. */
  readonly usefulLiters: number;
  /** Part du volume du véhicule, pourcentage entier arrondi à l'inférieur. */
  readonly vehiclePercent: number;
  /** Ce qui arrête la pile : `maxStack` (`stack`) ou le plafond (`ceiling`). */
  readonly heightLimit: "stack" | "ceiling";
  readonly rows: readonly PurchaseAssistantRowView[];
}

/** Les formats dans l'ordre du corps. */
export interface PurchaseAssistantView {
  readonly vehicleVolumeLiters: number;
  readonly formats: readonly PurchaseAssistantFormatView[];
}
