import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import { DeliveryRound } from "../../../domain/entities/delivery-round.js";
import type { DoorstepStopState } from "../../../domain/entities/doorstep-stop.js";
import {
  DoorstepRoundNotDepartedError,
  DoorstepRoundStaleError,
  DoorstepStopClosedError,
  DoorstepStopNotFoundError,
  InvalidIncidentPhotoError,
  RoundNotDepartedForReturnError,
  RoundStopsWithoutOutcomeError,
  StopStillToHandOverError,
} from "../../../domain/errors/delivery-doorstep-errors.js";
import { DriverRoundNotFoundError } from "../../../domain/errors/delivery-driver-errors.js";
import type { DriverRoundRow } from "../../../domain/ports/driver-rounds.reader.js";
import { CloseStopWithoutHandoverCommand } from "../close-stop-without-handover.command.js";
import { CloseStopWithoutHandoverHandler } from "../close-stop-without-handover.handler.js";
import { DeclareStopArrivalCommand } from "../declare-stop-arrival.command.js";
import { DeclareStopArrivalHandler } from "../declare-stop-arrival.handler.js";
import { ReportDeliveryIncidentCommand } from "../report-delivery-incident.command.js";
import { ReportDeliveryIncidentHandler } from "../report-delivery-incident.handler.js";
import { StopDecisionBySetting } from "../../stop-decision-by-setting.js";
import { StopDecisionOpening } from "../../stop-decision-opening.js";
import { HeldAfterCommit } from "../../../../platform/database/__tests__/held-after-commit.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { ReturnDeliveryRoundCommand } from "../return-delivery-round.command.js";
import { ReturnDeliveryRoundHandler } from "../return-delivery-round.handler.js";
import { ReturnMyRoundCommand } from "../return-my-round.command.js";
import { ReturnMyRoundHandler } from "../return-my-round.handler.js";
import {
  FixedDriverRounds,
  FixedOrderStates,
  InMemoryDocuments,
  InMemoryDoorstepStops,
  InMemoryIncidents,
} from "./doorstep-doubles.js";
import {
  InMemoryStopDecisions,
  openDecision,
  RecordingBroughtBack,
  RecordingStaffNotifier,
} from "./decision-doubles.js";
import { deliveryOn, FixedDeliveryOrders, InMemoryDeliveryRounds } from "./round-doubles.js";

// Des instants comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";
const DEPARTED = new Date(1_000);
const NOW = new Date(5_000);
const PAUL = "staff_paul";
const KEY = { roundId: "r_1", vehicleName: "Kangoo", serviceDay: DAY, passage: 1 };
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function doorstep(overrides: Partial<DoorstepStopState> = {}): DoorstepStopState {
  return {
    stopId: "s_1",
    orderId: "o_1",
    round: KEY,
    departedAt: DEPARTED,
    returnedAt: null,
    reference: "CMD-1",
    closedAt: null,
    arrivedAt: null,
    signatureRequired: false,
    depositAllowed: false,
    decision: null,
    ...overrides,
  };
}

describe("DeclareStopArrivalHandler — « Je suis arrivé » (AP-D6)", () => {
  function arrival(state: DoorstepStopState = doorstep()) {
    const stops = new InMemoryDoorstepStops(PAUL, state);
    const events = new RecordingPublisher();
    const handler = new DeclareStopArrivalHandler(
      stops,
      new FixedClock(NOW),
      events,
      new DirectUnitOfWork(),
    );
    return { handler, stops, events };
  }

  it("écrit l'instant du `Clock` dans l'exécution, et le journalise", async () => {
    const { handler, stops, events } = arrival();

    await handler.execute(new DeclareStopArrivalCommand(PAUL, "r_1", "s_1"));

    expect(stops.arrivedAt("s_1")).toEqual(NOW);
    expect(events.traced[0]?.journalFact()).toEqual({
      type: "delivery_round.stop_arrived",
      subjectType: "delivery_round",
      subjectId: "r_1",
      payload: {
        subjectLabel: "Kangoo",
        day: DAY,
        passage: 1,
        order: { id: "o_1", name: "CMD-1" },
      },
    });
  });

  it("une seconde arrivée ne réécrit rien et ne journalise rien", async () => {
    const first = new Date(2_000);
    const { handler, stops, events } = arrival(doorstep({ arrivedAt: first }));

    await handler.execute(new DeclareStopArrivalCommand(PAUL, "r_1", "s_1"));

    expect(stops.arrivedAt("s_1")).toEqual(first);
    expect(stops.saves).toEqual([]);
    expect(events.traced).toEqual([]);
  });

  it("🔴 le mur : un autre livreur, ou une autre tournée, prend 404", async () => {
    const { handler, stops } = arrival();

    await expect(
      handler.execute(new DeclareStopArrivalCommand("staff_autre", "r_1", "s_1")),
    ).rejects.toThrow(DoorstepStopNotFoundError);
    await expect(
      handler.execute(new DeclareStopArrivalCommand(PAUL, "r_2", "s_1")),
    ).rejects.toThrow(DoorstepStopNotFoundError);
    expect(stops.saves).toEqual([]);
  });

  it("refuse une tournée au dépôt, et un arrêt clos sans arrivée", async () => {
    await expect(
      arrival(doorstep({ departedAt: null })).handler.execute(
        new DeclareStopArrivalCommand(PAUL, "r_1", "s_1"),
      ),
    ).rejects.toThrow(DoorstepRoundNotDepartedError);
    await expect(
      arrival(doorstep({ closedAt: NOW })).handler.execute(
        new DeclareStopArrivalCommand(PAUL, "r_1", "s_1"),
      ),
    ).rejects.toThrow(DoorstepStopClosedError);
  });
});

