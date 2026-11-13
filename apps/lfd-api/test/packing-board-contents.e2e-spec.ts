/**
 * E2E du **poste de colisage servi par l'objet des journées**
 * (`le-cache-du-back-office.md`, § 3.1), clé `packing` — sans objet ici
 * (`NoDayContentsCache`, aucune URL d'objet en e2e) : ce qui se prouve est le
 * câblage réel, numéros `production`, `orders` et `delivery` lus en base
 * avant les tables.
 *
 * - un geste de colisage, puis une relecture immédiate, rend le nouvel état ;
 * - le poste et la colonne de la Supervision lisent la même route, qui ne
 *   reçoit que la date : deux lectures successives rendent les mêmes octets.
 */
import type { ProductionPackingView } from "@lfd/contracts";

import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import {
  CROISSANT,
  MEMBER,
  SERVICE_DAY,
  STAFF,
  bootstrapProductionDay,
  closeOrder,
  closePlan,
  fillOrder,
  place,
  recordBatch,
  relayGate,
} from "./production-day-fixture.js";

/** Un ULID de forme valide, tiré « par l'écran ». */
const BATCH = "01K6A0000000000000000000C4";

let ctx: E2eContext;
let issued: string[];

beforeAll(async () => {
  ({ ctx, issued } = await bootstrapProductionDay());
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  relayGate.open = true;
  await ctx.reset();
  await createUser(ctx.prisma, { auth0Sub: MEMBER });
});

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await ctx.drain();
  }
}

async function boardBody(): Promise<string> {
  const response = await ctx.asSub(STAFF).get(`/admin/packing/${SERVICE_DAY}/board`).expect(200);
  return response.text;
}

async function board(): Promise<ProductionPackingView> {
  return jsonBody<ProductionPackingView>(
    await ctx.asSub(STAFF).get(`/admin/packing/${SERVICE_DAY}/board`).expect(200),
  );
}

/** Un retrait de 4 croissants, plan arrêté, 4 pièces sorties du four : rend sa commande. */
async function pickupDay(): Promise<string> {
  await place(ctx, issued, [{ sku: CROISSANT, quantity: 4 }]);
  await closePlan(ctx);
  await settle();
  expect(await recordBatch(ctx, BATCH, 4)).toBe(204);
  await settle();
  const [sheet] = (await board()).sheets;
  if (sheet === undefined) {
    throw new Error(`Le colisage du ${SERVICE_DAY} devait porter un retrait.`);
  }
  return sheet.orderId;
}

describe("le poste servi par l'objet des journées", () => {
  it("rend un contenant rempli puis une commande déclarée prête, relus aussitôt", async () => {
    const orderId = await pickupDay();
    expect(await board()).toMatchObject({ todoCount: 1, readyCount: 0 });

    await fillOrder(ctx, {
      staff: STAFF,
      day: SERVICE_DAY,
      orderId,
      container: { nature: "bag" },
    });
    expect((await board()).sheets[0]?.containerList).toHaveLength(1);

    expect(await closeOrder(ctx, orderId)).toBe(204);

    expect(await board()).toMatchObject({ todoCount: 0, readyCount: 1 });
  });

  it("rend les mêmes octets au poste et à la Supervision : la route ne lit que la date", async () => {
    await pickupDay();

    expect(await boardBody()).toBe(await boardBody());
  });
});
