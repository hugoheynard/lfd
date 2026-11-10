import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { MarketConfigStore } from "../../domain/ports/market-config.store.js";
import { RemoveMarketZoneCommand } from "./remove-market-zone.command.js";

@CommandHandler(RemoveMarketZoneCommand)
export class RemoveMarketZoneHandler implements ICommandHandler<RemoveMarketZoneCommand, void> {
  constructor(private readonly store: MarketConfigStore) {}

  async execute(command: RemoveMarketZoneCommand): Promise<void> {
    await this.store.removeZone(command.codePostal);
  }
}
