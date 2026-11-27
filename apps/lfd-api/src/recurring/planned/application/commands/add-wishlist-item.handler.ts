import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { WishlistWriter } from "../../domain/ports/wishlist.writer.js";
import { PlannerWall } from "../services/planner-wall.js";
import { AddWishlistItemCommand } from "./add-wishlist-item.command.js";

/**
 * Ajoute un article à la liste d'envies (Q3 : une par personne et par
 * société). Le SKU n'est jugé qu'en forme : le planificateur dit à l'écran
 * ce que la passation en penserait (§ 4 bis).
 *
 * @sans-journal une préférence de la personne, sans effet sur ce qui se
 * fabrique ou se facture — comme un favori de la boutique.
 */
@CommandHandler(AddWishlistItemCommand)
export class AddWishlistItemHandler implements ICommandHandler<AddWishlistItemCommand, void> {
  constructor(
    private readonly wall: PlannerWall,
    private readonly writer: WishlistWriter,
    private readonly clock: Clock,
  ) {}

  async execute(command: AddWishlistItemCommand): Promise<void> {
    const companyId = await this.wall.companyOf(command.actorUserId, command.companyId);
    await this.writer.add(command.actorUserId, companyId, command.sku, this.clock.now());
  }
}
