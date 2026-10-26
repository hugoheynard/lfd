import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { HandoverProofRepository } from "../../domain/ports/handover-proof.repository.js";
import { HandoverProofErasure } from "../services/handover-proof-erasure.js";
import { EraseHandoverProofsCommand } from "./erase-handover-proofs.command.js";

/**
 * **L'effacement à la demande** (`documentation/livraisons/livreur/a-la-porte.md`,
 * « Les pièces de remise : conservées sans limite, purgeables »).
 *
 * Par commande, tous ses envois (plan E7 reliquat, L4b).
 *
 * Idempotent : une commande sans pièce — jamais remise à la porte, ou déjà
 * effacée — n'a rien à effacer, et ce n'est pas un refus. Rien n'est écrit au
 * journal dans ce cas : rien ne s'est passé.
 *
 * L'unité de travail et le fait vivent dans `HandoverProofErasure`, partagée
 * avec la purge : un seul ordre images → ligne + fait.
 *
 * @throws {DocumentStorageUnavailableError} une image n'a pas pu être retirée
 *   — la pièce est gardée entière, rejouer la reprend.
 */
@CommandHandler(EraseHandoverProofsCommand)
export class EraseHandoverProofsHandler implements ICommandHandler<
  EraseHandoverProofsCommand,
  void
> {
  constructor(
    private readonly proofs: HandoverProofRepository,
    private readonly erasure: HandoverProofErasure,
  ) {}

  async execute(command: EraseHandoverProofsCommand): Promise<void> {
    // Tous les envois de la commande (L4b) : la personne qui demande
    // l'effacement ne distingue pas le reliquat de la commande. Une pièce à la
    // fois, chacune avec son fait ; un échec arrête, et rejouer reprend.
    for (const proof of await this.proofs.findAllOfOrder(command.orderId)) {
      await this.erasure.erase(proof, "request");
    }
  }
}
