import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { MarketZoneCount } from "@lfd/contracts";

import { Clock } from "../../../../platform/time/clock.js";
import { MarketConfigStore } from "../../domain/ports/market-config.store.js";
import { MarketDirectory } from "../../domain/ports/market-directory.js";
import { RefreshMarketCommand } from "./refresh-market.command.js";

/**
 * Espacement entre deux appels à l'annuaire : l'API publique limite le débit
 * (~7 req/s). Sans pause, un gros balayage (zones × NAF) se fait throttler sur les
 * derniers appels et laisse des zones à 0. ~200 ms garde une marge confortable.
 */
const THROTTLE_MS = 200;

/**
 * **Redemande** : pour chaque zone ciblée, interroge l'annuaire pour chaque code NAF
 * ciblé (appels en séquence, **espacés** pour rester sous la limite de l'API), somme
 * en `addressable`, et **fige** le comptage stocké (`fetchedAt` = maintenant).
 */
@CommandHandler(RefreshMarketCommand)
export class RefreshMarketHandler implements ICommandHandler<RefreshMarketCommand, void> {
  constructor(
    private readonly store: MarketConfigStore,
    private readonly directory: MarketDirectory,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<void> {
    const config = await this.store.load();
    const now = this.clock.now();
    let first = true;
    for (const zone of config.zones) {
      const perNaf: MarketZoneCount[] = [];
      let addressable = 0;
      for (const naf of config.nafCodes) {
        if (!first) {
          await sleep(THROTTLE_MS);
        }
        first = false;
        const count = await this.directory.countEstablishments(naf.code, zone.codePostal);
        perNaf.push({ code: naf.code, count });
        addressable += count;
      }
      await this.store.saveZoneCounts(zone.codePostal, perNaf, addressable, now);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
