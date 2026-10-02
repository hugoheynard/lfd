import { STOP_DECISION_PERMISSION } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { AfterCommit } from "../../platform/database/after-commit.js";
import { BackgroundWork } from "../../platform/events/background-work.js";
import type { JournaledEvent } from "../../platform/journal/journal-fact.js";
import {
  type StaffNotice,
  StaffNotifier,
} from "../../staff/notifications/domain/ports/staff-notifier.js";
import type { DeliveryIncident } from "../domain/entities/delivery-incident.js";
import { StopDecision } from "../domain/entities/stop-decision.js";
import { opensDecision } from "../domain/services/decision-opening.js";
import { settledOutcomeOf } from "../domain/services/doorstep-rule.js";
import { StopDecisionRepository } from "../domain/ports/stop-decision.repository.js";
import type { DriverRoundRow } from "../domain/ports/driver-rounds.reader.js";
import { StopDecisionBySetting } from "./stop-decision-by-setting.js";

/** Ce que la notice dit du motif — des mots pour le commercial, pas les valeurs. */
const REASON_WORDS: Readonly<Record<string, string>> = {
  nobody_present: "personne pour réceptionner",
  refused: "refusée par le client",
  access_impossible: "accès impossible",
};

const NOTIFIED = "stop-decision-notified";

/** La liste où l'on décide. */
const DECISIONS_LINK = "/livraison/a-decider";

/**
 * **Un signalement ouvre une décision, et prévient qui peut décider**
 * (`plan-a-la-porte.md`, § 9, § 10 B3, B5, LB-Q3).
 *
 * DANS l'unité de travail du signalement : si son motif en ouvre une
 * (`opensDecision`) et qu'aucune n'existe sur l'arrêt, la décision s'ouvre —
 * insérée sans échouer si un signalement simultané l'a ouverte d'abord.
 *
 * APRÈS la validation (`AfterCommit`) : une notification ADRESSÉE PAR DROIT
 * (`STOP_DECISION_PERMISSION`, `delivery_decisions:write`) — visible et poussée à qui peut répondre.
 * Une par signalement (clé d'idempotence : son id), et seulement tant que
 * la décision attend : une autorisation déjà donnée ne se redemande pas.
 * Un signalement annulé ne prévient personne. L'émission est SUIVIE
 * (`BackgroundWork.track`) : son échec est journalisé, jamais avalé, et les
 * tests l'attendent.
 *
 * Sauf quand la règle FIGÉE au départ répond d'avance (B3 bis, LB-Q6) :
 * « Déposer » ou « Rapporter » s'applique aussitôt (`StopDecisionBySetting`),
 * et personne n'est prévenu — il n'y a rien à décider. « Me demander », ou
 * une règle qui n'a rien à trancher, retombe sur ce qui précède.
 *
 * Rend le fait de la décision réglée, à publier par le handler après celui
 * du signalement ; `null` sinon.
 */
@Injectable()
export class StopDecisionOpening {
  constructor(
    private readonly decisions: StopDecisionRepository,
    private readonly notifier: StaffNotifier,
    private readonly afterCommit: AfterCommit,
    private readonly work: BackgroundWork,
    private readonly setting: StopDecisionBySetting,
  ) {}

  async openFor(
    incident: DeliveryIncident,
    round: DriverRoundRow,
    at: Date,
  ): Promise<JournaledEvent | null> {
    const stop = round.stops.find((row) => row.stopId === incident.stopId);
    if (stop === undefined || !opensDecision(incident.family, incident.reason)) {
      return null;
    }
    const outcome = settledOutcomeOf(stop.departed?.doorstepRule ?? "ask");
    const settled =
      outcome === null
        ? null
        : await this.setting.settle({
            roundId: round.id,
            stop,
            incidentId: incident.id,
            outcome,
            at,
          });
    if (settled !== null) {
      return settled;
    }
    const existing = await this.decisions.load(stop.stopId);
    if (existing !== null && existing.state !== "pending") {
      return null;
    }
    if (existing === null) {
      const opened = StopDecision.open({
        stopId: stop.stopId,
        roundId: round.id,
        orderId: stop.orderId,
        serviceDay: round.serviceDay,
        incidentId: incident.id,
        at,
      });
      await this.decisions.save(opened, stop.departed?.reference ?? stop.orderId);
    }
    const notice = noticeOf(incident, round, stop.departed?.reference ?? stop.orderId, at);
    this.afterCommit.defer(
      () => this.work.track(this.notifier.notify([notice]), NOTIFIED),
      NOTIFIED,
    );
    return null;
  }
}

function noticeOf(
  incident: DeliveryIncident,
  round: DriverRoundRow,
  reference: string,
  at: Date,
): StaffNotice {
  const words = REASON_WORDS[incident.reason] ?? incident.reason;
  return {
    kind: "delivery.stop_decision",
    subject: `Livraison à décider — commande ${reference}`,
    body: `${round.vehicleName}, passage ${String(round.passage)} : ${words}. Autoriser le dépôt cette fois, ou rapporter ?`,
    link: DECISIONS_LINK,
    idempotencyKey: `delivery.stop_decision:${incident.id}`,
    occurredAt: at,
    audience: STOP_DECISION_PERMISSION,
  };
}
