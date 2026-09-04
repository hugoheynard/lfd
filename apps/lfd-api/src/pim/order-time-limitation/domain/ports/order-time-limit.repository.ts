import type { OrderTimeLimitView } from "@lfd/pim-contracts";

import type { WriteTicket } from "../../../journal/pim-journal.js";

import type { OrderTimeLimit } from "../entities/order-time-limit.js";
import type { LimitScope } from "../value-objects/limit-scope.js";

/**
 * Port des **limites de prise de commande**.
 *
 * `save` prend l'agrégat, jamais des primitives : c'est lui qui garantit qu'une
 * règle dit quelque chose et que sa portée est cohérente. Un
 * `setDaysBefore(id, n)` aurait rendu ces deux invariants contournables depuis
 * n'importe quel handler.
 *
 * `list` rend des **vues** et non des agrégats : la résolution ne mute rien, et
 * lui donner des entités l'inviterait à les modifier.
 */
export abstract class OrderTimeLimitRepository {
  /** Toutes les règles. L'ordre n'importe pas : la résolution pioche par portée. */
  abstract list(): Promise<readonly OrderTimeLimitView[]>;

  /** La règle posée sur cette portée, ou `null`. */
  abstract findByScope(scope: LimitScope): Promise<OrderTimeLimit | null>;

  /**
   * Écrit la règle — création ou remplacement, une seule par portée.
   *
   * Le `WriteTicket` n'est pas décoratif : il ne se frappe qu'en journalisant,
   * donc cette signature rend une écriture non tracée **inexprimable**. Une
   * consigne aurait demandé qu'on y pense ; le type l'exige.
   */
  abstract save(limit: OrderTimeLimit, ticket: WriteTicket): Promise<void>;

  /** Retire la règle. Supprimer EST le geste pour dire « ce rang ne se prononce pas ». */
  abstract remove(id: string, ticket: WriteTicket): Promise<void>;
}