describe("CloseStopWithoutHandoverHandler — « déjà retirée / annulée » (AP-D2)", () => {
  function departedRound(): DeliveryRound {
    return DeliveryRound.restore({
      id: "r_1",
      serviceDay: DAY,
      vehicleId: "v_1",
      vehicleName: "Kangoo",
      passage: 1,
      version: 2,
      departedAt: DEPARTED,
      driverStaffId: PAUL,
      createdAt: new Date(0),
      updatedAt: DEPARTED,
      stops: [
        { id: "s_1", orderId: "o_1", position: 1, closedAt: null },
        { id: "s_2", orderId: "o_2", position: 2, closedAt: null },
      ],
    });
  }

  function closing(state: "open" | "handed_over" | "cancelled") {
    const rounds = new InMemoryDeliveryRounds(departedRound());
    const events = new RecordingPublisher();
    const handler = new CloseStopWithoutHandoverHandler(
      rounds,
      new FixedOrderStates([{ orderId: "o_1", state, ready: state === "handed_over" }]),
      new FixedDeliveryOrders([deliveryOn("o_1", DAY)]),
      new FixedClock(NOW),
      events,
      new DirectUnitOfWork(),
    );
    return { handler, rounds, events };
  }

  it("clôt l'arrêt d'une commande déjà retirée, sans attester, et le journalise", async () => {
    const { handler, rounds, events } = closing("handed_over");

    await handler.execute(new CloseStopWithoutHandoverCommand(PAUL, "r_1", "s_1", { version: 2 }));

    expect(rounds.stored("r_1")?.hasClosed("s_1")).toBe(true);
    expect(rounds.stored("r_1")?.orderIds).toEqual(["o_2"]);
    expect(events.traced[0]?.journalFact().payload).toEqual({
      subjectLabel: "Kangoo",
      day: DAY,
      passage: 1,
      order: { id: "o_1", name: "CMD-o_1" },
      cause: "handed_over",
    });
  });

  it("clôt aussi l'arrêt d'une commande annulée", async () => {
    const { handler, events } = closing("cancelled");

    await handler.execute(new CloseStopWithoutHandoverCommand(PAUL, "r_1", "s_1", { version: 2 }));

    expect(events.traced[0]?.journalFact().payload).toMatchObject({ cause: "cancelled" });
  });

  it("🔴 409 nommé sur une commande encore à remettre — rien ne s'écrit", async () => {
    const { handler, rounds, events } = closing("open");

    await expect(
      handler.execute(new CloseStopWithoutHandoverCommand(PAUL, "r_1", "s_1", { version: 2 })),
    ).rejects.toThrow(StopStillToHandOverError);
    expect(rounds.saved).toEqual([]);
    expect(events.traced).toEqual([]);
  });

  it("rejouée après une perte de réseau, avec l'ancienne version : « déjà fait »", async () => {
    const { handler, rounds, events } = closing("handed_over");
    await handler.execute(new CloseStopWithoutHandoverCommand(PAUL, "r_1", "s_1", { version: 2 }));

    await handler.execute(new CloseStopWithoutHandoverCommand(PAUL, "r_1", "s_1", { version: 2 }));

    expect(rounds.saved).toEqual(["r_1"]);
    expect(events.traced).toHaveLength(1);
  });

  it("refuse une version périmée sur un arrêt encore ouvert, avec la phrase du livreur", async () => {
    const { handler } = closing("handed_over");

    await expect(
      handler.execute(new CloseStopWithoutHandoverCommand(PAUL, "r_1", "s_1", { version: 1 })),
    ).rejects.toThrow(DoorstepRoundStaleError);
  });

  it("🔴 le mur : la tournée d'un autre livreur prend 404 ; un arrêt inconnu aussi", async () => {
    const { handler } = closing("handed_over");

    await expect(
      handler.execute(
        new CloseStopWithoutHandoverCommand("staff_autre", "r_1", "s_1", { version: 2 }),
      ),
    ).rejects.toThrow(DriverRoundNotFoundError);
    await expect(
      handler.execute(new CloseStopWithoutHandoverCommand(PAUL, "r_1", "s_9", { version: 2 })),
    ).rejects.toThrow(DoorstepStopNotFoundError);
  });
});

