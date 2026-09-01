import type { CreditorSnapshot } from "../creditor-snapshot.js";

/**
 * Port de **lecture** de l'émetteur — ce que `payments` et la facturation
 * consomment.
 *
 * Séparé de {@link LegalEntityRepository} par ISP, et la séparation porte plus
 * qu'une convention : ce port ne rend **jamais l'agrégat**, seulement une copie
 * figée. Un consommateur qui recevrait `LegalEntity` pourrait appeler
 * `moveTo()` — depuis un autre contexte, sur un agrégat qu'il ne possède pas.
 * Ici, il n'y a rien à muter.
 *
 * Le refus de complétude reste **dans l'agrégat** : `snapshot` rend `null` pour
 * une entité inconnue, mais laisse remonter `EntityCannotCollectError` pour une
 * entité connue et inutilisable. Les deux cas n'appellent pas le même geste —
 * l'un est un identifiant faux, l'autre une fiche à compléter.
 */
export abstract class CreditorReader {
  /**
   * L'émetteur figé, prêt à être recopié sur un mandat ou une facture.
   *
   * @throws {EntityCannotCollectError} l'entité existe mais ne peut pas encaisser.
   */
  abstract snapshot(legalEntityId: string): Promise<CreditorSnapshot | null>;
}
