import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { MarketingPreferenceRepository } from "../../domain/ports/marketing-preference.repository.js";
import { MarketingAddresses } from "../services/marketing-addresses.js";
import { EraseMarketingPreferencesCommand } from "./erase-marketing-preferences.command.js";

/**
 * Efface l'adresse de chaque ligne du registre, tous espaces, dans une seule
 * transaction : l'agrégat décide de ce qui part et de ce qui reste.
 */
@CommandHandler(EraseMarketingPreferencesCommand)
export class EraseMarketingPreferencesHandler implements ICommandHandler<
  EraseMarketingPreferencesCommand,
  void
> {
  constructor(
    private readonly preferences: MarketingPreferenceRepository,
    private readonly addresses: MarketingAddresses,
    private readonly uow: UnitOfWork,
  ) {}

  async execute({ address }: EraseMarketingPreferencesCommand): Promise<void> {
    const print = this.addresses.of(address).print;
    await this.uow.run(async () => {
      for (const preference of await this.preferences.loadAll(print)) {
        if (preference.erase() === "forget") {
          await this.preferences.forget(preference);
        } else {
          await this.preferences.save(preference);
        }
      }
    });
  }
}
