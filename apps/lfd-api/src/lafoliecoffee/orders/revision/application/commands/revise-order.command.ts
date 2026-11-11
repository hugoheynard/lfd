import type { RevisionActor } from "../../domain/entities/order-revision.js";
import type { RevisionOrigin } from "../../domain/events/order-revised.event.js";
import type { OrderContent } from "../../../application/services/order-content.js";

/**
 * **Modifier une commande passée** (voir
 * `documentation/commandes/modification/modifier-une-commande.md`, § 2.2 « Le chemin d'une modification ») — par le
 * client, sous son mur et jusqu'à l'heure limite, ou par l'équipe, jusqu'à
 * l'inscription au fournil (R1).
 *
 * `actor` vient de la porte (le `Principal`, ou `@StaffUserId()`), jamais du
 * corps. `content` est la commande VOULUE, entière ; `expectedRevision` la
 * révision qu'elle corrige (R7) ; `expectedTotalCents` le TTC que l'auteur a
 * vu au devis (doc `documentation/commandes/modification/modifier-une-commande.md`,
 * §2.3 (R14)) — pour une demande appliquée, celui de l'équipe, jamais recalculé.
 * `origin` dit si la révision applique une demande du client (`change_request`,
 * M4) : le fait `order.revised` le recopie, et l'e-mail « commande modifiée »
 * ne part pas — `contact` a déjà écrit le sien.
 */
export class ReviseOrderCommand {
  constructor(
    readonly orderId: string,
    readonly actor: RevisionActor,
    readonly expectedRevision: number,
    readonly content: OrderContent,
    readonly expectedTotalCents: number,
    readonly origin: RevisionOrigin,
  ) {}
}

/** Ce que la modification rend : la commande se relit ensuite. */
export interface ReviseOrderResult {
  readonly id: string;
  readonly revision: number;
  readonly totalCents: number;
  readonly previousTotalCents: number;
  readonly pretaxCents: number;
  readonly previousPretaxCents: number;
  /** La commande se règle au compte après la révision. */
  readonly onAccount: boolean;
  /** La commande est passée pour une société. */
  readonly forCompany: boolean;
}
