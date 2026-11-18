import type { OrderTimeLimitView } from "@lfd/pim-contracts";

import type { WriteTicket } from "../../../../platform/journal/scoped-journal.js";

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
  /**
   * Toutes les règles, archivées comprises — l'écran les montre à part, avec
   * « Restaurer ». L'ordre n'importe pas.
   */
  abstract list(): Promise<readonly OrderTimeLimitView[]>;

  /**
   * Les règles **en vigueur** — non archivées, filtrées dans la requête. C'est
   * ce qu'applique quiconque applique une limite : le fil vers le commerce.
   */
  abstract inForce(): Promise<readonly OrderTimeLimitView[]>;

  /** La règle par son identifiant, archivée ou non, ou `null`. */
  abstract findById(id: string): Promise<OrderTimeLimit | null>;

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
  /**
   * N'écrit QUE `archived_at` — pour l'archive et la restauration. Le geste
   * charge l'agrégat sous verrou, mais un renommage concurrent peut l'avoir
   * précédé : réécrire toute la ligne effacerait ce renommage.
   */
  abstract saveArchival(limit: OrderTimeLimit, ticket: WriteTicket): Promise<void>;
}
