import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PimIdGenerator } from "../../infra/id/pim-id-generator.js";
import { EmplacementRepository } from "../domain/ports/emplacement.repository.js";
import { syncTables } from "../domain/value-objects/table.js";
import { cleanName } from "./emplacement-support.js";

export interface CreateEmplacementPayload {
  readonly name: string;
  readonly clickCollect: boolean;
  readonly surPlace: boolean;
  readonly baseUrl: string;
  readonly tableCount: number;
}

export class CreateEmplacementCommand {
  constructor(readonly payload: CreateEmplacementPayload) {}
}

@CommandHandler(CreateEmplacementCommand)
export class CreateEmplacementHandler implements ICommandHandler<CreateEmplacementCommand, string> {
  constructor(
    private readonly emplacements: EmplacementRepository,
    @Inject(PimIdGenerator) private readonly ids: PimIdGenerator,
  ) {}

  async execute(command: CreateEmplacementCommand): Promise<string> {
    const { payload } = command;
    const id = this.ids.next();
    await this.emplacements.insert({
      id,
      name: cleanName(payload.name),
      clickCollect: payload.clickCollect,
      surPlace: payload.surPlace,
      baseUrl: payload.baseUrl.trim(),
      tables: payload.surPlace ? syncTables([], payload.tableCount) : [],
    });
    return id;
  }
}
