/**
 * **Le départ des commandes, lu par le colisage** (lot L2 —
 * `documentation/commandes/back-office/tri-depart-et-couleurs.md`, §3) — sur le vrai
 * Postgres : l'adaptateur de la livraison (`PrismaOrderDeparturesReader`)
 * trouve la tournée d'une livraison et celle qui porte l'arrêt du transfert
 * d'un retrait au village, et ne date pas ce qui n'a pas de départ.
 *
 * Le départ PRÉVU est posé en base : il naît d'un chronométrage par OSRM, que
 * l'e2e ne lance pas. C'est la lecture qui est éprouvée ici, pas le calcul.
 *
 * Frontières doublées, en plus de la signature staff : la carte routière et le
 * trajet du transfert (T0), comme `internal-transfer.e2e-spec.ts`.
 */
import { localToInstant } from "@lfd/contracts";

import { RoadTravelTimeReader } from "../src/delivery/channels/commerce/index.js";
import { OrderDeparturesReader } from "../src/packing/channels/delivery/index.js";
import { bootstrapE2e, serviceDay, type E2eContext } from "./e2e-harness.js";
import {
  ADMIN_VERIFIER_OVERRIDE,
  addVehicle,
  assign,
  forgetCustomer,
  openRound,
  seedDelivery,
} from "./delivery-rounds-scene.js";
import { ROAD_ROUTING_OVERRIDES } from "./delivery-routing-scene.js";
import { composedTransfer, FixedRoad } from "./internal-transfer-scene.js";

const DAY = serviceDay();
const PLANNED_RETURN_MINUTES = 120;

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      ADMIN_VERIFIER_OVERRIDE,
      ...ROAD_ROUTING_OVERRIDES,
      { token: RoadTravelTimeReader, value: new FixedRoad() },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  forgetCustomer();
});

function parisAt(time: string): Date {
  const instant = localToInstant(DAY, time);
  if (instant === null) {
    throw new TypeError(`Heure inexistante à Paris : ${DAY} ${time}`);
  }
  return instant;
}

/** Le chronométrage, tel que « Appliquer » l'écrit : les trois colonnes ensemble (CHECK). */
async function planDeparture(roundId: string, time: string): Promise<void> {
  const departureAt = parisAt(time);
  await ctx.prisma.deliveryRound.update({
    where: { id: roundId },
    data: {
      plannedDepartureAt: departureAt,
      plannedReturnAt: new Date(departureAt.getTime() + PLANNED_RETURN_MINUTES * 60_000),
      plannedMeters: 0,
    },
  });
}

describe("OrderDeparturesReader — implémenté par la livraison (L2)", () => {
  it("une livraison part avec sa tournée ; sans départ prévu, elle n'a pas d'heure", async () => {
    const roundId = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));
    const placed = await seedDelivery(ctx, DAY);
    const loose = await seedDelivery(ctx, DAY);
    await assign(ctx, DAY, roundId, placed.id);
    const reader = ctx.app.get(OrderDeparturesReader);

    expect(await reader.departuresOf([placed.id, loose.id])).toEqual([]);

    await planDeparture(roundId, "07:10");
    expect(await reader.departuresOf([placed.id, loose.id])).toEqual([
      { orderId: placed.id, at: parisAt("07:10"), via: "delivery", departed: false },
    ]);
  });

  it("un retrait au village part avec la tournée qui porte l'arrêt de son transfert", async () => {
    const { orderId } = await composedTransfer(ctx, DAY);
    const round = await ctx.prisma.deliveryRound.findFirstOrThrow({ select: { id: true } });
    await planDeparture(round.id, "06:30");

    expect(await ctx.app.get(OrderDeparturesReader).departuresOf([orderId])).toEqual([
      { orderId, at: parisAt("06:30"), via: "transfer", departed: false },
    ]);
  });
});
