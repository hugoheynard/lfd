import { z } from "zod";

/**
 * Le **catalogue**, tel qu'un écran le parcourt.
 *
 * Il existait déjà trois copies de la même table de produits — le PIM, le seed
 * du front client (avec visuels et descriptions), et le seed du backend (avec
 * les prix qui font foi au checkout). Une quatrième pour le back-office aurait
 * été la copie de trop : celle où le commercial annonce au téléphone un prix que
 * le serveur refusera ensuite.
 *
 * D'où ce contrat : le back-office lit le catalogue **du serveur**, celui-là
 * même qui ré-résout les prix à la passation. Ce qu'il affiche est donc, par
 * construction, ce qui sera facturé.
 */

/**
 * Les familles de produits. Un **code**, pas l'identifiant `cat_*` du PIM : ce
 * dernier est une clé de sa base, et la faire transiter ici lierait le
 * back-office au schéma d'une autre application.
 */
export const catalogCategorySchema = z.enum([
  "viennoiserie",
  "pain",
  "patisserie",
  "sale",
  "chocolat",
]);
export type CatalogCategory = z.infer<typeof catalogCategorySchema>;

/** Les libellés d'écran, dans l'ordre où le catalogue se parcourt. */
export const CATALOG_CATEGORY_LABELS: Readonly<Record<CatalogCategory, string>> = {
  viennoiserie: "Viennoiseries",
  pain: "Pains",
  patisserie: "Pâtisseries",
  sale: "Salé & traiteur",
  chocolat: "Chocolat & confiserie",
};

/** L'ordre d'affichage — celui de la vitrine, pas l'alphabet. */
export const CATALOG_CATEGORY_ORDER: readonly CatalogCategory[] = [
  "viennoiserie",
  "pain",
  "patisserie",
  "sale",
  "chocolat",
];

/**
 * Un article du catalogue. Prix unitaire **HT** en centimes et taux de TVA du
 * **produit** — les deux nombres dont une ligne de panier a besoin pour
 * s'afficher juste avant d'être envoyée.
 */
export interface CatalogItemView {
  readonly sku: string;
  readonly name: string;
  readonly unitPriceCents: number;
  /** Taux de TVA en %, ex. 5.5 (alimentaire) ou 20 (non-alimentaire). */
  readonly vatRate: number;
  readonly category: CatalogCategory;
}
