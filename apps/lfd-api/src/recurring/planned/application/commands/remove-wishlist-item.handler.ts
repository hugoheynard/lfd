import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { WishlistWriter } from "../../domain/ports/wishlist.writer.js";
import { PlannerWall } from "../services/planner-wall.js";
import { RemoveWishlistItemCommand } from "./remove-wishlist-item.command.js";

/**
 * Retire un article de la liste d'envies. Les colonnes qui le portent le
 * gardent : la liste est une réserve, pas une source.
 *
 * @sans-journal une préférence de la personne, sans effet sur ce qui se
 * fabrique ou se facture — comme un favori de la boutique.
 */
@CommandHandler(RemoveWishlistItemCommand)
export class RemoveWishlistItemHandler implements ICommandHandler<RemoveWishlistItemCommand, void> {
  constructor(
    private readonly wall: PlannerWall,
    private readonly writer: WishlistWriter,
  ) {}

  async execute(command: RemoveWishlistItemCommand): Promise<void> {
    const companyId = await this.wall.companyOf(command.actorUserId, command.companyId);
    await this.writer.remove(command.actorUserId, companyId, command.sku);
  }
}
