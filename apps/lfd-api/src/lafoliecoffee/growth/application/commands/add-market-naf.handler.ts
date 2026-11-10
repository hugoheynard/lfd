import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { MarketConfigStore } from "../../domain/ports/market-config.store.js";
import { AddMarketNafCommand } from "./add-market-naf.command.js";

@CommandHandler(AddMarketNafCommand)
export class AddMarketNafHandler implements ICommandHandler<AddMarketNafCommand, void> {
  constructor(private readonly store: MarketConfigStore) {}

  async execute(command: AddMarketNafCommand): Promise<void> {
    await this.store.addNaf(command.code, command.label);
  }
}
