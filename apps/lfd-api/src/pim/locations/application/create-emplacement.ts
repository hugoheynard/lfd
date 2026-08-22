import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PimIdGenerator } from "../../infra/id/pim-id-generator.js";
import { Emplacement } from "../domain/entities/emplacement.js";
import { EmplacementRepository } from "../domain/ports/emplacement.repository.js";

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
    // Le nom exigé, l'URL trimée, la grille alignée — ou vide sans salle : tout
    // ça est décidé PAR l'agrégat, pas recomposé ici.
    await this.emplacements.add(Emplacement.open({ id, ...payload }));
    return id;
  }
}
