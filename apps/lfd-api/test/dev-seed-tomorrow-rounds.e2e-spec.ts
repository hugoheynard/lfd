/**
 * E2E des **tournées de demain du semis** (Hugo, 2026-10-06 : « un bel exemple
 * de tournées qui nécessiteraient 3 camionnettes »).
 *
 * Le rechargement complet, puis « Proposer » sur demain, par la vraie route :
 * trois tournées, une par camionnette, rien à répartir, aucune échéance
 * manquée — et, avec deux camionnettes seulement, la place manque. La carte
 * routière est doublée (vol d'oiseau tabulé, `ROAD_ROUTING_OVERRIDES`) : OSRM
 * est une frontière sortante, et ce n'est pas lui que la suite éprouve.
 */
import type { DeliveryRoundProposalView, DevSeedReport } from "@lfd/contracts";

import { planLoading, type PlanStop } from "../src/delivery/domain/services/loading-plan.js";
import { CargoFloor } from "../src/delivery/domain/value-objects/cargo-floor.js";
import { FLEET } from "../src/dev/seeding/delivery-fleet.seed.js";
import { TOMORROW_ROUNDS_CLIENTS } from "../src/dev/seeding/tomorrow-rounds-clients.seed.js";
import { estimatedMannes } from "../src/dev/seeding/tomorrow-rounds-houses.js";
import { seedDriverRole } from "./delivery-driver-scene.js";
import { ADMIN_VERIFIER_OVERRIDE, admin } from "./delivery-rounds-scene.js";
import { PROPOSAL, ROAD_ROUTING_OVERRIDES } from "./delivery-routing-scene.js";
import { PAYMENT_GATEWAY_OVERRIDE } from "./dev-scenario-scene.js";
import { bootstrapE2e, type E2eContext, jsonBody } from "./e2e-harness.js";

const RELOAD = "/admin/dev/seed/reload";
/** Un rechargement complet sème des dizaines de commandes : cf. `dev-seed-driver.e2e-spec.ts`. */
const TIMEOUT_MS = 240_000;
/** La manne semée : pilée par deux au plus (Hugo, 2026-10-06). */
const MANNE = { lengthMm: 665, widthMm: 460, heightMm: 715, maxStack: 2 } as const;
const DAY_MS = 24 * 60 * 60 * 1000;

let ctx: E2eContext;
let tomorrow: string;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [ADMIN_VERIFIER_OVERRIDE, PAYMENT_GATEWAY_OVERRIDE, ...ROAD_ROUTING_OVERRIDES],
  });
  await ctx.reset();
  await seedDriverRole(ctx);
  const report = jsonBody<DevSeedReport>(await admin(ctx).post(RELOAD).expect(200));
  await ctx.drain();
  // Le lendemain de la journée du semis, lue dans son rapport : aucune date écrite ici.
  tomorrow = new Date(Date.parse(`${report.orders.today}T00:00:00.000Z`) + DAY_MS)
    .toISOString()
    .slice(0, 10);
}, TIMEOUT_MS);

afterAll(async () => {
  await ctx.close();
});

async function propose(query: string): Promise<DeliveryRoundProposalView> {
  return jsonBody<DeliveryRoundProposalView>(
    await admin(ctx).get(`${PROPOSAL}?jour=${tomorrow}&${query}`).expect(200),
  );
}

