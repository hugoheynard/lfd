import type { DoorstepRule } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { HeldAfterCommit } from "../../../../platform/database/__tests__/held-after-commit.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import type {
  DepartedStopRow,
  DriverRoundRow,
} from "../../../domain/ports/driver-rounds.reader.js";
import { StopDecisionBySetting } from "../../stop-decision-by-setting.js";
import { StopDecisionOpening } from "../../stop-decision-opening.js";
import { ReportDeliveryIncidentCommand } from "../report-delivery-incident.command.js";
import { ReportDeliveryIncidentHandler } from "../report-delivery-incident.handler.js";
import {
  InMemoryStopDecisions,
  openDecision,
  RecordingBroughtBack,
  RecordingStaffNotifier,
} from "./decision-doubles.js";
import { FixedDriverRounds, InMemoryDocuments, InMemoryIncidents } from "./doorstep-doubles.js";
import { DAY, DEPARTED, NOW, PAUL, roundState } from "./doorstep-handover-scene.js";
import { InMemoryDeliveryRounds } from "./round-doubles.js";

/**
 * **La décision réglée d'avance** (`a-la-porte.md`, B3 bis, LB-Q6) : la
 * règle FIGÉE au départ répond au signalement, dans sa transaction, sans
 * prévenir personne ; « Me demander » laisse la main au commercial (B3).
 */

function departed(rule: DoorstepRule): DepartedStopRow {
  return {
    reference: "CMD-1",
    customerLabel: "Maison Colin",
    address: null,
    contact: null,
    window: null,
    signatureRequired: true,
    note: "",
    addressNote: null,
    departureRank: 1,
    gps: null,
    depositAllowed: false,
    doorstepRule: rule,
    parking: null,
    arrivedAt: null,
  };
}

function driverRound(rule: DoorstepRule): DriverRoundRow {
  return {
    id: "r_1",
    serviceDay: DAY,
    vehicleName: "Kangoo",
    passage: 1,
    version: 2,
    departedAt: DEPARTED,
    returnedAt: null,
    stops: [
      {
        stopId: "s_1",
        orderId: "o_1",
        position: 1,
        closedAt: null,
        departed: departed(rule),
        bins: 1,
        coldBins: 0,
      },
    ],
  };
}

function reporting(rule: DoorstepRule, decisions = new InMemoryStopDecisions()) {
  const rounds = new InMemoryDeliveryRounds(roundState());
  const notifier = new RecordingStaffNotifier();
  const announcer = new RecordingBroughtBack();
  const afterCommit = new HeldAfterCommit();
  const events = new RecordingPublisher();
  const handler = new ReportDeliveryIncidentHandler(
    new FixedDriverRounds(PAUL, driverRound(rule)),
    new InMemoryIncidents(),
    new InMemoryDocuments(),
    new FixedStaffAuthorDirectory(
      new Map(authorsKnownAs({ staffUserId: PAUL, firstName: "Paul", lastName: "Roux" }, PAUL)),
    ),
    new FixedIdGenerator("inc"),
    new FixedClock(NOW),
    events,
    new DirectUnitOfWork(),
    new StopDecisionOpening(
      decisions,
      notifier,
      afterCommit,
      new BackgroundWork(),
      new StopDecisionBySetting(rounds, decisions, announcer, afterCommit, new BackgroundWork()),
    ),
  );
  return { handler, rounds, decisions, notifier, announcer, afterCommit, events };
}

const NOBODY = { family: "doorstep", reason: "nobody_present", note: "", stopId: "s_1" } as const;

describe("ReportDeliveryIncidentHandler — la décision réglée d'avance (B3 bis)", () => {
  it("🔴 « Rapporter » clôt l'arrêt aussitôt, tracé par le réglage, sans prévenir personne", async () => {
    const { handler, rounds, decisions, notifier, announcer, afterCommit, events } =
      reporting("bring_back");

    await handler.execute(new ReportDeliveryIncidentCommand(PAUL, "r_1", NOBODY, null));

    expect(decisions.stored("s_1")).toMatchObject({
      outcome: "bring_back",
      source: "setting",
      decidedAt: NOW,
      decidedBy: null,
      decidedByName: null,
      openedByIncidentId: "inc_000001",
    });
    expect(rounds.stored("r_1")?.hasClosed("s_1")).toBe(true);
    expect(events.factTypes()).toEqual([
      "delivery_round.incident_reported",
      "delivery_round.stop_brought_back",
    ]);
    expect(events.traced[1]?.journalFact().payload).toMatchObject({
      order: { id: "o_1", name: "CMD-1" },
      source: "setting",
    });
    expect(announcer.announced).toEqual([]);

    await afterCommit.commit();

    expect(announcer.announced).toEqual([{ orderIds: ["o_1"], at: NOW }]);
    expect(notifier.notified).toEqual([]);
  });

  it("« Déposer » autorise le dépôt — même signature exigée — sans écrire la tournée", async () => {
    const { handler, rounds, decisions, notifier, afterCommit, events } = reporting("deposit");

    await handler.execute(new ReportDeliveryIncidentCommand(PAUL, "r_1", NOBODY, null));
    await afterCommit.commit();

    expect(decisions.stored("s_1")).toMatchObject({
      outcome: "authorize_deposit",
      source: "setting",
    });
    expect(rounds.stored("r_1")?.hasClosed("s_1")).toBe(false);
    expect(rounds.stored("r_1")?.version).toBe(2);
    expect(events.factTypes()).toEqual([
      "delivery_round.incident_reported",
      "delivery_round.stop_deposit_authorized",
    ]);
    expect(notifier.notified).toEqual([]);
  });

  it("« Me demander » ouvre la décision du commercial et le prévient, comme B3", async () => {
    const { handler, decisions, notifier, afterCommit, events } = reporting("ask");

    await handler.execute(new ReportDeliveryIncidentCommand(PAUL, "r_1", NOBODY, null));
    await afterCommit.commit();

    expect(decisions.stored("s_1")).toMatchObject({ outcome: null, source: null });
    expect(events.factTypes()).toEqual(["delivery_round.incident_reported"]);
    expect(notifier.notified).toHaveLength(1);
  });

  it("une décision déjà ouverte sur l'arrêt n'est pas tranchée par le réglage", async () => {
    const decisions = new InMemoryStopDecisions(openDecision({ openedByIncidentId: "inc_0" }));
    const { handler, rounds, events } = reporting("bring_back", decisions);

    await handler.execute(new ReportDeliveryIncidentCommand(PAUL, "r_1", NOBODY, null));

    expect(decisions.stored("s_1")).toMatchObject({ outcome: null, openedByIncidentId: "inc_0" });
    expect(rounds.stored("r_1")?.hasClosed("s_1")).toBe(false);
    expect(events.factTypes()).toEqual(["delivery_round.incident_reported"]);
  });

  it("un motif qui n'ouvre pas de décision ne déclenche pas le réglage", async () => {
    const { handler, decisions, rounds } = reporting("bring_back");

    await handler.execute(
      new ReportDeliveryIncidentCommand(
        PAUL,
        "r_1",
        { family: "technical", reason: "vehicle_breakdown", note: "" },
        null,
      ),
    );

    expect(decisions.stored("s_1")).toBeUndefined();
    expect(rounds.stored("r_1")?.hasClosed("s_1")).toBe(false);
  });
});
