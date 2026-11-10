import { inForceFor } from "../specificity.js";
import { scopesOf, type PricingScopes } from "../pricing-scopes.js";
import type { PriceRule, PricingContext } from "../price-rule.js";

/**
 * Port de **lecture** des règles tarifaires.
 *
 * Lecture seule, et c'est voulu : le chemin qui facture ne doit pas pouvoir
 * écrire une règle. La saisie viendra par un autre port, avec son propre agrégat
 * et ses propres refus (S3).
 *
 * Le port rend des règles **candidates**, pas la gagnante : c'est le domaine qui
 * choisit, parce que la spécificité est une règle métier et qu'elle doit rester
 * éprouvable sans base. Un port qui rendrait « la bonne règle » aurait ramené le
 * cœur du sujet dans l'adaptateur SQL.
 */
export abstract class PriceRuleReader {
  /**
   * Les règles **potentiellement** applicables à cet article, ce client et cet
   * instant.
   *
   * L'adaptateur peut élaguer sur ce que SQL sait faire — la fenêtre de
   * validité, la portée, l'audience — mais il n'a pas à être exhaustif : la
   * fonction pure refiltre de toute façon. Une lecture large qui rend trois
   * règles de trop est sans conséquence ; une lecture trop étroite qui en
   * oublie une facture le mauvais prix.
   */
  /**
   * Les règles qui visent **l'une des portées de ce panier**.
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
  abstract inScopes(scopes: PricingScopes): Promise<PriceRule[]>;

  /**
   * Les règles candidates pour **un** article — la question du tableau de bord
   * et du simulateur.
   *
   * Concrète, et servie par {@link inScopes} : c'est ce qui garantit qu'un
   * seul `WHERE` décrit cette sélection. Deux clauses pour la même question
   * divergeraient le jour où l'une des deux apprend une condition, et ce
   * jour-là c'est un prix qu'on n'explique plus.
   */
  async candidatesFor(context: PricingContext): Promise<PriceRule[]> {
    return this.inScopes(scopesOf(context));
  }

  /**
   * **Les mêmes règles, à un instant PASSÉ** — la relecture d'un prix d'alors.
   *
   * Deux différences avec {@link inScopes}, et chacune ferme un défaut :
   *
   * - elle lit les **rangées**, à condition qu'elles l'aient été après `at`.
   *   Sans ça, ranger une règle la faisait disparaître du passé, alors que
   *   quatre affirmations du dépôt promettaient de la retrouver (R17) ;
   * - elle ne passe **pas par le cache**. Celui-ci retient des tables entières,
   *   pour tous les clients, sous une clé qui ne porte que le nom de la table :
   *   une lecture datée qui s'y rangerait servirait des lignes rangées **au
   *   chemin qui facture**.
   *
   * Concrète, et servie par {@link listAll} : c'est ce qui garantit que la
   * lecture datée n'a qu'une seule clause dans tout le dépôt. Elle est
   * **non cachée par construction**, pas par discipline — on ne peut pas
   * l'oublier ici, il n'y a rien à oublier.
   */
  async inScopesAt(scopes: PricingScopes, at: Date): Promise<PriceRule[]> {
    return inForceFor(await this.listAll(at), scopes);
  }

  /**
   * Toutes les règles posées — ce que l'écran de paramétrage montre.
   *
   * Distincte de `candidatesFor` parce qu'elle répond à une autre question :
   * « qu'a-t-on décidé ? » et non « que s'applique-t-il ici ? ». Une règle
   * expirée n'est candidate nulle part et doit pourtant rester visible, ne
   * serait-ce que pour être rouverte.
   *
   * `at` est l'instant **de lecture**, et il porte une nuance qui a déjà coûté
   * une fois : « archivée » se lit à cet instant, pas au présent. Une règle
   * rangée hier s'appliquait le mois dernier, et l'exclure d'une lecture datée
   * appauvrirait le passé à chaque rangement — sans que rien ne le signale.
   */
  abstract listAll(at: Date): Promise<PriceRule[]>;

  /**
   * **Ce qu'on a rangé**, du plus récemment archivé au plus ancien.
   *
   * Une lecture à part et non un drapeau sur `listAll` : « qu'est-ce qui
   * s'applique ? » et « qu'a-t-on retiré ? » sont deux questions, et mêler les
   * secondes aux premières alourdirait chaque nœud de l'écran pour un besoin
   * qu'on a trois fois par an.
   *
   * @param limit au-delà, ce n'est plus une mémoire consultable, c'est un export.
   */
  abstract listArchived(limit: number): Promise<PriceRule[]>;
}
