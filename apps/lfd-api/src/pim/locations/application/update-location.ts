import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import type { Location } from "../domain/entities/location.js";
import { changesBetween } from "../../journal/changes.js";
import { LocationRepository } from "../domain/ports/location.repository.js";
import { requireLocation } from "./location-support.js";

export interface UpdateLocationPatch {
  readonly name?: string | undefined;
  readonly clickCollect?: boolean | undefined;
  readonly eatIn?: boolean | undefined;
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
  constructor(
    private readonly locations: LocationRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UpdateLocationCommand): Promise<void> {
    const { id, patch } = command;
    const location = await requireLocation(this.locations, id);
    const before = traced(location);

    if (patch.name !== undefined) {
      location.rename(patch.name);
    }
    if (patch.clickCollect !== undefined) {
      location.setClickCollect(patch.clickCollect);
    }
    if (patch.baseUrl !== undefined) {
      location.setBaseUrl(patch.baseUrl);
    }
    // La salle AVANT la grille : fermer vide les tables, et un `tableCount`
    // reçu dans le même patch ne doit pas les faire revenir.
    if (patch.eatIn !== undefined) {
      location.setEatIn(patch.eatIn);
    }
    if (patch.tableCount !== undefined) {
      location.setTableCount(patch.tableCount);
    }

    const changes = changesBetween(before, traced(location));
    await this.uow.run(async () => {
      // L'écran renvoie la fiche entière à chaque enregistrement : sans ce
      // filtre, l'historique d'un emplacement serait surtout composé de gestes
      // qui n'ont rien changé.
      const ticket =
        Object.keys(changes).length > 0
          ? await this.journal.trace({
              type: PIM_EVENTS.locationUpdated,
              subjectType: "location",
              subjectId: id,
              payload: { changes },
            })
          : this.journal.untraced("emplacement enregistré sans modification");
      await this.locations.save(location, ticket);
    });
  }
}

/**
 * Ce que le journal retient d'un emplacement : ses réglages, et le NOMBRE de
 * tables plutôt que la grille.
 *
 * Les tables portent les jetons de QR — les verser dans une charge utile
 * mettrait des accès de commande à table dans un flux qu'on relit à l'écran.
 * Et un « avant → après » de vingt lignes de tables enterrerait le seul
 * changement qu'on cherchait.
 */
function traced(location: Location): Record<string, unknown> {
  const { name, clickCollect, eatIn, baseUrl, tables } = location.snapshot();
  return { name, clickCollect, eatIn, baseUrl, tableCount: tables.length };
}
