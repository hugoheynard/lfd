import {
  TransactionalDurablePublisher,
  TransactionalUnitOfWork,
} from "../../../../platform/outbox/__tests__/transactional-durable.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import {
  StopDecisionNotFoundError,
  StopDecisionOnClosedStopError,
  StopDecisionOnReturnedRoundError,
} from "../../../domain/errors/delivery-decision-errors.js";
import { StopDecisionDesk } from "../../stop-decision-desk.js";
import { AuthorizeStopDepositCommand } from "../authorize-stop-deposit.command.js";
import { AuthorizeStopDepositHandler } from "../authorize-stop-deposit.handler.js";
import { BringStopBackCommand } from "../bring-stop-back.command.js";
import { BringStopBackHandler } from "../bring-stop-back.handler.js";
import { DELIVERY_ORDERS_BROUGHT_BACK } from "../../../channels/handover/index.js";
import { InMemoryStopDecisions, openDecision } from "./decision-doubles.js";
import { DAY, FailingRounds, NOW, roundState } from "./doorstep-handover-scene.js";
import { deliveryOn, FixedDeliveryOrders, InMemoryDeliveryRounds } from "./round-doubles.js";

const LEA = "staff_lea";

function scene(
  options: { rounds?: InMemoryDeliveryRounds; decisions?: InMemoryStopDecisions } = {},
) {
  const rounds = options.rounds ?? new InMemoryDeliveryRounds(roundState());
  const decisions = options.decisions ?? new InMemoryStopDecisions(openDecision());
  const desk = new StopDecisionDesk(
    decisions,
    rounds,
    new FixedDeliveryOrders([deliveryOn("o_1", DAY, { reference: "CMD-1" })]),
    new FixedStaffAuthorDirectory(
      new Map(authorsKnownAs({ staffUserId: LEA, firstName: "Léa", lastName: "Martin" }, LEA)),
    ),
  );
  const events = new RecordingPublisher();
  const clock = new FixedClock(NOW);
  // La vraie sémantique de la transaction : un fait durable écrit dans une
  // unité qui échoue n'est jamais validé (DD1).
  const uow = new TransactionalUnitOfWork();
  return {
    rounds,
    decisions,
    events,
    uow,
    authorize: new AuthorizeStopDepositHandler(desk, clock, events, uow),
    bringBack: new BringStopBackHandler(
      desk,
      rounds,
      new TransactionalDurablePublisher(uow),
      clock,
      events,
      uow,
    ),
  };
}

describe("AuthorizeStopDepositHandler — « Autoriser le dépôt cette fois » (B3)", () => {
  it("pose la décision, tracée (qui, quand), journalise — et ne touche PAS la tournée", async () => {
    const { authorize, decisions, rounds, events } = scene();

    await authorize.execute(new AuthorizeStopDepositCommand(LEA, "s_1"));

    expect(decisions.stored("s_1")).toMatchObject({
      outcome: "authorize_deposit",
      source: "staff",
      decidedAt: NOW,
      decidedBy: LEA,
      decidedByName: "Léa Martin",
    });
    expect(rounds.saved).toEqual([]);
    expect(rounds.stored("r_1")?.version).toBe(2);
    expect(events.factTypes()).toEqual(["delivery_round.stop_deposit_authorized"]);
    expect(events.traced[0]?.journalFact().payload).toEqual({
      subjectLabel: "Kangoo",
      day: DAY,
      passage: 1,
      order: { id: "o_1", name: "CMD-1" },
      source: "staff",
    });
  });

  it("répétée, elle n'écrit rien et ne journalise rien", async () => {
    const { authorize, decisions, events } = scene();
    await authorize.execute(new AuthorizeStopDepositCommand(LEA, "s_1"));

    await authorize.execute(new AuthorizeStopDepositCommand(LEA, "s_1"));

    expect(decisions.saves).toEqual(["s_1"]);
    expect(events.traced).toHaveLength(1);
  });

  it("🔴 refusée sur un arrêt clos (déposé, remis) — rien ne s'écrit", async () => {
    const round = roundState();
    round.closeStop("s_1", NOW);
    const { authorize, decisions, events } = scene({ rounds: new InMemoryDeliveryRounds(round) });

    await expect(authorize.execute(new AuthorizeStopDepositCommand(LEA, "s_1"))).rejects.toThrow(
      StopDecisionOnClosedStopError,
    );
    expect(decisions.saves).toEqual([]);
    expect(events.traced).toEqual([]);
  });

  it("🔴 refusée sur une tournée rentrée", async () => {
    const { authorize } = scene({ rounds: new InMemoryDeliveryRounds(roundState(NOW)) });

    await expect(authorize.execute(new AuthorizeStopDepositCommand(LEA, "s_1"))).rejects.toThrow(
      StopDecisionOnReturnedRoundError,
    );
  });

  it("un arrêt sans décision ouverte : 404 nommé", async () => {
    const { authorize } = scene({ decisions: new InMemoryStopDecisions() });

    await expect(authorize.execute(new AuthorizeStopDepositCommand(LEA, "s_1"))).rejects.toThrow(
      StopDecisionNotFoundError,
    );
  });
});

