import type { PricingRule } from "../entities/pricing-rule.js";
import type { PricingAct } from "../pricing-act.js";

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
 * refus.
 *
 * Et chaque écriture prend son **acte**. Un port qui accepterait une mutation
 * sans sa trace laisserait un appelant en écrire une sans journal — au premier
 * oubli, à la première branche d'erreur, au premier chemin de rattrapage. Un
 * argument obligatoire ne s'oublie pas ; un second appel, si. L'adaptateur écrit
 * les deux dans la **même transaction**.
 */
export abstract class PricingRuleRepository {
  abstract save(rule: PricingRule, act: PricingAct): Promise<void>;

  /**
   * Enregistre une **transition** — pause, reprise, archivage.
   *
   * Distincte de `save` alors que le SQL est presque le même : poser une règle et
   * en arrêter une sont deux intentions, et l'appelant qui se trompe doit s'en
   * apercevoir à la compilation plutôt qu'en relisant le journal six mois plus
   * tard.
   *
   * Il n'y a **pas** de `remove` : rien ne s'efface. Une règle a facturé, elle a
   * fait un prix, et la supprimer effacerait la réponse à « pourquoi ce prix »
   * alors que la facture, elle, reste.
   */
  abstract update(rule: PricingRule, act: PricingAct): Promise<void>;

  /** L'agrégat, pour lui appliquer une transition. `null` s'il n'existe pas. */
  abstract load(id: string): Promise<PricingRule | null>;
}
