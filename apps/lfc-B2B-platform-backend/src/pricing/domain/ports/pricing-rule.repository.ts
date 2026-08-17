import type { PricingRule } from "../entities/pricing-rule.js";

/**
 * Port d'**écriture** des règles — séparé du port de lecture, et pas par goût
 * de la symétrie.
 *
 * Le chemin qui facture ne doit pas pouvoir écrire une règle : il n'injecte que
 * `PriceRuleReader`, et rien dans son graphe de dépendances ne lui donne accès à
 * `save`. Un port unique aurait rendu cette garantie déclarative — « on n'appelle
 * pas `save` là-bas » — au lieu de la rendre impossible.
 *
 * `save` prend un **agrégat**, jamais des primitives : c'est ce qui garantit que
 * tout ce qui entre en base est passé par `PricingRule.create`, donc par ses
 * quatre refus.
 */
export abstract class PricingRuleRepository {
  abstract save(rule: PricingRule): Promise<void>;

  /**
   * Retire une règle. Rend `false` si elle n'existait pas — l'appelant décide si
   * c'est un 404 ou un silence, le port ne tranche pas à sa place.
   */
  abstract remove(id: string): Promise<boolean>;
}
