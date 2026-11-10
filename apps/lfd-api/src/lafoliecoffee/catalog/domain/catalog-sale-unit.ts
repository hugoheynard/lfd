/**
 * L'unité dans laquelle un article se vend : des pièces, ou des grammes
 * (`documentation/pricing/vente-au-poids.md`).
 *
 * Dans son fichier pour que le port de lecture et l'entité la partagent sans
 * s'importer l'un l'autre.
 */
export type CatalogSaleUnit = "piece" | "weight";
