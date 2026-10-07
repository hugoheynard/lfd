import { z } from "zod";

/**
 * **Le tableau croisé de la bibliothèque d'achat**
 * (`documentation/livraisons/chargement/plan-bibliotheque-d-achat.md`, B-D4, lot B2) :
 * chaque véhicule choisi × chaque format choisi, par la stratégie « maximiser
 * un format » de l'assistant.
 *
 * Une LECTURE : `POST admin/livraison/assistant-achat/tableau` parce que la
 * sélection est un corps. La sélection CITE des identifiants, candidats ou
 * réels ; le serveur relit les cotes et les prix d'aujourd'hui. Le schéma ne
 * tient que la forme ; le jeu est borné par le domaine.
 *
 * L'argent est en **centimes HT entiers**, et un prix inconnu rend `null`,
 * jamais zéro (B-D3).
 */

/** Au plus dix véhicules en lignes. */
export const PURCHASE_TABLE_MAX_VEHICLES = 10;
/** Au plus dix formats en colonnes. */
export const PURCHASE_TABLE_MAX_FORMATS = 10;

/** Un véhicule cité : candidat de la bibliothèque ou véhicule de la flotte. */
export const purchaseTableVehicleRefSchema = z.object({
  source: z.enum(["candidate", "fleet"]),
  id: z.string().min(1, "identifiant du véhicule requis"),
});
export type PurchaseTableVehicleRef = z.infer<typeof purchaseTableVehicleRefSchema>;

/** Un format cité : candidat de la bibliothèque ou type de bac du catalogue. */
export const purchaseTableFormatRefSchema = z.object({
  source: z.enum(["candidate", "bin_type"]),
  id: z.string().min(1, "identifiant du format requis"),
});
export type PurchaseTableFormatRef = z.infer<typeof purchaseTableFormatRefSchema>;

export const purchaseTablePayloadSchema = z.object({
  vehicles: z
    .array(purchaseTableVehicleRefSchema)
    .min(1, "au moins un véhicule")
    .max(PURCHASE_TABLE_MAX_VEHICLES, "dix véhicules au plus"),
  formats: z
    .array(purchaseTableFormatRefSchema)
    .min(1, "au moins un format de bac")
    .max(PURCHASE_TABLE_MAX_FORMATS, "dix formats au plus"),
  /** Le jeu entre bacs, ajouté à l'empreinte en long et en large. */
  gapCm: z.number().int(),
});
export type PurchaseTablePayload = z.infer<typeof purchaseTablePayloadSchema>;

/** Une colonne : le format tel qu'il a été relu. */
export interface PurchaseTableFormatView {
  readonly source: PurchaseTableFormatRef["source"];
  readonly id: string;
  readonly name: string;
  readonly innerVolumeLiters: number;
  /** Prix unitaire HT en centimes ; `null` = inconnu (toujours le cas d'un type réel). */
  readonly unitPriceCentsExclVat: number | null;
}

/** Une case : un format dans un véhicule. */
export interface PurchaseTableCellView {
  /** Bacs tous étages, bacs au-dessus des passages de roue compris. */
  readonly total: number;
  /** Bacs au sol. */
  readonly floorCount: number;
  /** Étages des colonnes centrales. */
  readonly levels: number;
  /** Volume INTÉRIEUR des bacs posés, litres arrondis à l'inférieur. */
  readonly usefulLiters: number;
  /** Taux d'occupation : part du volume du véhicule, pourcentage entier arrondi à l'inférieur. */
  readonly vehiclePercent: number;
  readonly heightLimit: "stack" | "ceiling";
  /** `total × prix unitaire` ; `null` si le prix du format est inconnu. */
  readonly equipmentCostCents: number | null;
  /** Prix du véhicule + équipement ; `null` si l'un des deux est inconnu. */
  readonly totalCostCents: number | null;
  /**
   * Coût total ÷ litres utiles, en **centimes par litre**, arrondi à l'entier
   * le plus proche (moitié vers le haut) ; `null` si le coût total est inconnu
   * ou si aucun litre n'est posé.
   */
  readonly costPerLiterCents: number | null;
}

/**
 * La meilleure case d'une ligne pour chaque critère : l'INDEX dans `cells`
 * (donc dans `formats`), `null` si aucune case ne se classe. À égalité, la
 * première colonne l'emporte.
 */
export interface PurchaseTableRowBestView {
  /** Le plus fort taux d'occupation, parmi les cases qui posent au moins un bac. */
  readonly occupation: number | null;
  /** Le plus grand volume utile, parmi les cases qui posent au moins un litre. */
  readonly volume: number | null;
  /** Le plus faible coût par litre, parmi les cases qui en ont un. */
  readonly costPerLiter: number | null;
}

/** Une ligne : un véhicule, ses cases dans l'ordre des formats. */
export interface PurchaseTableRowView {
  readonly source: PurchaseTableVehicleRef["source"];
  readonly id: string;
  readonly name: string;
  readonly vehicleVolumeLiters: number;
  /** Prix HT du véhicule en centimes ; `null` = inconnu (toujours le cas d'un véhicule de la flotte). */
  readonly priceCentsExclVat: number | null;
  readonly cells: readonly PurchaseTableCellView[];
  readonly best: PurchaseTableRowBestView;
}

/** Les lignes dans l'ordre des véhicules du corps, les colonnes dans l'ordre des formats. */
export interface PurchaseTableView {
  readonly gapCm: number;
  readonly formats: readonly PurchaseTableFormatView[];
  readonly rows: readonly PurchaseTableRowView[];
  /**
   * « Quel véhicule ? » : l'index de la ligne dont la meilleure case a le plus
   * faible coût par litre ; `null` si aucune case n'en a. À égalité, la
   * première ligne.
   */
  readonly bestRowByCostPerLiter: number | null;
}