describe("BringStopBackHandler — « Rapporter » (B3, LB-Q2)", () => {
  it("🔴 clôt l'arrêt par la tournée, pose la décision, journalise ; le retour part en fait durable avec la transaction", async () => {
    const { bringBack, decisions, rounds, events, uow } = scene();

    await bringBack.execute(new BringStopBackCommand(LEA, "s_1"));

    expect(rounds.stored("r_1")?.hasClosed("s_1")).toBe(true);
    expect(rounds.stored("r_1")?.orderIds).toEqual(["o_2"]);
    expect(decisions.stored("s_1")).toMatchObject({ outcome: "bring_back", decidedBy: LEA });
    expect(events.factTypes()).toEqual(["delivery_round.stop_brought_back"]);
    expect(uow.of(DELIVERY_ORDERS_BROUGHT_BACK)).toEqual([
      {
        type: DELIVERY_ORDERS_BROUGHT_BACK,
        key: `${DELIVERY_ORDERS_BROUGHT_BACK}:r_1:o_1`,
        payload: { roundId: "r_1", orderIds: ["o_1"], broughtBackAt: NOW.toISOString() },
      },
    ]);
  });

  it("🔴 « Autoriser » puis « Rapporter » : permis tant que le livreur n'a pas déposé, la dernière l'emporte", async () => {
    const { authorize, bringBack, decisions } = scene();
    await authorize.execute(new AuthorizeStopDepositCommand(LEA, "s_1"));

    await bringBack.execute(new BringStopBackCommand(LEA, "s_1"));

    expect(decisions.stored("s_1")?.outcome).toBe("bring_back");
  });

  it("🔴 « Rapporter » puis « Autoriser » : refusé, l'arrêt est clos", async () => {
    const { authorize, bringBack } = scene();
    await bringBack.execute(new BringStopBackCommand(LEA, "s_1"));

    await expect(authorize.execute(new AuthorizeStopDepositCommand(LEA, "s_1"))).rejects.toThrow(
      StopDecisionOnClosedStopError,
    );
  });

  it("🔴 l'écriture de la tournée échoue : aucun fait de retour n'est validé", async () => {
    const { bringBack, uow } = scene({
      rounds: new FailingRounds(roundState()),
    });

    await expect(bringBack.execute(new BringStopBackCommand(LEA, "s_1"))).rejects.toThrow(
      "écriture de la tournée refusée",
    );

    expect(uow.of(DELIVERY_ORDERS_BROUGHT_BACK)).toEqual([]);
  });

  it("🔴 refusée sur un arrêt déjà déposé par le livreur", async () => {
    const round = roundState();
    round.closeStop("s_1", NOW);
    const { bringBack, uow } = scene({ rounds: new InMemoryDeliveryRounds(round) });

    await expect(bringBack.execute(new BringStopBackCommand(LEA, "s_1"))).rejects.toThrow(
      StopDecisionOnClosedStopError,
    );
    expect(uow.of(DELIVERY_ORDERS_BROUGHT_BACK)).toEqual([]);
  });
});
