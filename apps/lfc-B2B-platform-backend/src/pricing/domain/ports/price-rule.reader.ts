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
}
