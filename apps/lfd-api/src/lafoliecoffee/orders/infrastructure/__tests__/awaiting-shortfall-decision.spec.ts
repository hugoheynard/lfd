import { awaitingShortfallDecisionOf } from "../awaiting-shortfall-decision.js";

const REPORTED = new Date(1_000);
const DECIDED = new Date(2_000);

describe("awaitingShortfallDecisionOf — le manque qui retient le comptoir (D7)", () => {
  it("vrai d'un manque signalé et pas encore décidé", () => {
    expect(
      awaitingShortfallDecisionOf({
        status: "ready",
        shortfalls: [{ reportedAt: REPORTED, decidedAt: null }],
      }),
    ).toBe(true);
  });

  it("faux une fois décidé, sans manque, ou effacé", () => {
    expect(
      awaitingShortfallDecisionOf({
        status: "ready",
        shortfalls: [{ reportedAt: REPORTED, decidedAt: DECIDED }],
      }),
    ).toBe(false);
    expect(awaitingShortfallDecisionOf({ status: "ready", shortfalls: [] })).toBe(false);
    expect(
      awaitingShortfallDecisionOf({
        status: "ready",
        shortfalls: [{ reportedAt: null, decidedAt: null }],
      }),
    ).toBe(false);
  });

  it("faux d'une commande annulée : elle n'attend plus aucune décision", () => {
    expect(
      awaitingShortfallDecisionOf({
        status: "cancelled",
        shortfalls: [{ reportedAt: REPORTED, decidedAt: null }],
      }),
    ).toBe(false);
  });
});
