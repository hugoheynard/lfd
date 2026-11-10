import type { RevisionActor } from "../../domain/entities/order-revision.js";

/**
 * **Abandonner le complément qui attend son paiement** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.4) — par le
 * client, sous le mur de sa commande, ou par l'équipe depuis la fiche. La
 * commande reste telle quelle ; l'intention est annulée chez le prestataire.
 */
export class AbandonCardIncreaseCommand {
  constructor(
    readonly orderId: string,
    readonly actor: RevisionActor,
  ) {}
}
