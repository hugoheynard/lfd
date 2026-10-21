import type { GeneralOrderCutoffRule } from "./general-order-cutoff.js";

/**
 * Port d'**écriture** de la règle générale : on la charge, on la règle par
 * {@link GeneralOrderCutoffRule.redefine}, on la range. Pas de suppression :
 * l'interrupteur de l'heure limite générale est le geste qui l'éteint, et la
 * règle reste en base pour qu'il la remette telle quelle.
 */
export abstract class GeneralOrderCutoffRepository {
  /** La règle rangée, ou `null` tant que personne ne l'a posée. */
  abstract load(): Promise<GeneralOrderCutoffRule | null>;

  /**
   * Range la règle (création ou mise à jour, par son identifiant).
   *
   * @throws {DuplicateOrderCutoffError} une autre règle générale a été posée entre
   * la lecture et l'écriture.
   */
  abstract save(rule: GeneralOrderCutoffRule): Promise<void>;
}
