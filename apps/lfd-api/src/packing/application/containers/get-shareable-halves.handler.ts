import type { DeliveryBinFreeHalvesView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { BinDesk } from "../../channels/delivery/index.js";
import { PackingSettings } from "../../domain/entities/packing-settings.js";
import { PackingSettingsReader } from "../../domain/ports/packing-settings.reader.js";
import { GetShareableHalvesQuery } from "./get-shareable-halves.query.js";

/**
 * **Les moitiés libres partageables, depuis le colisage** (suite de K2b,
 * `colisage/colisage.md` §7) — une LECTURE, servie par la
 * livraison derrière `BinDesk` : la règle d'adjacence (arrêts consécutifs d'une
 * tournée non partie) reste la sienne. Partager ensuite, c'est créer un
 * contenant `{ nature: "bin", partnerBinId }`.
 *
 * Refusée quand Réglages › Colisage ferme le partage (par défaut, Hugo,
 * 2026-10-25) : la liste ne sert qu'à ce geste.
 *
 * @throws {HalfSharingDisabledError} le partage d'une moitié est fermé.
 * @throws {BinsNotDeclarableError} commande inconnue, annulée ou en retrait.
 */
@QueryHandler(GetShareableHalvesQuery)
export class GetShareableHalvesHandler implements IQueryHandler<
  GetShareableHalvesQuery,
  DeliveryBinFreeHalvesView
> {
  constructor(
    private readonly desk: BinDesk,
    private readonly settings: PackingSettingsReader,
  ) {}

  async execute(query: GetShareableHalvesQuery): Promise<DeliveryBinFreeHalvesView> {
    ((await this.settings.current()) ?? PackingSettings.defaults()).assertCanShareHalf();
    return this.desk.freeHalves(query.orderId);
  }
}
