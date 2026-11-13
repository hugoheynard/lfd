/**
 * E2E de l'**écran Tournées servi par l'objet des journées**
 * (`le-cache-du-back-office.md`, § 3.5), clé `rounds` — sans objet ici
 * (`NoDayContentsCache`, aucune URL d'objet en e2e) : ce qui se prouve est le
 * câblage réel, numéros `delivery` et `orders` lus en base avant les tables,
 * livreurs, flotte, place et rapportées posés à chaque appel.
 *
 * - une affectation, puis une relecture immédiate, rend l'arrêt posé ;
 * - deux lectures successives rendent les mêmes octets.
 */
import { bootstrapE2e, serviceDay, type E2eContext } from "./e2e-harness.js";
import {
  addVehicle,
  ADMIN_VERIFIER_OVERRIDE,
  admin,
  assign,
  dayView,
  forgetCustomer,
  openRound,
  ROUNDS,
  seedDelivery,
} from "./delivery-rounds-scene.js";

const DAY = serviceDay();

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  forgetCustomer();
});

describe("les tournées servies par l'objet des journées", () => {
  it("rend une affectation relue aussitôt : l'arrêt posé, sorti de « à répartir »", async () => {
    const round = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));
    const first = await seedDelivery(ctx, DAY);
    const second = await seedDelivery(ctx, DAY);
    expect((await dayView(ctx, DAY)).unassigned.map((order) => order.orderId).sort()).toEqual(
      [first.id, second.id].sort(),
    );

    await assign(ctx, DAY, round, first.id);

    const view = await dayView(ctx, DAY);
    expect(view.rounds[0]?.stops.map((stop) => stop.orderId)).toEqual([first.id]);
    expect(view.unassigned.map((order) => order.orderId)).toEqual([second.id]);
  });

  it("rend les mêmes octets à deux lectures successives", async () => {
    const round = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));
    await assign(ctx, DAY, round, (await seedDelivery(ctx, DAY)).id);

    const read = async (): Promise<string> =>
      (await admin(ctx).get(`${ROUNDS}?day=${DAY}`).expect(200)).text;

    expect(await read()).toBe(await read());
  });
});
