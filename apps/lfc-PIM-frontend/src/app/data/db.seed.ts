/**
 * Le **store local résiduel du POC** — versionné dans le repo, embarqué dans le
 * build. Catalogue, familles, TVA, emplacements, bindings **et** l'état de
 * publication Shopify (réconciliation à trois voies) vivent désormais tous côté
 * backend. Ce store ne porte donc plus aucune donnée métier : il ne subsiste que
 * pour le bouton « réinitialiser » des réglages, en attendant son retrait complet.
 */
export type DbShape = Record<string, never>;

// Store vide : le POC de publication a migré vers le backend (réconciliation).
export const DB_SEED: DbShape = {};
