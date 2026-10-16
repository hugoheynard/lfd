/**
 * **Le verrou et le numéro d'ordre** des faits du catalogue (C4 de
 * `documentation/catalogue/plan-catalogue-synchronise-par-audience.md`).
 *
 * Deux gestes simultanés sur la même fiche émettent deux instantanés. Pour que
 * le plus récent gagne côté plateforme, le numéro doit suivre l'ordre des
 * validations — d'où le verrou PUIS le numéro : en `READ COMMITTED`, ce qu'on
 * relit après avoir obtenu le verrou contient l'écriture de la transaction qui
 * le tenait, émise sous un numéro plus petit.
 *
 * Toujours triés par identifiant, toujours sur la même table par nature de
 * fait : deux émetteurs ne peuvent pas s'interbloquer.
 */
export abstract class PublicationSequence {
  /** Verrouille les fiches existantes parmi `ids`, triées ; rend celles qui existent. */
  abstract lockProducts(ids: readonly string[]): Promise<string[]>;
  /** Verrouille les familles existantes parmi `ids`, triées ; rend celles qui existent. */
  abstract lockCategories(ids: readonly string[]): Promise<string[]>;
  /**
   * Verrouille les règles globales du catalogue (lot 2b) — un verrou à part,
   * jamais pris avec celui d'une fiche : pas d'interblocage possible.
   */
  abstract lockRules(): Promise<void>;
  /** Tire le numéro suivant — à appeler APRÈS le verrou. */
  abstract next(): Promise<number>;
}
