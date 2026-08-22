import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { EmplacementRepository } from "../domain/ports/emplacement.repository.js";
import { requireEmplacement, requireFreeName } from "./emplacement-support.js";

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
 * Applique un patch partiel sur l'agrégat, puis l'enregistre **en une fois**.
 *
 * Le handler ne décide plus rien : « couper sur place vide les tables » est un
 * invariant de l'agrégat, et non plus un `if` d'ici. C'était le trou — le
 * handler écrivait les champs, puis les tables, en deux fois : un échec entre
 * les deux laissait un emplacement fermé en salle avec ses tables, donc des QR
 * imprimés qui menaient quelque part.
 */
@CommandHandler(UpdateEmplacementCommand)
export class UpdateEmplacementHandler implements ICommandHandler<UpdateEmplacementCommand, void> {
  constructor(private readonly emplacements: EmplacementRepository) {}

  async execute(command: UpdateEmplacementCommand): Promise<void> {
    const { id, patch } = command;
    const emplacement = await requireEmplacement(this.emplacements, id);

    if (patch.name !== undefined) {
      emplacement.rename(patch.name);
      await requireFreeName(this.emplacements, emplacement.name, emplacement.id);
    }
    if (patch.clickCollect !== undefined) {
      emplacement.setClickCollect(patch.clickCollect);
    }
    if (patch.baseUrl !== undefined) {
      emplacement.setBaseUrl(patch.baseUrl);
    }
    // La salle AVANT la grille : fermer vide les tables, et un `tableCount`
    // reçu dans le même patch ne doit pas les faire revenir.
    if (patch.surPlace !== undefined) {
      emplacement.setSurPlace(patch.surPlace);
    }
    if (patch.tableCount !== undefined) {
      emplacement.setTableCount(patch.tableCount);
    }

    await this.emplacements.save(emplacement);
  }
}
