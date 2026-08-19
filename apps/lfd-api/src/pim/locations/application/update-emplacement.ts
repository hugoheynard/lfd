import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import {
  EmplacementRepository,
  type EmplacementFields,
} from "../domain/ports/emplacement.repository.js";
import { syncTables } from "../domain/value-objects/table.js";
import { cleanName, requireEmplacement } from "./emplacement-support.js";

export interface UpdateEmplacementPatch {
  readonly name?: string | undefined;
  readonly clickCollect?: boolean | undefined;
  readonly surPlace?: boolean | undefined;
  readonly baseUrl?: string | undefined;
  readonly tableCount?: number | undefined;
}

export class UpdateEmplacementCommand {
  constructor(
    readonly id: string,
    readonly patch: UpdateEmplacementPatch,
  ) {}
}

/**
 * Applique un patch partiel puis re-synchronise la grille de tables : couper
 * « sur place » vide les tables ; un nouveau `tableCount` aligne la grille en
 * gardant l'état QR des tables conservées.
 */
@CommandHandler(UpdateEmplacementCommand)
export class UpdateEmplacementHandler implements ICommandHandler<UpdateEmplacementCommand, void> {
  constructor(private readonly emplacements: EmplacementRepository) {}

  async execute(command: UpdateEmplacementCommand): Promise<void> {
    const { id, patch } = command;
    const current = await requireEmplacement(this.emplacements, id);
    const surPlace = patch.surPlace ?? current.surPlace;
    const fields: EmplacementFields = {
      name: patch.name !== undefined ? cleanName(patch.name) : current.name,
      clickCollect: patch.clickCollect ?? current.clickCollect,
      surPlace,
      baseUrl: patch.baseUrl !== undefined ? patch.baseUrl.trim() : current.baseUrl,
    };
    await this.emplacements.updateFields(id, fields);

    if (!surPlace) {
      if (current.tables.length > 0) {
        await this.emplacements.replaceTables(id, []);
      }
    } else if (patch.tableCount !== undefined) {
      await this.emplacements.replaceTables(id, syncTables(current.tables, patch.tableCount));
    }
  }
}
