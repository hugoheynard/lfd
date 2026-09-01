import type { LegalEntity } from "../entities/legal-entity.js";

/**
 * Port d'**écriture** des entités juridiques.
 *
 * Deux méthodes, et pas une de plus : l'agrégat porte des règles de durée (ICS
 * immuable, complétude pour encaisser) qu'une écriture ciblée du genre
 * `setIcs(id, ics)` contournerait en silence — la règle vivrait alors dans le
 * handler qui l'appelle, donc nulle part pour le prochain.
 *
 * `save` écrit une entité neuve comme une modifiée : l'identité est frappée par
 * la commande, pas par la base, donc la distinction n'existe pas ici.
 */
export abstract class LegalEntityRepository {
  /** L'entité par son id, ou `null`. Les value objects revalident à la relecture. */
  abstract load(id: string): Promise<LegalEntity | null>;

  /** Écrit l'agrégat entier, tel que `toPersistence()` le rend. */
  abstract save(entity: LegalEntity): Promise<void>;
}
