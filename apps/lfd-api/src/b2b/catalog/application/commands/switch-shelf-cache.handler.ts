import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { ShelfCacheSignals } from "../../domain/ports/shelf-cache-signals.js";
import { ShopShelfSwitch, type ShelfCacheState } from "../../domain/ports/shop-shelf-switch.js";
import { SwitchShelfCacheCommand } from "./switch-shelf-cache.command.js";

/**
 * Actionne l'interrupteur et signale le geste. Le signal suit le geste
 * RÉUSSI : un geste refusé (magasin absent, réponse illisible) remonte à
 * l'appelant et ne laisse pas croire, dans les journaux, que le cache a
 * changé d'état.
 *
 * Rend l'état relu par le magasin — une exception assumée à « une commande
 * rend `void` » : la route est machine, son appelant (un workflow) n'a pas de
 * lecture à relancer, et l'état ne se lit nulle part ailleurs.
 *
 * @sans-journal geste machine sur un cache, sans donnée métier ; sa trace est le signal `shelf_cache.switched` ou `purged_manually`, et l'exécution du workflow.
 */
@CommandHandler(SwitchShelfCacheCommand)
export class SwitchShelfCacheHandler implements ICommandHandler<
  SwitchShelfCacheCommand,
  ShelfCacheState
> {
  constructor(
    private readonly shelfSwitch: ShopShelfSwitch,
    private readonly signals: ShelfCacheSignals,
  ) {}

  async execute(command: SwitchShelfCacheCommand): Promise<ShelfCacheState> {
    const state = await this.shelfSwitch.apply(command.action);
    this.signals.emit(
      command.action === "purge"
        ? { name: "purged_manually", version: state.version }
        : { name: "switched", enabled: state.enabled, version: state.version },
    );
    return state;
  }
}
