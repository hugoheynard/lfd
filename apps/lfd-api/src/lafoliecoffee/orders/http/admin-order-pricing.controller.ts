import type { LineRuleReconstructionView } from "@lfd/contracts";
import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ReconstructLineRulesQuery } from "../application/queries/reconstruct-line-rules.query.js";

/**
 * **Pourquoi une décision tarifaire n'a rien produit sur cette ligne** — le
 * comptoir seulement.
 *
 * Un contrôleur à part de {@link AdminOrdersController}, et c'est le module qui
 * l'explique : cette lecture joint deux contextes, et sa question n'est pas
 * celle d'une commande. La séparer garde `OrdersModule` à l'écart des dépôts
 * d'écriture de la tarification.
 */
@AdminSurface("b2b_orders")
@Controller("admin/orders")
export class AdminOrderPricingController {
  constructor(private readonly queries: QueryBus) {}

  /**
   * **Ce que la trace figée ne pouvait pas dire** — les décisions en vigueur le
   * jour de la commande, sur cet article, dont la ligne ne parle pas.
   *
   * 🔴 **Reconstruit, et l'écran doit le dire.** Ce qui est figé sur la ligne est
   * sûr ; ceci est relu aujourd'hui. Ça tient parce que la fenêtre, l'audience et
   * la portée d'une règle ne se modifient jamais — mais un libellé se renomme, et
   * la suspension d'un jour donné ne se lit qu'au journal.
   *
   * Route à part de `GET /admin/orders/:id`, et pas un champ de plus : c'est la
   * lecture d'un tableau entier pour une question qu'on pose en cliquant. La
   * greffer sur la commande la ferait payer à chaque ouverture d'écran.
   */
  @Get(":id/lines/:sku/rules")
  async lineRules(
    @Param("id") id: string,
    @Param("sku") sku: string,
  ): Promise<LineRuleReconstructionView> {
    return this.queries.execute<ReconstructLineRulesQuery, LineRuleReconstructionView>(
      new ReconstructLineRulesQuery(id, sku),
    );
  }
}
