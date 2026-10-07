import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { HandoverProofPurgeIncompleteError } from "../../domain/errors/handover-proof-errors.js";
import { HandoverProofEraser } from "../../domain/ports/handover-proof.eraser.js";
import { HandoverProofRetention } from "../../domain/value-objects/handover-proof-retention.js";
import { HandoverProofErasure } from "../services/handover-proof-erasure.js";
import { PurgeHandoverProofsOlderThanCommand } from "./purge-handover-proofs-older-than.command.js";

/**
 * **La purge des pièces de remise** (`documentation/livraisons/livreur/a-la-porte.md`,
 * « Les pièces de remise : conservées sans limite, purgeables »). Câblée, non
 * planifiée : aucune minuterie ne l'appelle, et la durée reste à décider.
 *
 * Chaque pièce est effacée pour elle-même (`HandoverProofErasure`) : une image
 * que le stockage refuse ne retient pas les autres. Ce qui n'a pas pu partir
 * est GARDÉ entier, et la purge le dit en échouant à la fin — jamais en
 * silence. La relancer reprend exactement ce qui reste.
 *
 * @throws {HandoverProofRetentionInvalidError} moins d'un jour.
 * @throws {HandoverProofPurgeIncompleteError} au moins une pièce gardée.
 */
@CommandHandler(PurgeHandoverProofsOlderThanCommand)
export class PurgeHandoverProofsOlderThanHandler implements ICommandHandler<
  PurgeHandoverProofsOlderThanCommand,
  void
> {
  constructor(
    private readonly eraser: HandoverProofEraser,
    private readonly erasure: HandoverProofErasure,
    private readonly clock: Clock,
  ) {}

  async execute(command: PurgeHandoverProofsOlderThanCommand): Promise<void> {
    const retention = HandoverProofRetention.ofDays(command.retentionDays);
    const expired = await this.eraser.recordedBefore(retention.cutoffFrom(this.clock.now()));
    const failures: unknown[] = [];
    for (const proof of expired) {
      try {
        await this.erasure.erase(proof, "retention");
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      throw new HandoverProofPurgeIncompleteError(failures.length, failures[0]);
    }
  }
}
