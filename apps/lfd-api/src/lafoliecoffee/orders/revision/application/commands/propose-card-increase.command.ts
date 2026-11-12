import type { RevisionActor } from "../../domain/entities/order-revision.js";
import type { OrderContent } from "../../../application/services/order-content.js";

/**
 * **Demander une hausse d'une commande payée par carte** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.3) — la
 * modification attend dans un projet que son complément soit payé ; la
 * commande ne change pas avant.
 *
 * Mêmes champs que `ReviseOrderCommand` : la commande voulue, entière, la
 * révision qu'elle corrige (R7) et le TTC vu au devis (R14). `actor` vient de
 * la porte, jamais du corps ; seul le client a la route (R15) — l'équipe qui
 * passerait ici serait refusée par l'agrégat (`increase_by_staff`).
 */
export class ProposeCardIncreaseCommand {
  constructor(
    readonly orderId: string,
    readonly actor: RevisionActor,
    readonly expectedRevision: number,
    readonly content: OrderContent,
    readonly expectedTotalCents: number,
    /** La clé d'intention de l'écran : un double envoi ne prépare pas deux paiements. */
    readonly intentKey: string,
  ) {}
}
