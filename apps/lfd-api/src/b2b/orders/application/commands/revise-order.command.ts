import type { RevisionActor } from "../../domain/entities/order-revision.js";
import type { OrderContent } from "../services/order-content.js";

/**
 * **Modifier une commande passée** (voir
 * `documentation/commandes/modification/modifier-une-commande.md`, § 2.2 « Le chemin d'une modification ») — par le
 * client, sous son mur et jusqu'à l'heure limite, ou par l'équipe, jusqu'à
 * l'inscription au fournil (R1).
 *
 * `actor` vient de la porte (le `Principal`, ou `@StaffUserId()`), jamais du
 * corps. `content` est la commande VOULUE, entière ; `expectedRevision` la
 * révision qu'elle corrige (R7) ; `expectedTotalCents` le TTC que l'auteur a
 * vu au devis (plan `documentation/commandes/modification/plan-s2-la-hausse.md`,
 * R14) — pour une demande appliquée, celui de l'équipe, jamais recalculé.
 */
export class ReviseOrderCommand {
  constructor(
    readonly orderId: string,
    readonly actor: RevisionActor,
    readonly expectedRevision: number,
    readonly content: OrderContent,
    readonly expectedTotalCents: number,
  ) {}
}

/** Ce que la modification rend : la commande se relit ensuite. */
export interface ReviseOrderResult {
  readonly id: string;
  readonly revision: number;
  readonly totalCents: number;
  readonly previousTotalCents: number;
}