/** Combien de mannes une camionnette de la flotte semée porte, piles comprises — le plan de chargement le dit. */
function mannesOnFloor(vehicleName: string): number {
  const vehicle = FLEET.find((candidate) => candidate.name === vehicleName);
  if (vehicle?.cargo === undefined || vehicle.cargo === null) {
    throw new Error(`« ${vehicleName} » n'est pas une camionnette mesurée de la flotte semée.`);
  }
  const floor = CargoFloor.of({ ...vehicle.cargo, wheelArches: vehicle.wheelArches ?? null });
  const binType = {
    ...{ id: "manne", name: "Manne", isotherm: false, maxStack: MANNE.maxStack },
    ...{ outerLengthMm: MANNE.lengthMm, outerWidthMm: MANNE.widthMm },
    outerHeightMm: MANNE.heightMm,
  };
  let fits = 0;
  for (let count = 1; count <= 30; count += 1) {
    const stops: PlanStop[] = Array.from({ length: count }, (_, index) => ({
      ...{ position: index, orderId: `o${String(index)}`, reference: `r${String(index)}` },
      customerLabel: "",
      bins: [
        {
          ...{ id: `b${String(index)}`, code: `c${String(index)}`, binType, half: null },
          ...{ physicalBinId: null, partner: null, toRedo: false },
        },
      ],
    }));
    const plan = planLoading(stops, {
      ...{ name: vehicleName, cargoLiters: floor.volumeLiters, refrigeratedLiters: null, floor },
    });
    if (plan.warnings.some((warning) => warning.kind === "floor_over")) break;
    fits = count;
  }
  return fits;
}

describe("les tournées de demain du semis", () => {
  it(
    "« Proposer » compose trois tournées, une par camionnette, sans rien laisser à répartir",
    async () => {
      const view = await propose("mode=new_rounds");

      expect(view.unlocated).toEqual([]);
      expect(view.overflow).toEqual([]);
      expect(view.unfit).toEqual([]);
      expect(view.unknownDemand).toEqual([]);
      expect(view.rounds).toHaveLength(3);
      expect(new Set(view.rounds.map((round) => round.vehicleId)).size).toBe(3);
      const stops = view.rounds.flatMap((round) => round.stops);
      // Les maisons des tournées de demain, et la livraison du Lac Blanc déjà posée.
      expect(stops).toHaveLength(TOMORROW_ROUNDS_CLIENTS.length + 1);
      expect(stops.filter((stop) => stop.windowMissed)).toEqual([]);
    },
    TIMEOUT_MS,
  );

  it(
    "chaque tournée tient au sol de sa camionnette, en mannes",
    async () => {
      const view = await propose("mode=new_rounds");
      const orders = await ctx.prisma.order.findMany({
        where: { requestedDeliveryDate: new Date(`${tomorrow}T00:00:00.000Z`) },
        select: { id: true, company: { select: { enseigne: true } } },
      });
      // Les maisons à mannes comptent leurs ficelles ; les autres, le défaut.
      const estimated = new Map(
        orders.map((order) => [order.id, estimatedMannes(order.company?.enseigne ?? "")]),
      );
      const defaulted = new Map(view.defaultDemand.map((order) => [order.orderId, order.count]));
      for (const round of view.rounds) {
        const mannes = round.stops.reduce(
          (sum, stop) => sum + (estimated.get(stop.orderId) ?? defaulted.get(stop.orderId) ?? 0),
          0,
        );
        expect({
          round: round.vehicleName,
          mannes: mannes <= mannesOnFloor(round.vehicleName),
        }).toEqual({ round: round.vehicleName, mannes: true });
      }
    },
    TIMEOUT_MS,
  );

  /**
   * Régression (2026-10-06) : le plan de chargement ignorait la hauteur de la
   * caisse et comptait dix-huit mannes à chaque camionnette. Deux mannes font
   * 1430 mm : seule la caisse de 145 cm les empile.
   */
  it("chaque camionnette porte ses mannes plafond compris : 18, 9 et 9", () => {
    expect(FLEET.slice(0, 3).map((vehicle) => mannesOnFloor(vehicle.name))).toEqual([18, 9, 9]);
  });

  it(
    "avec deux camionnettes seulement, la place manque",
    async () => {
      const two = await ctx.prisma.deliveryVehicle.findMany({
        where: { plate: { in: FLEET.slice(0, 2).map((vehicle) => vehicle.plate) } },
        select: { id: true },
      });
      expect(two).toHaveLength(2);
      const view = await propose(`mode=new_rounds&vehicules=${two.map((v) => v.id).join(",")}`);

      expect(view.rounds.length).toBeLessThanOrEqual(2);
      expect(view.unfit.length + view.overflow.length).toBeGreaterThan(0);
    },
    TIMEOUT_MS,
  );
});