describe("ReportDeliveryIncidentHandler — « Déclarer un problème » (§ 3)", () => {
  const ROUND: DriverRoundRow = {
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
        departed: null,
        bins: 1,
        coldBins: 0,
      },
    ],
  };

  function reporting(decisions = new InMemoryStopDecisions()) {
    const notifier = new RecordingStaffNotifier();
    const afterCommit = new HeldAfterCommit();
    const incidents = new InMemoryIncidents();
    const store = new InMemoryDocuments();
    const events = new RecordingPublisher();
    const handler = new ReportDeliveryIncidentHandler(
      new FixedDriverRounds(PAUL, ROUND),
      incidents,
      store,
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
        new StopDecisionBySetting(
          new InMemoryDeliveryRounds(),
          decisions,
          new RecordingBroughtBack(),
          afterCommit,
          new BackgroundWork(),
        ),
      ),
    );
    return { handler, incidents, store, events, decisions, notifier, afterCommit };
  }

  const FIELDS = { family: "doorstep", reason: "nobody_present", note: "", stopId: "s_1" } as const;

  it("écrit le signalement, range la photo sous une clé composée, et journalise sans la note", async () => {
    const { handler, incidents, store, events } = reporting();

    const id = await handler.execute(
      new ReportDeliveryIncidentCommand(PAUL, "r_1", { ...FIELDS, note: "trois coups" }, JPEG),
    );

    expect(id).toBe("inc_000001");
    expect(incidents.recorded[0]).toMatchObject({
      roundId: "r_1",
      stopId: "s_1",
      serviceDay: DAY,
      note: "trois coups",
      photoKey: "delivery/incidents/r_1/inc_000001",
      reportedAt: NOW,
      reportedBy: PAUL,
      reportedByName: "Paul Roux",
    });
    expect(store.objects.get("delivery/incidents/r_1/inc_000001")?.contentType).toBe("image/jpeg");
    expect(events.traced[0]?.journalFact().payload).toEqual({
      subjectLabel: "Kangoo",
      day: DAY,
      passage: 1,
      order: "o_1",
      family: "doorstep",
      reason: "nobody_present",
      withPhoto: true,
    });
  });

  it("sans photo, rien ne part au stockage", async () => {
    const { handler, store, incidents } = reporting();

    await handler.execute(new ReportDeliveryIncidentCommand(PAUL, "r_1", FIELDS, null));

    expect(store.objects.size).toBe(0);
    expect(incidents.recorded[0]?.photoKey).toBeNull();
  });

  it("une photo refusée n'envoie rien et n'écrit rien", async () => {
    const { handler, store, incidents } = reporting();

    await expect(
      handler.execute(
        new ReportDeliveryIncidentCommand(PAUL, "r_1", FIELDS, Buffer.from("%PDF-1.7")),
      ),
    ).rejects.toThrow(InvalidIncidentPhotoError);
    expect(store.objects.size).toBe(0);
    expect(incidents.recorded).toEqual([]);
  });

  it("la ligne qui échoue retire la photo déjà rangée", async () => {
    const { handler, store, incidents } = reporting();
    incidents.failing = true;

    await expect(
      handler.execute(new ReportDeliveryIncidentCommand(PAUL, "r_1", FIELDS, JPEG)),
    ).rejects.toThrow("base en panne");
    expect(store.objects.size).toBe(0);
    expect(store.deleted).toEqual(["delivery/incidents/r_1/inc_000001"]);
  });

  it("🔴 B3 : « personne » ouvre une décision ; les commerciaux sont prévenus APRÈS la validation", async () => {
    const { handler, decisions, notifier, afterCommit } = reporting();

    await handler.execute(new ReportDeliveryIncidentCommand(PAUL, "r_1", FIELDS, null));

    expect(decisions.stored("s_1")).toMatchObject({
      roundId: "r_1",
      orderId: "o_1",
      serviceDay: DAY,
      openedByIncidentId: "inc_000001",
      openedAt: NOW,
      outcome: null,
    });
    expect(notifier.notified).toEqual([]);

    await afterCommit.commit();

    expect(notifier.notified).toEqual([
      expect.objectContaining({
        kind: "delivery.stop_decision",
        audience: "delivery_decisions:write",
        idempotencyKey: "delivery.stop_decision:inc_000001",
        link: "/livraison/a-decider",
      }),
    ]);
  });

  it("🔴 la transaction qui échoue n'ouvre rien et ne prévient personne", async () => {
    const { handler, incidents, notifier, afterCommit } = reporting();
    incidents.failing = true;

    await expect(
      handler.execute(new ReportDeliveryIncidentCommand(PAUL, "r_1", FIELDS, null)),
    ).rejects.toThrow("base en panne");
    afterCommit.discard();
    await afterCommit.commit();

    expect(notifier.notified).toEqual([]);
  });

  it("un second signalement garde la décision ouverte et prévient encore — une notice par signalement", async () => {
    const decisions = new InMemoryStopDecisions(openDecision({ openedByIncidentId: "inc_0" }));
    const { handler, notifier, afterCommit } = reporting(decisions);

    await handler.execute(new ReportDeliveryIncidentCommand(PAUL, "r_1", FIELDS, null));
    await afterCommit.commit();

    expect(decisions.stored("s_1")?.openedByIncidentId).toBe("inc_0");
    expect(notifier.notified.map((notice) => notice.idempotencyKey)).toEqual([
      "delivery.stop_decision:inc_000001",
    ]);
  });

  it("une autorisation déjà donnée ne se redemande pas", async () => {
    const decisions = new InMemoryStopDecisions(
      openDecision({
        outcome: "authorize_deposit",
        source: "staff",
        decidedAt: NOW,
        decidedBy: "staff_lea",
        decidedByName: "Léa",
      }),
    );
    const { handler, notifier, afterCommit } = reporting(decisions);

    await handler.execute(new ReportDeliveryIncidentCommand(PAUL, "r_1", FIELDS, null));
    await afterCommit.commit();

    expect(notifier.notified).toEqual([]);
    expect(decisions.saves).toEqual([]);
  });

  it("un problème qui n'est pas du client (marchandise abîmée, technique) n'ouvre rien", async () => {
    const { handler, decisions, notifier, afterCommit } = reporting();

    await handler.execute(
      new ReportDeliveryIncidentCommand(PAUL, "r_1", { ...FIELDS, reason: "goods_damaged" }, null),
    );
    await handler.execute(
      new ReportDeliveryIncidentCommand(
        PAUL,
        "r_1",
        { family: "technical", reason: "cold_failure", note: "", stopId: "s_1" },
        null,
      ),
    );
    await afterCommit.commit();

    expect(decisions.stored("s_1")).toBeUndefined();
    expect(notifier.notified).toEqual([]);
  });

  it("🔴 le mur : la tournée d'un autre livreur prend 404", async () => {
    const { handler } = reporting();

    await expect(
      handler.execute(new ReportDeliveryIncidentCommand("staff_autre", "r_1", FIELDS, null)),
    ).rejects.toThrow(DriverRoundNotFoundError);
  });
});

