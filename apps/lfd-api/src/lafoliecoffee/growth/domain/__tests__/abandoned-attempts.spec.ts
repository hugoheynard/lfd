import { withoutAbandonedAttempts } from "../abandoned-attempts.js";

const placed = (orderId: string) => ({ type: "order.placed", payload: { orderId } });

describe("withoutAbandonedAttempts", () => {
  it("écarte le order.placed d'une tentative abandonnée et garde les autres", () => {
    const events = [placed("o_tentative"), placed("o_payee"), placed("o_compte")];

    const kept = withoutAbandonedAttempts(events, new Set(["o_tentative"]));

    expect(kept.map((e) => e.payload.orderId)).toEqual(["o_payee", "o_compte"]);
  });

  it("garde le fait d'abandon et les autres types, même s'ils portent l'id d'une tentative", () => {
    const abandoned = { type: "order.abandoned", payload: { orderId: "o_tentative" } };
    const registered = { type: "user.registered", payload: {} };

    const kept = withoutAbandonedAttempts([abandoned, registered], new Set(["o_tentative"]));

    expect(kept).toEqual([abandoned, registered]);
  });

  it("garde un order.placed sans orderId (fait ancien ou semé à la main)", () => {
    const legacy = { type: "order.placed", payload: { totalCents: 900 } };

    expect(withoutAbandonedAttempts([legacy], new Set(["o_tentative"]))).toEqual([legacy]);
  });

  it("ne retire rien quand il n'y a aucune tentative", () => {
    const events = [placed("o1")];

    expect(withoutAbandonedAttempts(events, new Set())).toEqual(events);
  });
});
