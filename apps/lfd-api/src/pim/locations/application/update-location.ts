import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { LocationRepository } from "../domain/ports/location.repository.js";
import { requireLocation, requireFreeName } from "./location-support.js";

export interface UpdateLocationPatch {
  readonly name?: string | undefined;
  readonly clickCollect?: boolean | undefined;
  readonly surPlace?: boolean | undefined;
  readonly baseUrl?: string | undefined;
  readonly tableCount?: number | undefined;
}

export class UpdateLocationCommand {
  constructor(
    readonly id: string,
    readonly patch: UpdateLocationPatch,
  ) {}
}

/**
 * Applique un patch partiel sur l'agrégat, puis l'enregistre **en une fois**.
 *
 * Le handler ne décide plus rien : « couper sur place vide les tables » est un
 * invariant de l'agrégat, et non plus un `if` d'ici. C'était le trou — le
 * handler écrivait les champs, puis les tables, en deux fois : un échec entre
 * les deux laissait un emplacement fermé en salle avec ses tables, donc des QR
 * imprimés qui menaient quelque part.
 */
@CommandHandler(UpdateLocationCommand)
export class UpdateLocationHandler implements ICommandHandler<UpdateLocationCommand, void> {
  constructor(private readonly locations: LocationRepository) {}

  async execute(command: UpdateLocationCommand): Promise<void> {
    const { id, patch } = command;
    const location = await requireLocation(this.locations, id);

    if (patch.name !== undefined) {
      location.rename(patch.name);
      await requireFreeName(this.locations, location.name, location.id);
    }
    if (patch.clickCollect !== undefined) {
      location.setClickCollect(patch.clickCollect);
    }
    if (patch.baseUrl !== undefined) {
      location.setBaseUrl(patch.baseUrl);
    }
    // La salle AVANT la grille : fermer vide les tables, et un `tableCount`
    // reçu dans le même patch ne doit pas les faire revenir.
    if (patch.surPlace !== undefined) {
      location.setSurPlace(patch.surPlace);
    }
    if (patch.tableCount !== undefined) {
      location.setTableCount(patch.tableCount);
    }

    await this.locations.save(location);
  }
}
