import { DeliveryRound } from "../../entities/delivery-round.js";
import { Vehicle } from "../../entities/vehicle.js";
import { DeliveryRoundDepartedError } from "../../errors/delivery-loading-errors.js";
import { InvalidProposalError } from "../../errors/delivery-routing-errors.js";
import { type ApplyProposalInput, applyProposal } from "../apply-proposal.js";

const AT = new Date(0);
const LATER = new Date(60_000);
const DAY = "2030-01-07";

function round(
  id: string,
  vehicleId: string,
  orderIds: readonly string[],
  departedAt: Date | null = null,
): DeliveryRound {
  return DeliveryRound.restore({
    id,
    serviceDay: DAY,
    vehicleId,
    vehicleName: `Véhicule ${vehicleId}`,
    passage: 1,
    version: 3,
    departedAt,
    createdAt: AT,
    updatedAt: AT,
    stops: orderIds.map((orderId, index) => ({
      id: `${id}_${orderId}`,
      orderId,
      position: index + 1,
      closedAt: null,
    })),
  });
}

let sequence = 0;

function inputOf(
  rounds: readonly DeliveryRound[],
  proposal: ApplyProposalInput["proposal"],
): ApplyProposalInput {
  return {
    proposal,
    rounds: new Map(rounds.map((r) => [r.id, r])),
    open: (vehicleId) =>
      DeliveryRound.open({
        id: `new_${vehicleId}`,
        serviceDay: DAY,
        vehicle: Vehicle.register({ id: vehicleId, name: "Trafic", plate: "AB-123-CD", at: AT }),
        passage: 2,
        at: LATER,
      }),
    newStopId: () => {
      sequence += 1;
      return `stop_${String(sequence)}`;
    },
    at: LATER,
  };
}

describe("appliquer une proposition (L7-C6, L7-C11)", () => {
  it("déplace la MÊME ligne d'arrêt, affecte le neuf, réordonne", () => {
    const r1 = round("r1", "v1", ["o1", "o2"]);
    const r2 = round("r2", "v2", ["o3"]);

    const applied = applyProposal(
      inputOf(
        [r1, r2],
        [
          { roundId: "r1", vehicleId: "v1", orderIds: ["o3", "o1"] },
          { roundId: "r2", vehicleId: "v2", orderIds: ["o4", "o2"] },
        ],
      ),
    );

    expect(r1.orderIds).toEqual(["o3", "o1"]);
    expect(r2.orderIds).toEqual(["o4", "o2"]);
    expect(r1.liveStops.find((s) => s.orderId === "o3")?.id).toBe("r2_o3");
    expect(r2.liveStops.find((s) => s.orderId === "o2")?.id).toBe("r1_o2");
    expect(applied.movedStops.map((s) => s.stopId).sort()).toEqual(["r1_o2", "r2_o3"]);
    expect(applied.rounds.map((a) => [a.round.id, a.before])).toEqual([
      ["r1", ["o1", "o2"]],
      ["r2", ["o3"]],
    ]);
  });

  it("ouvre une tournée pour une ligne sans identifiant", () => {
    const r1 = round("r1", "v1", ["o1", "o2"]);

    const applied = applyProposal(
      inputOf(
        [r1],
        [
          { roundId: "r1", vehicleId: "v1", orderIds: ["o1"] },
          { roundId: null, vehicleId: "v2", orderIds: ["o2", "o5"] },
        ],
      ),
    );

    const opened = applied.rounds.find((a) => a.opened);
    expect(opened?.round.orderIds).toEqual(["o2", "o5"]);
    expect(opened?.before).toEqual([]);
    expect(r1.orderIds).toEqual(["o1"]);
  });

  it("une tournée qui ne fait que perdre un arrêt garde les autres", () => {
    const source = round("r1", "v1", ["o1", "o2"]);

    applyProposal(inputOf([source], [{ roundId: null, vehicleId: "v2", orderIds: ["o2"] }]));

    expect(source.orderIds).toEqual(["o1"]);
  });

  it("🔴 refuse une tournée dont un arrêt n'est placé nulle part — jamais retiré en silence", () => {
    const r1 = round("r1", "v1", ["o1", "o2"]);

    expect(() =>
      applyProposal(inputOf([r1], [{ roundId: "r1", vehicleId: "v1", orderIds: ["o1"] }])),
    ).toThrow(InvalidProposalError);
  });

  it("refuse une commande proposée deux fois", () => {
    expect(() =>
      applyProposal(
        inputOf(
          [],
          [
            { roundId: null, vehicleId: "v1", orderIds: ["o1"] },
            { roundId: null, vehicleId: "v2", orderIds: ["o1"] },
          ],
        ),
      ),
    ).toThrow(InvalidProposalError);
  });

  it("refuse de changer le véhicule d'une tournée existante", () => {
    const r1 = round("r1", "v1", ["o1"]);

    expect(() =>
      applyProposal(inputOf([r1], [{ roundId: "r1", vehicleId: "v2", orderIds: ["o1"] }])),
    ).toThrow(InvalidProposalError);
  });

  it("ne touche jamais une tournée partie (I6)", () => {
    const gone = round("r1", "v1", ["o1"], AT);

    expect(() =>
      applyProposal(inputOf([gone], [{ roundId: null, vehicleId: "v2", orderIds: ["o1"] }])),
    ).toThrow(DeliveryRoundDepartedError);
  });

  it("une proposition qui ne change rien n'avance aucune version", () => {
    const r1 = round("r1", "v1", ["o1", "o2"]);

    applyProposal(inputOf([r1], [{ roundId: "r1", vehicleId: "v1", orderIds: ["o1", "o2"] }]));

    expect(r1.version).toBe(3);
  });
});
