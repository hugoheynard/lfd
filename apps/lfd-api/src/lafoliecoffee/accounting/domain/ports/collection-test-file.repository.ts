import type { CollectionTestFile } from "../entities/collection-test-file.js";

/**
 * Port d'ÉCRITURE de l'envoi d'essai : il écrit l'envoi ET ses essais, dans
 * l'unité de travail de l'appelant. Un envoi est figé : il ne s'écrit qu'à sa
 * naissance. Le suivi d'une ligne (retour, remboursement) passe par
 * `CollectionTestRepository`.
 */
export abstract class CollectionTestFileRepository {
  abstract save(file: CollectionTestFile): Promise<void>;
}
