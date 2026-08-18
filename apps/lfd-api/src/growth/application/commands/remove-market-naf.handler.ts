import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { MarketConfigStore } from "../../domain/ports/market-config.store.js";
import { RemoveMarketNafCommand } from "./remove-market-naf.command.js";

@CommandHandler(RemoveMarketNafCommand)
export class RemoveMarketNafHandler implements ICommandHandler<RemoveMarketNafCommand, void> {
  constructor(private readonly store: MarketConfigStore) {}

  async execute(command: RemoveMarketNafCommand): Promise<void> {
    await this.store.removeNaf(command.code);
  }
}
