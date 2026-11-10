import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { MarketConfigStore } from "../../domain/ports/market-config.store.js";
import { AddMarketZoneCommand } from "./add-market-zone.command.js";

@CommandHandler(AddMarketZoneCommand)
export class AddMarketZoneHandler implements ICommandHandler<AddMarketZoneCommand, void> {
  constructor(private readonly store: MarketConfigStore) {}

  async execute(command: AddMarketZoneCommand): Promise<void> {
    await this.store.addZone(command.codePostal);
  }
}
