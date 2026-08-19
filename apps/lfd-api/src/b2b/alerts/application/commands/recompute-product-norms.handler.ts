import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { ProductNormStore } from "../../domain/ports/product-norm.store.js";
import { RecomputeProductNormsCommand } from "./recompute-product-norms.command.js";

/**
 * Recalcule la norme catalogue et remplace la projection.
 *
 * **Jamais temps réel** : la norme d'un produit ne bouge pas d'une commande à
 * l'autre, et la recalculer à chaque passation coûterait une agrégation
 * cross-comptes par commande. Un cron aux heures creuses suffit — même patron
 * que le scoring des leads.
 */
@CommandHandler(RecomputeProductNormsCommand)
export class RecomputeProductNormsHandler implements ICommandHandler<
  RecomputeProductNormsCommand,
  number
> {
  constructor(
    private readonly norms: ProductNormStore,
    private readonly clock: Clock,
  ) {}

  async execute(command: RecomputeProductNormsCommand): Promise<number> {
    const now = this.clock.now();
    const computed = await this.norms.compute({ windowDays: command.windowDays, now });
    return this.norms.replaceAll(computed, now, command.windowDays);
  }
}
