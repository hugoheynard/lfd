import { DeliveryRound } from "../../entities/delivery-round.js";
import { applyProposal } from "../apply-proposal.js";

// Des jours comparés entre eux seulement, jamais à l'horloge.
const AT = new Date(0);
const LATER = new Date(60_000);
const DAY = "2030-01-07";

function withTransfer(): DeliveryRound {
  return DeliveryRound.restore({
    id: "r1",
    serviceDay: DAY,
    vehicleId: "v1",
    vehicleName: "Kangoo",
    passage: 1,
    version: 3,
    departedAt: null,
    driverStaffId: null,
    createdAt: AT,
    updatedAt: AT,
    stops: [
      { kind: "order", id: "s1", orderId: "o1", position: 1, closedAt: null },
      { kind: "transfer", id: "st", transferId: "t1", position: 2, closedAt: null },
      { kind: "order", id: "s2", orderId: "o2", position: 3, closedAt: null },
    ],
  });
}

describe("appliquer une proposition sur une tournée qui porte un transfert (lot T1)", () => {
  it("range les commandes dans l'ordre proposé, l'arrêt de transfert à sa place", () => {
    const r1 = withTransfer();

    applyProposal({
      proposal: [{ roundId: "r1", vehicleId: "v1", orderIds: ["o2", "o1"] }],
      rounds: new Map([["r1", r1]]),
      open: () => {
        throw new Error("aucune tournée à ouvrir");
      },
      newStopId: () => "unused",
      timings: [],
      at: LATER,
    });

    expect(r1.liveStops.map((stop) => stop.id)).toEqual(["s2", "st", "s1"]);
    expect(r1.transferIds).toEqual(["t1"]);
  });
});
