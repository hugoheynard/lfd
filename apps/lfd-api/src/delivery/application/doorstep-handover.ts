import { Injectable, Logger } from "@nestjs/common";

import { AfterCommit } from "../../platform/database/after-commit.js";
import { Clock } from "../../platform/time/clock.js";
import {
  DoorstepHandoverAttestor,
  type DoorstepProofImages,
  type StagedHandoverProofs,
} from "../channels/handover/index.js";
import type { DeliveryRound } from "../domain/entities/delivery-round.js";
import type { DoorstepStop } from "../domain/entities/doorstep-stop.js";
import {
  DoorstepStopNotFoundError,
  StopClosedWithoutHandoverError,
} from "../domain/errors/delivery-doorstep-errors.js";
import { DriverRoundNotFoundError } from "../domain/errors/delivery-driver-errors.js";
import type { CitedOrder } from "../domain/events/delivery-round.events.js";
import { citeStopOrder } from "../domain/events/delivery-doorstep.events.js";
import { DeliveryRoundRepository } from "../domain/ports/delivery-round.repository.js";
import { DoorstepStopRepository } from "../domain/ports/doorstep-stop.repository.js";
import { ensureFreshForDriver } from "./doorstep-support.js";

const logger = new Logger("DoorstepHandover");
const PUBLISH = "doorstep-handover-published";

/**
 * Ce qui distingue « Remis au client » (B1) de « Déposé avec preuve » (B2) —
 * tout le reste du geste est commun, et vit dans {@link DoorstepHandover}.
 */
export interface DoorstepHandoverGesture {
  readonly staffUserId: string;
  readonly roundId: string;
  readonly stopId: string;
  /** La version de la tournée lue par l'écran. */
  readonly version: number;
  /** Qui a réceptionné ; `null` : personne — le dépôt (`deposit` au retrait). */
  readonly receiverName: string | null;
  /** Ce que CET arrêt exige du geste — sous le verrou, avant l'attestation. */
  readonly admit: (stop: DoorstepStop) => void;
}

/** L'arrêt que CE geste vient de clore — de quoi écrire son fait au journal. */
export interface ClosedAtDoor {
  readonly round: DeliveryRound;
  readonly order: CitedOrder;
}

/** La tournée verrouillée et l'arrêt, tous deux lus sous le mur du livreur. */
interface WalledStop {
  readonly round: DeliveryRound;
  readonly stop: DoorstepStop;
}

/**
 * **Remettre à la porte — le geste commun** (`plan-a-la-porte.md`, B1, B2,
 * § 10 bis, AP-D1, AP-D6, AP-Q5, L6-C7). Un dépôt a les effets d'une remise
 * (AP-Q5) : la même attestation au retrait, la même clôture, la même
 * publication différée. Seuls diffèrent les pièces, la règle de l'arrêt et le
 * fait — d'où un service partagé par deux handlers plutôt qu'une copie.
 *
 * Le handler garde l'unité de travail et le fait au journal (`publishTraced`) :
 * c'est lui l'acte nommé, et `lint:journal-tracked` le lit dans son corps.
 *
 * 1. `perform` range les images, déjà refusées si fausses par le domaine, au
 *    stockage, HORS transaction ; il les retire si le geste n'a pas été écrit.
 * 2. `closeAtDoor`, DANS l'unité de travail du handler : la tournée
 *    verrouillée et l'arrêt, SOUS LE MUR du livreur ; un arrêt déjà clos par
 *    une remise à la porte republie l'attestation existante et rend `null`
 *    (« déjà fait ») — clos autrement, refus nommé ; puis la version
 *    présentée, la règle du geste (`admit`), l'attestation (sans publier),
 *    `closeStop` par l'agrégat.
 * 3. 🔴 La publication vers le commerce part APRÈS la validation
 *    (`AfterCommit`, B0) : une clôture qui échoue ne laisse ni commande
 *    `fulfilled`, ni point.
 */
@Injectable()
export class DoorstepHandover {
  constructor(
    private readonly rounds: DeliveryRoundRepository,
    private readonly stops: DoorstepStopRepository,
    private readonly attestor: DoorstepHandoverAttestor,
    private readonly clock: Clock,
    private readonly afterCommit: AfterCommit,
  ) {}

  /**
   * Range les images, puis `write` — qui rend `true` si le geste a été écrit.
   * Sinon (refus, échec, « déjà fait »), les images sont retirées.
   */
  async perform(
    images: DoorstepProofImages,
    write: (staged: StagedHandoverProofs) => Promise<boolean>,
  ): Promise<void> {
    const staged = await this.attestor.stageProofs(images);
    let written = false;
    try {
      written = await write(staged);
    } finally {
      if (!written) {
        await this.discard(staged);
      }
    }
  }

  /**
   * Clôt l'arrêt par ce geste ; `null` : il l'était déjà par une remise à la
   * porte — l'attestation existante est republiée.
   *
   * @throws {DriverRoundNotFoundError} @throws {DoorstepStopNotFoundError}
   * @throws {StopClosedWithoutHandoverError} @throws {DoorstepRoundStaleError}
   * @throws ceux de `admit`, du retrait, et de `closeStop`.
   */
  async closeAtDoor(
    gesture: DoorstepHandoverGesture,
    staged: StagedHandoverProofs,
  ): Promise<ClosedAtDoor | null> {
    const { round, stop } = await this.walled(gesture);
    if (round.hasClosed(stop.stopId)) {
      await this.replay(stop);
      return null;
    }
    // Rentrée, la tournée ne prend plus de geste (PL2) — dit avant la version.
    round.ensureOnTheRoad();
    ensureFreshForDriver(round, gesture.version);
    gesture.admit(stop);
    const publish = await this.attestor.attest({
      orderId: stop.orderId,
      by: gesture.staffUserId,
      receiverName: gesture.receiverName,
      proofs: staged,
    });
    round.closeStop(stop.stopId, this.clock.now());
    await this.rounds.save(round);
    this.afterCommit.defer(publish, PUBLISH);
    return { round, order: citeStopOrder(stop.orderId, stop.reference) };
  }
  private async walled(gesture: DoorstepHandoverGesture): Promise<WalledStop> {
    const round = await this.rounds.loadForDriver(gesture.roundId, gesture.staffUserId);
    if (round === null) {
      throw new DriverRoundNotFoundError();
    }
    const stop = await this.stops.loadForDriver(
      gesture.roundId,
      gesture.stopId,
      gesture.staffUserId,
    );
    if (stop === null) {
      throw new DoorstepStopNotFoundError();
    }
    return { round, stop };
  }

  /**
   * Rejoué sur un arrêt clos (§ 10 bis) : remis ou déposé à la porte,
   * l'attestation existante repart vers le commerce — c'est ce qui répare un
   * `fulfilled` manqué ; clos sans remise, le livreur l'apprend.
   */
  private async replay(stop: DoorstepStop): Promise<void> {
    const publish = await this.attestor.republication(stop.orderId);
    if (publish === null) {
      throw new StopClosedWithoutHandoverError(stop.label);
    }
    this.afterCommit.defer(publish, PUBLISH);
  }

  private async discard(staged: StagedHandoverProofs): Promise<void> {
    await this.attestor.discardProofs(staged).catch((cause: unknown) => {
      logger.warn(`Pièces d'un geste non fait, orphelines au stockage : ${String(cause)}`);
    });
  }
}
