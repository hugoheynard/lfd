import { Injectable } from "@nestjs/common";

import { AfterCommit } from "../../platform/database/after-commit.js";
import { BackgroundWork } from "../../platform/events/background-work.js";
import { Clock } from "../../platform/time/clock.js";
import { InternalTransferRepository } from "../domain/ports/internal-transfer.repository.js";
import { InternalTransfersReader } from "../domain/ports/internal-transfers.reader.js";
import { AsapTransferUnplacedBell } from "./asap-transfer-unplaced-bell.js";
import { TransferPlacer } from "./transfer-placer.js";

const LABEL = "delivery.place-asap-transfer";

/** Le réassort lancé dont on place le transfert. */
export interface LaunchedTransferResupply {
  readonly serviceDay: string;
  readonly resupplyId: string;
  readonly name: string | null;
}

/**
 * **Placer le transfert d'un réassort « au plus tôt », et sonner s'il reste
 * sans tournée** (R4c, `reassort-boutiques/plan-au-plus-tot.md` §2 ④).
 *
 * Le placement est celui du soir, tel quel (`TransferPlacer.placeDay` — ce
 * que `placeDaySoon` diffère) : tournée intégrée, sinon dédiée sur un
 * véhicule libre. La seule chose ajoutée est la question posée APRÈS : le
 * transfert qui porte ce réassort a-t-il un arrêt ? Sinon, la cloche du
 * répartiteur sonne. Différé après la validation de l'abonné et suivi par
 * `BackgroundWork`, comme `placeDaySoon` : le placement lit la route hors
 * transaction, et un échec est journalisé, jamais avalé.
 */
@Injectable()
export class AsapTransferDispatch {
  constructor(
    private readonly placer: TransferPlacer,
    private readonly transfers: InternalTransferRepository,
    private readonly unplaced: InternalTransfersReader,
    private readonly bell: AsapTransferUnplacedBell,
    private readonly clock: Clock,
    private readonly afterCommit: AfterCommit,
    private readonly work: BackgroundWork,
  ) {}

  /** Après la validation de l'appelant, en fond. */
  placeSoon(resupply: LaunchedTransferResupply): void {
    this.afterCommit.defer(() => this.work.track(this.place(resupply), LABEL), LABEL);
  }

  /** Tout de suite, hors transaction. */
  async place(resupply: LaunchedTransferResupply): Promise<void> {
    await this.placer.placeDay(resupply.serviceDay);
    const holderId = await this.transfers.holderOf({
      kind: "resupply",
      resupplyId: resupply.resupplyId,
    });
    if (holderId === null) {
      return;
    }
    const left = await this.unplaced.unplacedOn(resupply.serviceDay);
    if (!left.some((row) => row.id === holderId)) {
      return;
    }
    const holder = await this.transfers.load(holderId);
    await this.bell.ring({
      serviceDay: resupply.serviceDay,
      resupplyId: resupply.resupplyId,
      resupplyName: resupply.name,
      siteLabel: holder?.siteLabel ?? resupply.resupplyId,
      at: this.clock.now(),
    });
  }
}
