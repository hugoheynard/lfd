import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CategoryRepository } from "../domain/ports/category.repository.js";
import {
  normalizeSalesChannels,
  type SalesChannels,
} from "../../shared/domain/value-objects/sales-channels.js";
import { requireCategory } from "./category-support.js";

export class SetCategoryChannelsCommand {
  constructor(
    readonly id: string,
    readonly channels: SalesChannels,
  ) {}
}

@CommandHandler(SetCategoryChannelsCommand)
export class SetCategoryChannelsHandler implements ICommandHandler<
  SetCategoryChannelsCommand,
  void
> {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(command: SetCategoryChannelsCommand): Promise<void> {
    await requireCategory(this.categories, command.id);
    await this.categories.setChannels(command.id, normalizeSalesChannels(command.channels));
  }
}
