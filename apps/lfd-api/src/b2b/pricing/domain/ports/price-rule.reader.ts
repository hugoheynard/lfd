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
  abstract candidatesFor(context: PricingContext): Promise<PriceRule[]>;

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
