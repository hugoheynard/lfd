import type { OrderPreflightView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../infra/time/clock.js";
import { customerWarnings } from "../../domain/customer-warnings.js";
import { AlertCompanyReader } from "../../domain/ports/company.reader.js";
import { EvaluateBasket } from "../handlers/evaluate-basket.service.js";
import { PreflightOrderAlertsQuery } from "./preflight-order-alerts.query.js";

/**
 * Le **garde-fou de saisie** : évalue un panier avant la commande et rend ce qui
 * mérite d'être dit au client, ligne par ligne.
 *
 * Trois silences, tous volontaires — et tous rendus par une réponse **vide**,
 * jamais par une erreur : le panier n'est pas invalide, il n'y a simplement rien
 * à dire. Faire échouer l'appel obligerait l'écran à traiter en panne ce qui est
 * un cas normal.
 *
 * 1. **Pas de société** — une commande zéro friction n'a aucun historique auquel
 *    se comparer.
 * 2. **Pas membre, ou société non active** — l'habitude d'achat d'un compte ne se
 *    montre qu'à ce compte.
 * 3. **Rien de coché « client »** — les règles tournent, mais pour le staff.
 */
@QueryHandler(PreflightOrderAlertsQuery)
export class PreflightOrderAlertsHandler implements IQueryHandler<
  PreflightOrderAlertsQuery,
  OrderPreflightView
> {
  constructor(
    private readonly companies: AlertCompanyReader,
    private readonly basket: EvaluateBasket,
    private readonly clock: Clock,
  ) {}

  async execute(query: PreflightOrderAlertsQuery): Promise<OrderPreflightView> {
    const { companyId, lines } = query.payload;
    if (companyId === null || lines.length === 0) {
      return EMPTY;
    }
    if (!(await this.companies.isActiveMember(query.actorUserId, companyId))) {
      return EMPTY;
    }

    const { drafts, rules } = await this.basket.evaluate({
      companyId,
      // Aucun nom d'affichage : la commande n'existe pas, donc aucun nom n'a été
      // figé — et le message client ne nomme pas le produit de toute façon.
      lines: lines.map((line) => ({
        sku: line.sku,
        productName: line.sku,
        quantity: line.quantity,
      })),
      excludeOrderId: null,
      now: this.clock.now(),
    });
    return { warnings: customerWarnings(drafts, rules) };
  }
}

/** Rien à signaler — la réponse normale, pas un cas d'erreur. */
const EMPTY: OrderPreflightView = { warnings: [] };
