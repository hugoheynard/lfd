import { scopesOf, type PricingScopes } from "../pricing-scopes.js";
import type { PricingContext, ScopedPriceFloor } from "../price-rule.js";

/**
 * Port de **lecture** des planchers.
 *
 * Séparé de `PriceRuleReader` alors que les deux servent le même calcul : ce
 * sont deux questions différentes (ISP). Le chemin qui facture lit les deux ;
 * l'écran de paramétrage, lui, lit les planchers seuls quand il n'affiche que la
 * colonne des limites. Un port unique aurait forcé ce second appelant à
 * demander des règles dont il ne fait rien.
 *
 * Comme pour les règles, l'adaptateur rend des **candidats** et non le gagnant :
 * choisir est une décision de domaine, elle reste éprouvable sans base.
 */
export abstract class PriceFloorReader {
  /** Les planchers qui visent **potentiellement** cet article. */
  /**
   * Les planchers qui visent **l'une des portées de ce panier**.
   *
   * 🔴 **L'unique lecture de sélection.** Elle était posée une fois par article,
   * avec le même `WHERE` à un identifiant près : un panier de vingt lignes
   * faisait vingt requêtes là où une suffit. Ce que la clause sélectionne ne
   * dépend que de la fenêtre et de l'audience — toutes deux gelées pour l'appel
   * — et d'une égalité de portée, qui devient un `IN`.
   *
   * Le résultat est **rangé par portée** côté application (`ScopeIndex`), ce qui
   * rend à chaque article exactement ce que sa clause lui rendait : ni plus, ni
   * moins. Cf. `scope-index.ts`, dont l'équivalence est éprouvée contre
   * `matchesScope` lui-même.
   */
  abstract inScopes(scopes: PricingScopes): Promise<ScopedPriceFloor[]>;

  /**
   * Les planchers candidates pour **un** article — la question du tableau de bord
   * et du simulateur.
   *
   * Concrète, et servie par {@link inScopes} : c'est ce qui garantit qu'un
   * seul `WHERE` décrit cette sélection. Deux clauses pour la même question
   * divergeraient le jour où l'une des deux apprend une condition, et ce
   * jour-là c'est un prix qu'on n'explique plus.
   */
  async candidatesFor(context: PricingContext): Promise<ScopedPriceFloor[]> {
    return this.inScopes(scopesOf(context));
  }

  /**
   * Tous les planchers posés — ce que l'écran de paramétrage montre.
   *
   * Daté pour la même raison que les règles : une limite archivée hier
   * protégeait bien les prix du mois dernier, et une lecture passée qui
   * l'omettrait annoncerait une marge de négociation que personne n'a eue.
   */
  abstract listAll(at: Date): Promise<ScopedPriceFloor[]>;
}
