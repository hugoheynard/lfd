import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import {
  ShelfCacheSignals,
  type ShelfCacheSignal,
} from "../../domain/ports/shelf-cache-signals.js";
import {
  ShopShelfSwitch,
  type ShelfCacheState,
  type ShelfSwitchAction,
} from "../../domain/ports/shop-shelf-switch.js";
import { switchPurgesPublicShelf } from "../../domain/public-shelf-rules.js";
import { ResilientPublicShelf } from "../resilient-public-shelf.js";
import {
  SwitchShelfCacheCommand,
  type PublicPurgeReport,
  type ShelfSwitchOutcome,
} from "./switch-shelf-cache.command.js";

/**
 * Actionne l'interrupteur, purge Workers Cache quand le geste le demande
 * (éteindre, éteindre le public, vider — {@link switchPurgesPublicShelf}), et
 * signale le geste. Le signal suit le geste RÉUSSI : un geste refusé (magasin
 * absent, réponse illisible) remonte à l'appelant et ne laisse pas croire,
 * dans les journaux, que le cache a changé d'état.
 *
 * La purge publique vient APRÈS la bascule : une réponse calculée entre les
 * deux relit le drapeau éteint et ne se garde pas (`publicShelfVerdict`).
 * Son échec ne fait pas échouer le geste — le drapeau a basculé — mais se
 * dit dans la réponse.
 *
 * Rend l'état relu par le magasin — une exception assumée à « une commande
 * rend `void` » : la route est machine, son appelant (un workflow) n'a pas de
 * lecture à relancer, et l'état ne se lit nulle part ailleurs.
 *
 * @sans-journal geste machine sur un cache, sans donnée métier ; sa trace est le signal `shelf_cache.switched`, `public_switched` ou `purged_manually`, et l'exécution du workflow.
 */
@CommandHandler(SwitchShelfCacheCommand)
export class SwitchShelfCacheHandler implements ICommandHandler<
  SwitchShelfCacheCommand,
  ShelfSwitchOutcome
> {
  constructor(
    private readonly shelfSwitch: ShopShelfSwitch,
    private readonly publicShelf: ResilientPublicShelf,
    private readonly signals: ShelfCacheSignals,
  ) {}

  async execute(command: SwitchShelfCacheCommand): Promise<ShelfSwitchOutcome> {
    const state = await this.shelfSwitch.apply(command.action);
    this.signals.emit(signalOf(command.action, state));
    return { ...state, publicPurge: await this.publicPurge(command.action) };
  }

  private async publicPurge(action: ShelfSwitchAction): Promise<PublicPurgeReport> {
    if (!switchPurgesPublicShelf(action)) {
      return "not_needed";
    }
    return (await this.publicShelf.purge()) ? "done" : "failed";
  }
}

function signalOf(action: ShelfSwitchAction, state: ShelfCacheState): ShelfCacheSignal {
  switch (action) {
    case "purge":
      return { name: "purged_manually", version: state.version };
    case "public-on":
    case "public-off":
      return { name: "public_switched", enabled: state.publicEnabled, version: state.version };
    case "on":
    case "off":
      return { name: "switched", enabled: state.enabled, version: state.version };
  }
}
