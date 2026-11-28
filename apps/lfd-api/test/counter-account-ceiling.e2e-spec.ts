/**
 * E2E du **plafond des comptes ouverts au comptoir** (plan
 * `documentation/comptes-client/plan-comptes-du-comptoir.md`, § 3.3).
 *
 * Ce que seul le vrai serveur prouve : le réglage lu en base, l'encours
 * sommé par la vraie requête, et le refus porté à la passation comme à
 * l'estimation — rien quand le plafond est absent.
 *
 * Le plafond est posé par Prisma : sa route a sa propre suite
 * (`counter-accounts-page.e2e-spec.ts`). L'acheteur
 * est celui de la vraie ouverture (§ 3.1).
 */
import { instantToLocal, type AdminOrderEstimateView } from "@lfd/contracts";

import { jsonBody } from "./e2e-harness.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import {
  clock,
  closesAt,
  ctx,
  DAY_MS,
  setUpEntity,
  staff,
  useCollectionReturnScene,
} from "./collection-returns-scene.js";
import { pickupSite } from "./order-factory.js";

const OPEN_PAYLOAD = {
  enseigne: "Kiosque du Quai",
  contact: {
    firstName: "Camille",
    lastName: "Rousseau",
    email: "camille@kiosque.test",
    phone: "06 12 34 56 78",
  },
  identitySeen: true,
};

useCollectionReturnScene();

async function openedCounterAccount(): Promise<{ id: string; buyer: string }> {
  const { id } = jsonBody<{ id: string }>(
    await staff()
      .post("/admin/counter/accounts")
      .set(INTENT_KEY, freshIntent())
      .send(OPEN_PAYLOAD)
      .expect(201),
  );
  // L'acheteur est celui de la vraie ouverture : une fiche invité, sans rattachement.
  const opening = await ctx.prisma.counterOpeningAttestation.findUniqueOrThrow({
    where: { companyId: id },
  });
  return { id, buyer: opening.buyerUserId ?? "" };
}

async function setCeiling(ceilingCents: number | null): Promise<void> {
  await ctx.prisma.counterAccountSettings.upsert({
    where: { key: "orders" },
    create: { key: "orders", ceilingCents },
    update: { ceilingCents },
  });
}

/** La saisie du comptoir, au compte, servie trois jours après la clôture. */
async function counterOrderBody(account: { readonly id: string; readonly buyer: string }) {
  return {
    companyId: account.id,
    buyerUserId: account.buyer,
    settlement: "account",
    entryOrigin: "counter",
    requestedDeliveryDate: instantToLocal(new Date(closesAt.getTime() + 3 * DAY_MS)).day,
    fulfillmentMethod: "pickup",
    pickupAddressId: await pickupSite(ctx.prisma),
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
    lines: [{ sku: "VIE-001-1", quantity: 50 }],
  };
}

/** Rejoue la route sous l'horloge de la veille du service. */
async function atOrderTime<T>(run: () => Promise<T>): Promise<T> {
  const now = clock.now();
  clock.set(new Date(closesAt.getTime()));
  try {
    return await run();
  } finally {
    clock.set(now);
  }
}

describe("le plafond d'un compte ouvert au comptoir", () => {
  it("sans plafond, la commande au compte passe", async () => {
    await setUpEntity(staff);
    await setCeiling(null);
    const account = await openedCounterAccount();
    const body = await counterOrderBody(account);

    await atOrderTime(() =>
      staff().post("/admin/orders").set(INTENT_KEY, freshIntent()).send(body).expect(201),
    );
  });

  it("un plafond dépassé par l'encours plus la commande refuse, et l'estimation le dit", async () => {
    await setUpEntity(staff);
    const account = await openedCounterAccount();
    const body = await counterOrderBody(account);
    await setCeiling(null);
    await atOrderTime(() =>
      staff().post("/admin/orders").set(INTENT_KEY, freshIntent()).send(body).expect(201),
    );
    const first = await ctx.prisma.order.findFirstOrThrow({
      where: { companyId: account.id },
      select: { totalCents: true },
    });
    // Le premier bon tient sous le plafond, le second le dépasse d'un centime.
    await setCeiling(2 * first.totalCents - 1);

    const estimate = await atOrderTime(() =>
      staff().post("/admin/orders/estimate").send(body).expect(200),
    );
    const refused = await atOrderTime(() =>
      staff().post("/admin/orders").set(INTENT_KEY, freshIntent()).send(body).expect(409),
    );

    expect(jsonBody<AdminOrderEstimateView>(estimate).warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "orders.counter.ceiling_exceeded" }),
      ]),
    );
    expect(JSON.stringify(refused.body)).toContain("Convertissez le compte");
    expect(await ctx.prisma.order.count({ where: { companyId: account.id } })).toBe(1);
  });
});
