import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { StorefrontRepository } from "../domain/storefront.repository.js";
import { RefocusStorefrontImageCommand } from "./refocus-storefront-image.command.js";

/**
 * Charger, recadrer par l'agrégat, enregistrer — sous le même verrou de
 * révision qu'un enregistrement de l'éditeur, comme le remplacement d'une
 * image (`RepointStorefrontImage`).
 *
 * Rend le nombre de porteurs recadrés. À zéro, rien n'est écrit : la révision
 * ne monte pas, et un éditeur ouvert n'est pas refusé pour rien.
 *
 * ⚠️ Pas de `storefront.saved` : la décision est `media_asset.described`,
 * tracée par la médiathèque ; la vitrine n'a pas été composée par quelqu'un.
 *
 * @sans-journal conséquence d'un geste déjà journalisé à la médiathèque (`media_asset.described`).
 */
@CommandHandler(RefocusStorefrontImageCommand)
export class RefocusStorefrontImageHandler implements ICommandHandler<
  RefocusStorefrontImageCommand,
  number
> {
  constructor(
    private readonly storefronts: StorefrontRepository,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  /** @throws {InvalidStorefrontError} point focal hors de l'image. */
  execute(command: RefocusStorefrontImageCommand): Promise<number> {
    return this.uow.run(async () => {
      const storefront = await this.storefronts.load();
      const carriers = storefront.refocus(command.url, command.focal, this.clock.now());
      if (carriers > 0) {
        await this.storefronts.save(storefront);
      }
      return carriers;
    });
  }
}