describe("« Tournée terminée » — ReturnMyRoundHandler et ReturnDeliveryRoundHandler (PL2)", () => {
  function departed(): DeliveryRound {
    return DeliveryRound.restore({
      id: "r_1",
      serviceDay: DAY,
      vehicleId: "v_1",
      vehicleName: "Kangoo",
      passage: 1,
      version: 2,
      departedAt: DEPARTED,
      driverStaffId: PAUL,
      createdAt: new Date(0),
      updatedAt: DEPARTED,
      stops: [{ id: "s_1", orderId: "o_1", position: 1, closedAt: null }],
    });
  }

  function returning(round: DeliveryRound = departed()) {
    const rounds = new InMemoryDeliveryRounds(round);
    const events = new RecordingPublisher();
    const directory = new FixedStaffAuthorDirectory(
      new Map(authorsKnownAs({ staffUserId: PAUL, firstName: "Paul", lastName: "Roux" }, PAUL)),
    );
    const mine = new ReturnMyRoundHandler(
      rounds,
      new FixedDeliveryOrders([deliveryOn("o_1", DAY, { customerLabel: "Refuge 1950" })]),
      directory,
      new FixedClock(NOW),
      events,
      new DirectUnitOfWork(),
    );
    const byAdmin = new ReturnDeliveryRoundHandler(
      rounds,
      directory,
      new FixedClock(NOW),
      events,
      new DirectUnitOfWork(),
    );
    return { rounds, events, mine, byAdmin };
  }

  /** L'arrêt a un sort : la tournée l'a clos (remis, déposé, sans remise, rapporté). */
  function settled(): DeliveryRound {
    const round = departed();
    round.closeStop("s_1", DEPARTED);
    return DeliveryRound.restore(round.toSnapshot());
  }

  it("le livreur rentre quand chaque arrêt a un sort : instant du `Clock`, auteur figé, un fait", async () => {
    const { rounds, events, mine } = returning(settled());

    await mine.execute(new ReturnMyRoundCommand(PAUL, "r_1"));

    expect(rounds.stored("r_1")?.toSnapshot().returned).toEqual({
      at: NOW,
      byStaffId: PAUL,
      byName: "Paul Roux",
    });
    expect(events.traced[0]?.journalFact()).toEqual({
      type: "delivery_round.returned",
      subjectType: "delivery_round",
      subjectId: "r_1",
      payload: { subjectLabel: "Kangoo", day: DAY, passage: 1, openStops: 0 },
    });
  });

  it("🔴 B4 : un arrêt sans sort refuse le livreur en le nommant — rien ne s'écrit, rien ne se journalise", async () => {
    const { rounds, events, mine } = returning();

    await expect(mine.execute(new ReturnMyRoundCommand(PAUL, "r_1"))).rejects.toThrow(
      RoundStopsWithoutOutcomeError,
    );
    await expect(mine.execute(new ReturnMyRoundCommand(PAUL, "r_1"))).rejects.toThrow(
      /Refuge 1950 \(CMD-o_1\)/u,
    );
    expect(rounds.saved).toEqual([]);
    expect(events.traced).toEqual([]);
  });

  it("la rentrée staff reste permise malgré un arrêt sans sort : il reste ouvert, le fait le compte", async () => {
    const { rounds, events, byAdmin } = returning();

    await byAdmin.execute(new ReturnDeliveryRoundCommand("staff_admin", "r_1"));

    expect(rounds.stored("r_1")?.liveStops).toHaveLength(1);
    expect(events.traced[0]?.journalFact().payload).toMatchObject({ openStops: 1 });
  });

  it("rejoué, rien ne s'écrit ni ne se journalise", async () => {
    const { rounds, events, mine, byAdmin } = returning(settled());
    await mine.execute(new ReturnMyRoundCommand(PAUL, "r_1"));

    await mine.execute(new ReturnMyRoundCommand(PAUL, "r_1"));
    await byAdmin.execute(new ReturnDeliveryRoundCommand("staff_admin", "r_1"));

    expect(rounds.saved).toEqual(["r_1"]);
    expect(events.traced).toHaveLength(1);
  });

  it("🔴 le mur : un autre livreur prend 404 ; l'admin, lui, n'a pas de mur", async () => {
    const { rounds, mine, byAdmin } = returning();

    await expect(mine.execute(new ReturnMyRoundCommand("staff_autre", "r_1"))).rejects.toThrow(
      DriverRoundNotFoundError,
    );
    await byAdmin.execute(new ReturnDeliveryRoundCommand("staff_admin", "r_1"));
    expect(rounds.stored("r_1")?.toSnapshot().returned?.byStaffId).toBe("staff_admin");
    expect(rounds.stored("r_1")?.toSnapshot().returned?.byName).toBe("");
  });

  it("refuse une tournée au dépôt", async () => {
    const atDepot = DeliveryRound.restore({ ...departed().toSnapshot(), departedAt: null });
    const { byAdmin } = returning(atDepot);

    await expect(
      byAdmin.execute(new ReturnDeliveryRoundCommand("staff_admin", "r_1")),
    ).rejects.toThrow(RoundNotDepartedForReturnError);
  });
});
