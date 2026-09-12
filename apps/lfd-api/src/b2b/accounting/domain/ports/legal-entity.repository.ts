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

  /**
   * Reste-t-il une **autre** entité en service que celle-ci ?
   *
   * Une question, pas un compteur : le handler n'a pas à interpréter un nombre,
   * et le jour où « en service » se complique (une entité suspendue ? une
   * entité d'un autre pays ?), la définition reste d'un seul côté du port.
   *
   * 🔴 C'est le seul endroit du contexte où une écriture a besoin de connaître
   * l'ENSEMBLE. Un agrégat ne voit pas ses frères — c'est ce qui l'empêche de
   * porter la règle « on ne peut pas archiver la dernière », et c'est pourquoi
   * elle vit dans le handler plutôt que dans `archive()`.
   */
  abstract hasAnotherActive(exceptId: string): Promise<boolean>;
}
