import { inForceFor } from "../specificity.js";
import { scopesOf, type PricingScopes } from "../pricing-scopes.js";
import type { PricingContext } from "../price-rule.js";
import type { VolumeLadder } from "../volume-ladder.js";

/**
 * Port de **lecture** des barèmes de volume.
 *
 * Séparé du port d'écriture pour la même raison que les règles : le chemin qui
 * facture ne doit pas pouvoir écrire un barème, et rien dans son graphe de
 * dépendances ne lui en donne le moyen.
 *
 * Rend des barèmes **candidats**, pas le gagnant : c'est le domaine qui choisit,
 * parce que la spécificité est une règle métier et qu'elle doit rester éprouvable
 * sans base.
 */
export abstract class VolumeLadderReader {
  /** Les barèmes potentiellement applicables à cet article, ce client, cet instant. */
  /**
   * Les barèmes qui visent **l'une des portées de ce panier**.
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
  abstract inScopes(scopes: PricingScopes): Promise<VolumeLadder[]>;

  /**
   * Les barèmes candidates pour **un** article — la question du tableau de bord
   * et du simulateur.
   *
   * Concrète, et servie par {@link inScopes} : c'est ce qui garantit qu'un
   * seul `WHERE` décrit cette sélection. Deux clauses pour la même question
   * divergeraient le jour où l'une des deux apprend une condition, et ce
   * jour-là c'est un prix qu'on n'explique plus.
   */
  async candidatesFor(context: PricingContext): Promise<VolumeLadder[]> {
    return this.inScopes(scopesOf(context));
  }

  /**
   * **Les mêmes barèmes, à un instant PASSÉ** — la relecture d'un prix d'alors.
   *
   * Même raison et même construction que `PriceRuleReader.inScopesAt` : elle lit
   * les rangés (rangés APRÈS `at`), et elle ne passe **pas par le cache**, qui
   * retient des tables entières pour tous les clients. Servie par
   * {@link listAll}, donc non cachée par construction.
   */
  async inScopesAt(scopes: PricingScopes, at: Date): Promise<VolumeLadder[]> {
    return inForceFor(await this.listAll(at), scopes);
  }

  /**
   * Tous les barèmes posés — ce que l'écran de paramétrage montre.
   *
   * Distincte de `candidatesFor` parce qu'elle répond à une autre question :
   * « qu'a-t-on décidé ? » et non « que s'applique-t-il ici ? ».
   *
   * `at` est l'instant **de lecture** : un barème archivé APRÈS lui existait
   * encore ce jour-là, et l'exclure appauvrirait le passé à chaque rangement.
   */
  abstract listAll(at: Date): Promise<VolumeLadder[]>;
}
