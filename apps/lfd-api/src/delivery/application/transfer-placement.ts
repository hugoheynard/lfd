import { Injectable } from "@nestjs/common";

import { AfterCommit } from "../../platform/database/after-commit.js";
import { UnitOfWork } from "../../platform/database/unit-of-work.js";
import { BackgroundWork } from "../../platform/events/background-work.js";
import { DomainEventPublisher } from "../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../platform/id/id-generator.js";
import { Clock } from "../../platform/time/clock.js";
import { type TransferSiteFacts, TransferSitesReader } from "../channels/commerce/index.js";
import { DeliveryRound } from "../domain/entities/delivery-round.js";
import type { InternalTransfer } from "../domain/entities/internal-transfer.js";
import { activeOnDay } from "../domain/entities/vehicle.js";
import { DeliveryRoundOpenedEvent } from "../domain/events/delivery-round.events.js";
import {
  InternalTransferPlacedEvent,
  InternalTransferUnplacedEvent,
} from "../domain/events/internal-transfer.events.js";
import { DeliveryRoundRepository } from "../domain/ports/delivery-round.repository.js";
import { DeliveryRoundsReader } from "../domain/ports/delivery-rounds.reader.js";
import { FleetReader } from "../domain/ports/fleet.reader.js";
import { InternalTransferRepository } from "../domain/ports/internal-transfer.repository.js";
import { InternalTransfersReader } from "../domain/ports/internal-transfers.reader.js";
import { VehicleRepository } from "../domain/ports/vehicle.repository.js";
import { loadTransfer } from "./internal-transfer-support.js";
import { type TransferPlace, TransferPlaceFinder, TransferPlacer } from "./transfer-placer.js";
import { loadVehicle } from "./vehicle-support.js";

const LABEL = "delivery.place-transfers";

/**
 * **Placer chaque transfert prévu d'un jour dans une tournée** (plan du
 * transfert interne, §5, lot T1, Q-T9, Q-T13) :
 *
 * - **intégré** (le défaut du site) : l'arrêt entre dans la tournée au dépôt
 *   où il ajoute le moins de route, à temps pour l'heure requise, sans
 *   retarder personne (`TransferRouting`) ;
 * - **repli automatique** : aucune tournée ne passait à temps — ou le mode du
 *   site est **dédié** — : une tournée s'ouvre sur un véhicule libre ce
 *   jour-là (sans aucune tournée), qui ne porte que cet arrêt ;
 * - **sans véhicule libre**, ou site sans point GPS : le transfert reste
 *   prévu, sans arrêt, et le journal le dit — la sortie est l'affectation à la
 *   main ou la réception manuelle (T2).
 *
 * Un transfert à la fois, chacun dans SA transaction : la lecture routière se
 * fait avant, hors verrou ; une tournée changée entre-temps (version) fait
 * replier sur la dédiée plutôt que d'insérer au jugé. Rejoué, il ne reprend
 * que ce qui reste sans arrêt.
 */
@Injectable()
export class TransferPlacement extends TransferPlacer {
  constructor(
    private readonly unplaced: InternalTransfersReader,
    private readonly transfers: InternalTransferRepository,
    private readonly sites: TransferSitesReader,
    private readonly routing: TransferPlaceFinder,
    private readonly rounds: DeliveryRoundRepository,
    private readonly roundsReader: DeliveryRoundsReader,
    private readonly fleet: FleetReader,
    private readonly vehicles: VehicleRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly afterCommit: AfterCommit,
    private readonly work: BackgroundWork,
  ) {
    super();
  }

  placeDaySoon(day: string): void {
    this.afterCommit.defer(
      () =>
        this.work.track(
          this.placeDay(day).then(() => undefined),
          LABEL,
        ),
      LABEL,
    );
  }

  async placeDay(day: string): Promise<number> {
    const pending = await this.unplaced.unplacedOn(day);
    if (pending.length === 0) {
      return 0;
    }
    const sites = await this.sites.sitesFor(day, [...new Set(pending.map((row) => row.siteId))]);
    let placed = 0;
    for (const row of pending) {
      const site = sites.get(row.siteId);
      const place =
        site === undefined || site.mode === "dedicated"
          ? null
          : await this.routing.placeFor(day, site);
      if (await this.place(row.id, site, place)) {
        placed += 1;
      }
    }
    return placed;
  }

  private place(
    transferId: string,
    site: TransferSiteFacts | undefined,
    place: TransferPlace | null,
  ): Promise<boolean> {
    return this.uow.run(async () => {
      const transfer = await loadTransfer(this.transfers, transferId);
      if (transfer.departedAt !== null) {
        return false;
      }
      if (site === undefined || site.gps === null) {
        await this.events.publishTraced(
          new InternalTransferUnplacedEvent(transfer, "site_not_located"),
        );
        return false;
      }
      if (place !== null && (await this.integrate(transfer, place))) {
        return true;
      }
      return this.dedicate(transfer);
    });
  }

  /** Dans la tournée retenue, si elle n'a pas changé depuis la lecture. */
  private async integrate(transfer: InternalTransfer, place: TransferPlace): Promise<boolean> {
    const round = await this.rounds.load(place.roundId);
    if (round === null || round.loadedVersion !== place.version || round.departedAt !== null) {
      return false;
    }
    round.assignTransfer(this.ids.next(), transfer, this.clock.now(), place.after);
    await this.rounds.save(round);
    await this.events.publishTraced(new InternalTransferPlacedEvent(transfer, round, false));
    return true;
  }

  /** Une tournée à lui seul, sur un véhicule sans tournée ce jour-là ; sinon, dit et laissé. */
  private async dedicate(transfer: InternalTransfer): Promise<boolean> {
    const day = transfer.serviceDay;
    const [fleet, rounds] = await Promise.all([this.fleet.list(), this.roundsReader.roundsOn(day)]);
    const busy = new Set(rounds.map((round) => round.vehicleId));
    const free = fleet.find(
      (vehicle) =>
        !busy.has(vehicle.id) &&
        activeOnDay(vehicle.retiredAt === null ? null : new Date(vehicle.retiredAt), day),
    );
    if (free === undefined) {
      await this.events.publishTraced(new InternalTransferUnplacedEvent(transfer, "no_vehicle"));
      return false;
    }
    const at = this.clock.now();
    const vehicle = await loadVehicle(this.vehicles, free.id);
    const round = DeliveryRound.open({
      id: this.ids.next(),
      serviceDay: day,
      vehicle,
      passage: await this.rounds.nextPassage(day, vehicle.id),
      at,
    });
    round.assignTransfer(this.ids.next(), transfer, at, 0);
    await this.rounds.save(round);
    await this.events.publishTraced(new DeliveryRoundOpenedEvent(round));
    await this.events.publishTraced(new InternalTransferPlacedEvent(transfer, round, true));
    return true;
  }
}
