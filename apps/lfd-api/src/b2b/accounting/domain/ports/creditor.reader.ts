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

  /**
   * L'émetteur **unique** — pour les documents qui n'ont pas d'entité à leur
   * disposition, comme le mandat d'un client.
   *
   * 🔴 Il **refuse** plutôt que de choisir quand plusieurs entités actives
   * existent. La table en prévoit plusieurs depuis le premier jour : LFC peut
   * émettre sous deux entités, et une seconde doit rester une ligne. Le jour où
   * il y en aura deux, un mandat émis « au hasard » nommerait le mauvais
   * créancier sur un papier signé — l'erreur qu'un mandat ne pardonne pas, et
   * qui ne se verrait qu'en contestation.
   *
   * Choisir sera alors une décision d'écran, pas un défaut de code.
   *
   * @returns `null` si aucune entité active n'existe.
   * @throws {SeveralIssuersError} plusieurs entités actives.
   * @throws {EntityCannotCollectError} l'entité existe mais ne peut pas encaisser.
   */
  abstract soleIssuer(): Promise<CreditorSnapshot | null>;
}
