import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PimIdGenerator } from "../../infra/id/pim-id-generator.js";
import { Location } from "../domain/entities/location.js";
import { LocationRepository } from "../domain/ports/location.repository.js";
import { requireFreeName } from "./location-support.js";

export interface CreateLocationPayload {
  readonly name: string;
  readonly clickCollect: boolean;
  readonly surPlace: boolean;
  readonly baseUrl: string;
  readonly tableCount: number;
}

export class CreateLocationCommand {
  constructor(readonly payload: CreateLocationPayload) {}
}

@CommandHandler(CreateLocationCommand)
export class CreateLocationHandler implements ICommandHandler<CreateLocationCommand, string> {
  constructor(
    private readonly locations: LocationRepository,
    @Inject(PimIdGenerator) private readonly ids: PimIdGenerator,
  ) {}

  async execute(command: CreateLocationCommand): Promise<string> {
    const { payload } = command;
    const id = this.ids.next();
    // Le nom exigé, l'URL trimée, la grille alignée — ou vide sans salle : tout
    // ça est décidé PAR l'agrégat, pas recomposé ici. L'agrégat NETTOIE le nom,
    // donc on vérifie l'unicité sur le nom nettoyé, pas sur celui reçu.
    const location = Location.open({ id, ...payload });
    await requireFreeName(this.locations, location.name, null);
    await this.locations.add(location);
    return id;
  }
}
