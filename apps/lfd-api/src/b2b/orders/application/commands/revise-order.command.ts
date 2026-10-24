import type { RevisionActor } from "../../domain/entities/order-revision.js";
import type { OrderContent } from "../services/order-content.js";

/**
 * **Modifier une commande passée** (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, M1) — par le
 * client, sous son mur et jusqu'à l'heure limite, ou par l'équipe, jusqu'à
 * l'inscription au fournil (R1).
 *
 * `actor` vient de la porte (le `Principal`, ou `@StaffUserId()`), jamais du
 * corps. `content` est la commande VOULUE, entière ; `expectedRevision` la
 * révision qu'elle corrige (R7).
 */
export class ReviseOrderCommand {
  constructor(
    readonly orderId: string,
    readonly actor: RevisionActor,
    readonly expectedRevision: number,
    readonly content: OrderContent,
  ) {}
}

/** Ce que la modification rend : la commande se relit ensuite. */
export interface ReviseOrderResult {
  readonly id: string;
  readonly revision: number;
  readonly totalCents: number;
  readonly previousTotalCents: number;
}
