import {
  StopDecisionOnClosedStopError,
  StopDecisionOnReturnedRoundError,
} from "../../errors/delivery-decision-errors.js";
import { StopDecision, type DecidedStop } from "../stop-decision.js";

// Des instants comparés entre eux seulement, jamais à l'horloge.
const OPENED = new Date(1_000);
const FIRST = new Date(2_000);
const LATER = new Date(3_000);
const LEA = { staffUserId: "staff_lea", name: "Léa Martin" };
const MARC = { staffUserId: "staff_marc", name: "Marc Petit" };
const OPEN_STOP: DecidedStop = { label: "CMD-1", closed: false, returned: false };

function opened(): StopDecision {
  return StopDecision.open({
    stopId: "s_1",
    roundId: "r_1",
    orderId: "o_1",
    serviceDay: "2030-03-12",
    incidentId: "inc_1",
    at: OPENED,
  });
}

describe("StopDecision — le commercial décide (B3, § 10 bis)", () => {
  it("s'ouvre à décider : ni réponse, ni source, ni auteur", () => {
    const decision = opened();

    expect(decision.state).toBe("pending");
    expect(decision.loadedVersion).toBeNull();
    expect(decision.toSnapshot()).toMatchObject({
      openedByIncidentId: "inc_1",
      openedAt: OPENED,
      outcome: null,
      source: null,
      decidedAt: null,
      decidedBy: null,
    });
  });

  it("« Autoriser le dépôt » : la réponse, sa source `staff`, qui et quand", () => {
    const decision = opened();

    expect(decision.authorizeDeposit(OPEN_STOP, LEA, FIRST)).toBe(true);
    expect(decision.state).toBe("authorize_deposit");
    expect(decision.toSnapshot()).toMatchObject({
      source: "staff",
      decidedAt: FIRST,
      decidedBy: "staff_lea",
      decidedByName: "Léa Martin",
    });
  });

  it("🔴 « Autoriser » puis « Rapporter » : la dernière l'emporte, son auteur aussi", () => {
    const decision = opened();
    decision.authorizeDeposit(OPEN_STOP, LEA, FIRST);

    expect(decision.bringBack(OPEN_STOP, MARC, LATER)).toBe(true);
    expect(decision.state).toBe("bring_back");
    expect(decision.toSnapshot()).toMatchObject({ decidedAt: LATER, decidedBy: "staff_marc" });
  });

  it("répéter la réponse en vigueur ne change rien : le premier reste l'auteur", () => {
    const decision = opened();
    decision.authorizeDeposit(OPEN_STOP, LEA, FIRST);

    expect(decision.authorizeDeposit(OPEN_STOP, MARC, LATER)).toBe(false);
    expect(decision.toSnapshot()).toMatchObject({ decidedAt: FIRST, decidedBy: "staff_lea" });
  });

  it("🔴 refusée sur un arrêt clos — déjà remis, déposé, ou rapporté", () => {
    const closed: DecidedStop = { ...OPEN_STOP, closed: true };

    expect(() => opened().authorizeDeposit(closed, LEA, FIRST)).toThrow(
      StopDecisionOnClosedStopError,
    );
    expect(() => opened().bringBack(closed, LEA, FIRST)).toThrow(StopDecisionOnClosedStopError);
  });

  it("🔴 refusée sur une tournée rentrée, en nommant la commande", () => {
    const returned: DecidedStop = { ...OPEN_STOP, returned: true };

    expect(() => opened().bringBack(returned, LEA, FIRST)).toThrow(
      StopDecisionOnReturnedRoundError,
    );
    expect(() => opened().authorizeDeposit(returned, LEA, FIRST)).toThrow(/CMD-1/u);
  });

  it("restaurée, elle garde la version lue que l'adaptateur exigera", () => {
    const decision = StopDecision.restore(opened().toSnapshot(), 4);

    expect(decision.loadedVersion).toBe(4);
    expect(decision.state).toBe("pending");
  });
});

describe("StopDecision.settle — le réglage décide d'avance (B3 bis)", () => {
  it("naît prise : source `setting`, un instant, ni auteur ni nom", () => {
    const decision = opened();

    expect(decision.settle("bring_back", OPEN_STOP, FIRST)).toBe(true);
    expect(decision.state).toBe("bring_back");
    expect(decision.toSnapshot()).toMatchObject({
      outcome: "bring_back",
      source: "setting",
      decidedAt: FIRST,
      decidedBy: null,
      decidedByName: null,
    });
  });

  it("un commercial peut encore répondre ensuite, et la source devient la sienne", () => {
    const decision = opened();
    decision.settle("authorize_deposit", OPEN_STOP, FIRST);

    expect(decision.bringBack(OPEN_STOP, LEA, LATER)).toBe(true);
    expect(decision.toSnapshot()).toMatchObject({ source: "staff", decidedBy: LEA.staffUserId });
  });

  it("refuse un arrêt clos ou une tournée rentrée, comme le commercial", () => {
    expect(() => opened().settle("bring_back", { ...OPEN_STOP, closed: true }, FIRST)).toThrow(
      StopDecisionOnClosedStopError,
    );
    expect(() =>
      opened().settle("authorize_deposit", { ...OPEN_STOP, returned: true }, FIRST),
    ).toThrow(StopDecisionOnReturnedRoundError);
  });
});
