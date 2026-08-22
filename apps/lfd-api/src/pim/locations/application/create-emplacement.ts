import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PimIdGenerator } from "../../infra/id/pim-id-generator.js";
import { Emplacement } from "../domain/entities/emplacement.js";
import { EmplacementRepository } from "../domain/ports/emplacement.repository.js";
import { requireFreeName } from "./emplacement-support.js";

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
    // ça est décidé PAR l'agrégat, pas recomposé ici. L'agrégat NETTOIE le nom,
    // donc on vérifie l'unicité sur le nom nettoyé, pas sur celui reçu.
    const emplacement = Emplacement.open({ id, ...payload });
    await requireFreeName(this.emplacements, emplacement.name, null);
    await this.emplacements.add(emplacement);
    return id;
  }
}
