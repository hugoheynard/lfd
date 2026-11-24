import type { ResupplyArticle } from "../../domain/resupply-catalogue.js";

/**
 * Les articles du catalogue publié que les bancs du réassort se partagent —
 * recopiés dans huit specs jusqu'au 2026-11-03 (audit final du réassort).
 * Une suite qui a besoin d'un autre article le déclare chez elle.
 */

export const CROISSANT: ResupplyArticle = {
  sku: "CRO",
  name: "Croissant",
  categoryId: "fam_morning",
  categoryName: "Viennoiseries",
  family: { id: "fam_morning", name: "Viennoiseries", position: 0 },
  saleUnit: "piece",
};

export const PAIN_AU_CHOCOLAT: ResupplyArticle = {
  sku: "PAC",
  name: "Pain au chocolat",
  categoryId: "fam_morning",
  categoryName: "Viennoiseries",
  family: { id: "fam_morning", name: "Viennoiseries", position: 0 },
  saleUnit: "piece",
};

export const BAGUETTE: ResupplyArticle = {
  sku: "BAG",
  name: "Baguette",
  categoryId: "fam_bread",
  categoryName: "Pains",
  family: { id: "fam_bread", name: "Pains", position: 1 },
  saleUnit: "piece",
};

/** Au poids : sa quantité compte des grammes (L2b-1). */
export const SALMON: ResupplyArticle = {
  sku: "SAU",
  name: "Saumon gravlax",
  categoryId: "fam_deli",
  categoryName: "Traiteur",
  family: { id: "fam_deli", name: "Traiteur", position: 2 },
  saleUnit: "weight",
};

/** Les deux viennoiseries, le jeu le plus courant. */
export const PASTRIES: readonly ResupplyArticle[] = [CROISSANT, PAIN_AU_CHOCOLAT];
