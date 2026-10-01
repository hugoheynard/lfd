import type { StopDecisionOutcome } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { AfterCommit } from "../../platform/database/after-commit.js";
import { BackgroundWork } from "../../platform/events/background-work.js";
import type { JournaledEvent } from "../../platform/journal/journal-fact.js";
import { BroughtBackOrdersAnnouncer } from "../channels/handover/index.js";
import type { DeliveryRound } from "../domain/entities/delivery-round.js";
import { StopDecision } from "../domain/entities/stop-decision.js";
import {
  citeStopOrder,
  DeliveryStopBroughtBackEvent,
  DeliveryStopDepositAuthorizedEvent,
  roundKeyOf,
} from "../domain/events/delivery-doorstep.events.js";
import { DeliveryRoundRepository } from "../domain/ports/delivery-round.repository.js";
import type { DriverStopRow } from "../domain/ports/driver-rounds.reader.js";
import { StopDecisionRepository } from "../domain/ports/stop-decision.repository.js";

const ANNOUNCED = "stop-settled-back-announced";

/** Le signalement qu'une règle figée tranche d'avance. */
export interface SettledReport {
  readonly roundId: string;
  readonly stop: DriverStopRow;
  readonly incidentId: string;
  readonly outcome: StopDecisionOutcome;
  readonly at: Date;
}

/**
 * **La décision réglée d'avance s'applique au signalement**
 * (`documentation/livraisons/plan-a-la-porte.md`, B3 bis, LB-Q6).
 *
 * DANS l'unité de travail du signalement, sous le verrou de la tournée
 * (`loadForDecision`, celui que prennent le commercial et le dépôt) :
 * - la décision naît PRISE, `source = setting`, sans auteur ;
 * - « Déposer » ouvre « Déposé avec preuve » sur la carte, même signature
 *   exigée (LB-Q5) — la tournée n'est pas écrite ;
 * - « Rapporter » CLÔT l'arrêt par la tournée, comme le commercial (LB-Q2),
 *   et annonce le retour au retrait APRÈS la validation.
 *
 * Aucune notification : la décision est prise, personne n'a à répondre.
 *
 * Rend le fait à publier, ou `null` quand il n'y a rien à trancher — une
 * décision existe déjà sur l'arrêt, l'arrêt est clos, la tournée rentrée —
 * et l'appelant retombe alors sur la décision manuelle (B3).
 */
@Injectable()
export class StopDecisionBySetting {
  constructor(
    private readonly rounds: DeliveryRoundRepository,
    private readonly decisions: StopDecisionRepository,
    private readonly announcer: BroughtBackOrdersAnnouncer,
    private readonly afterCommit: AfterCommit,
    private readonly work: BackgroundWork,
  ) {}

  async settle(report: SettledReport): Promise<JournaledEvent | null> {
    const round = await this.rounds.loadForDecision(report.roundId);
    const stopId = report.stop.stopId;
    if (round === null || round.hasClosed(stopId) || round.returnedAt !== null) {
      return null;
    }
    if ((await this.decisions.load(stopId)) !== null) {
      return null;
    }
    const reference = report.stop.departed?.reference ?? "";
    const label = reference === "" ? report.stop.orderId : reference;
    const decision = StopDecision.open({
      stopId,
      roundId: round.id,
      orderId: report.stop.orderId,
      serviceDay: round.serviceDay,
      incidentId: report.incidentId,
      at: report.at,
    });
    decision.settle(report.outcome, { label, closed: false, returned: false }, report.at);
    await this.decisions.save(decision, label);
    const order = citeStopOrder(report.stop.orderId, reference);
    if (report.outcome === "authorize_deposit") {
      return new DeliveryStopDepositAuthorizedEvent(roundKeyOf(round), order, "setting");
    }
    await this.bringBack(round, report);
    return new DeliveryStopBroughtBackEvent(roundKeyOf(round), order, "setting");
  }

  /** Clôt l'arrêt « rapporté », et le retrait l'apprendra après la validation. */
  private async bringBack(round: DeliveryRound, report: SettledReport): Promise<void> {
    round.closeStop(report.stop.stopId, report.at);
    await this.rounds.save(round);
    const orderId = report.stop.orderId;
    this.afterCommit.defer(
      () => this.work.track(this.announcer.ordersBroughtBack([orderId], report.at), ANNOUNCED),
      ANNOUNCED,
    );
  }
}
