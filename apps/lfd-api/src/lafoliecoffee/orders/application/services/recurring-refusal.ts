import type { OccurrenceRefusalCause } from "../../../subscriptions/domain/ports/occurrence-run.ledger.js";
import { ReservedArticleRefusedError } from "../../../catalog/domain/errors/reserved-article-refused.error.js";
import { UnknownSkuError } from "../../../catalog/domain/errors/unknown-sku.error.js";
import {
  AppError,
  AuthorizationError,
  BusinessError,
  DomainError,
} from "../../../../platform/shared/errors/app-error.js";
import {
  OrderCutoffGraceError,
  PastOrderCutoffError,
  TermsNotGrantedError,
} from "../../domain/errors/order-errors.js";
import { OrdersClosedForAudienceError } from "../../domain/errors/orders-closed-for-audience.error.js";
import { ProductionPlanClosedError } from "../../domain/errors/production-plan-closed.error.js";
import { SameDayOrderClosedError } from "../../domain/errors/same-day-order-closed.error.js";
import { ServiceDayBeforeFirstOrderableDayError } from "../../domain/errors/service-day-before-first-orderable-day.error.js";

/**
 * Ce que le registre retient d'un refus de la passation : sa cause stable, sa
 * phrase, et s'il est **définitif** — l'heure limite passée ne se rouvre pas,
 * l'échéance est alors manquée.
 */
export interface RecurringRefusal {
  readonly cause: OccurrenceRefusalCause;
  readonly reason: string;
  readonly final: boolean;
}

/** Les refus que l'on sait nommer ; les autres refus métier gardent leur phrase. */
const NAMED: readonly {
  readonly is: (error: AppError) => boolean;
  readonly cause: OccurrenceRefusalCause;
  readonly final: boolean;
}[] = [
  { is: (e) => e instanceof PastOrderCutoffError, cause: "deadline_closed", final: true },
  // Sans dérogation, un rattrapage est une heure limite passée pour la machine.
  { is: (e) => e instanceof OrderCutoffGraceError, cause: "deadline_closed", final: true },
  { is: (e) => e instanceof ProductionPlanClosedError, cause: "plan_closed", final: false },
  { is: (e) => e instanceof SameDayOrderClosedError, cause: "plan_closed", final: false },
  { is: (e) => e instanceof UnknownSkuError, cause: "unavailable_sku", final: false },
  {
    is: (e) => e instanceof ReservedArticleRefusedError,
    cause: "reserved_elsewhere",
    final: false,
  },
  { is: (e) => e instanceof TermsNotGrantedError, cause: "no_settlement", final: false },
  { is: (e) => e instanceof OrdersClosedForAudienceError, cause: "shop_closed", final: false },
  {
    is: (e) => e instanceof ServiceDayBeforeFirstOrderableDayError,
    cause: "shop_closed",
    final: false,
  },
];

/**
 * **Un refus de la passation, traduit pour le registre** — ou `null` quand ce
 * n'en est pas un. Seules les erreurs de catégorie métier (`DomainError`,
 * `BusinessError`, `AuthorizationError`) sont des refus : elles disent un cas
 * réel, que le staff peut corriger. Une erreur technique ou inconnue n'est pas
 * un refus — elle remonte, ne s'inscrit pas, et le balayage suivant réessaie.
 */
export function recurringRefusalOf(error: unknown): RecurringRefusal | null {
  if (
    !(error instanceof DomainError) &&
    !(error instanceof BusinessError) &&
    !(error instanceof AuthorizationError)
  ) {
    return null;
  }
  const named = NAMED.find((entry) => entry.is(error));
  return {
    cause: named?.cause ?? "order_refused",
    reason: error.message,
    final: named?.final ?? false,
  };
}
