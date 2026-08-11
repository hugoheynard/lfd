import type { AlertKind, AlertRule } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { Clock } from "../../../infra/time/clock.js";
import { activeRulesFor, resolveAccountRules } from "../../domain/account-alert-rules.js";
import { resolveGlobalRules } from "../../domain/alert-rules.js";
import { evaluateOrder } from "../../domain/evaluate-order.js";
import { AccountAlertOverridesStore } from "../../domain/ports/account-alert-overrides.store.js";
import { AccountAlertRepository } from "../../domain/ports/account-alert.repository.js";
import { AlertRulesStore } from "../../domain/ports/alert-rules.store.js";
import {
  AccountOrderHistoryReader,
  ProductNormReader,
} from "../../domain/ports/order-history.reader.js";
import { EvaluatedOrderReader } from "../../domain/ports/evaluated-order.reader.js";

/**
 * Évalue une commande contre les règles effectives de son compte, et inscrit ce
 * qui se déclenche au journal.
 *
 * Orchestration seule : les seuils vivent dans les détecteurs (purs), la
 * résolution des règles dans le domaine, les filtres d'historique dans
 * l'adaptateur. Ce service ne fait que **relier** — c'est ce qui le garde court
 * et testable à ports mockés.
 *
 * Deux portes en tête, dans cet ordre : pas de société → rien à surveiller ;
 * société non active → personne pour agir sur l'alerte.
 */
@Injectable()
export class EvaluateOrderAlerts {
  constructor(
    private readonly rules: AlertRulesStore,
    private readonly overrides: AccountAlertOverridesStore,
    private readonly orders: EvaluatedOrderReader,
    private readonly history: AccountOrderHistoryReader,
    private readonly norms: ProductNormReader,
    private readonly journal: AccountAlertRepository,
    private readonly clock: Clock,
  ) {}

  async evaluate(orderId: string): Promise<void> {
    const order = await this.orders.read(orderId);
    // Une commande zéro friction n'appartient à aucun compte : ni historique
    // auquel la comparer, ni fiche où loger l'alerte. Une société non active n'a
    // pas d'habitudes à surveiller, et personne pour agir.
    if (order === null || order.companyId === null || !order.companyActive) {
      return;
    }

    const effective = activeRulesFor(
      resolveAccountRules(
        resolveGlobalRules(await this.rules.readAll()),
        await this.overrides.readForCompany(order.companyId),
      ),
    );
    if (effective.size === 0) {
      return;
    }

    const now = this.clock.now();
    const skus = order.lines.map((line) => line.sku);
    const [history, norms] = await Promise.all([
      this.history.read({
        companyId: order.companyId,
        excludeOrderId: order.id,
        skus,
        windowDays: widestWindow(effective),
        maxOrdersPerSku: MAX_BASELINE_ORDERS,
        now,
      }),
      this.norms.read(skus),
    ]);

    const drafts = evaluateOrder({ lines: order.lines, norms, ...history }, effective);
    await this.journal.record(
      drafts.map((draft) => ({
        ...draft,
        companyId: order.companyId ?? "",
        orderId: order.id,
        orderNumber: order.orderNumber,
        occurredAt: now,
      })),
    );
  }
}

/**
 * Le plafond du contrat (`baselineOrders` ≤ 50). On lit large **une fois** plutôt
 * qu'au plus juste par règle : chaque détecteur retaille ensuite ce qui le
 * concerne, et une seule lecture sert toutes les règles.
 */
const MAX_BASELINE_ORDERS = 50;

/**
 * La fenêtre la plus large demandée par une règle active — on lit **une** fois
 * pour toutes les règles, et chacune retaille ensuite ce qui la concerne.
 *
 * Tous les types n'ont pas de fenêtre (`first_order` regarde tout l'historique) :
 * on prend le maximum de celles qui en déclarent une.
 */
function widestWindow(rules: ReadonlyMap<AlertKind, AlertRule>): number {
  let widest = MIN_WINDOW_DAYS;
  for (const rule of rules.values()) {
    if ("windowDays" in rule.params) {
      widest = Math.max(widest, rule.params.windowDays);
    }
  }
  return widest;
}

const MIN_WINDOW_DAYS = 30;
