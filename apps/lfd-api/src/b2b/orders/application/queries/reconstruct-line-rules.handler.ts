import type { LineRuleReconstructionView, PriceRuleView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { PricingBoardReader } from "../../../pricing/application/ports/pricing-board.reader.js";
import { unexplainedRules } from "../../../pricing/application/unexplained-rules.js";
import { suspendedAt } from "../../../pricing/application/suspension-window.js";
import { PricingJournalReader } from "../../../pricing/domain/ports/pricing-journal.reader.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { ReconstructLineRulesQuery } from "./reconstruct-line-rules.query.js";

/**
 * **L'autre moitié de « pourquoi ce prix »** — ce que la trace figée ne pouvait
 * pas garder.
 *
 * Une règle dont l'audience ou la portée ne visait pas cette ligne n'a **jamais
 * atteint** le moteur : elle n'est ni dans les étages, ni dans les écartées. La
 * seule façon de la nommer est de relire les décisions du jour.
 *
 * 🔴 **Le tableau DATÉ est réutilisé, et ce n'est pas une commodité.** Il sait
 * déjà dire « quelles décisions étaient en vigueur ce jour-là » (R17), et
 * écrire ici une seconde réponse à cette question ferait exactement ce que ce
 * dossier redoute : deux implémentations d'une même règle, dont celle qu'on
 * regarde le moins finit par diverger. C'est l'argument qui a fait exporter
 * `compareSpecificity`.
 *
 * ⚠️ **Le coût est celui d'un tableau entier**, pour une question portant sur
 * une ligne. C'est assumé : le geste est un clic de staff, quelques fois par
 * jour, et c'est la lecture que l'écran de tarification fait déjà. La refaire en
 * plus étroit fabriquerait la seconde vérité qu'on vient d'écarter.
 */
@QueryHandler(ReconstructLineRulesQuery)
export class ReconstructLineRulesHandler implements IQueryHandler<
  ReconstructLineRulesQuery,
  LineRuleReconstructionView
> {
  constructor(
    private readonly orders: OrderReader,
    private readonly board: PricingBoardReader,
    private readonly journal: PricingJournalReader,
  ) {}

  async execute(query: ReconstructLineRulesQuery): Promise<LineRuleReconstructionView> {
    const owned = await this.orders.findById(query.orderId);
    if (owned === null) {
      throw new OrderNotFoundError(query.orderId);
    }
    const order = owned.view;
    const line = order.lines.find((candidate) => candidate.sku === query.sku);
    if (line === undefined) {
      throw new OrderNotFoundError(query.orderId);
    }

    const at = new Date(order.placedAt);
    const targeting = await this.targeting(query.sku, at);
    // Ce que la trace explique déjà : les étages qui ont agi, et les règles que
    // le moteur a regardées puis écartées. Les répéter ici les ferait apparaître
    // deux fois sur le même écran, avec deux vocabulaires.
    const explained = new Set([
      ...(line.pricing?.steps ?? []).map((step) => step.ruleId),
      ...(line.pricing?.rejected ?? []).map((entry) => entry.ruleId),
    ]);

    const candidates = targeting.filter((rule) => !explained.has(rule.id));
    const suspended = new Set<string>();
    for (const rule of candidates) {
      // Une lecture par règle, et il y en a une poignée. Le journal n'offre pas
      // de lecture par lot, et lui en ajouter une pour un clic de staff serait
      // payer un port de plus pour un gain qu'on ne mesurerait pas.
      if (suspendedAt(await this.journal.forSubject("rule", rule.id), at)) {
        suspended.add(rule.id);
      }
    }

    return {
      at: order.placedAt,
      rules: unexplainedRules(candidates, explained, order.companyId, suspended),
    };
  }

  /**
   * Les règles qui **visaient cet article** ce jour-là : celles de sa famille et
   * de sa fiche, plus celles du catalogue entier.
   *
   * L'article absent du tableau rend une liste vide plutôt qu'une erreur : il a
   * pu être retiré de la vente depuis, et une commande passée reste explicable
   * même quand son article ne l'est plus.
   */
  private async targeting(sku: string, at: Date): Promise<readonly PriceRuleView[]> {
    const board = await this.board.read(at);
    const category = board.categories.find((candidate) =>
      candidate.items.some((item) => item.sku === sku),
    );
    const item = category?.items.find((candidate) => candidate.sku === sku);
    return [...board.globalRules, ...(category?.rules ?? []), ...(item?.rules ?? [])];
  }
}
