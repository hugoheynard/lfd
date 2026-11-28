/**
 * E2E de **la page « Comptes du comptoir »**, de la conversion, du plafond
 * réglé à l'écran et de l'acheteur d'ouverture (plan
 * `documentation/comptes-client/plan-comptes-du-comptoir.md`, § 3.1, § 3.3, § 4).
 *
 * Ce que seul le vrai serveur prouve : la vraie ouverture rend un acheteur
 * que la passation de l'équipe admet SANS rattachement ; la page somme le dû
 * par la vraie requête ; la conversion passe par l'agrégat (et l'activation
 * par son cas d'usage) ; une connexion qui reprend la fiche invité n'ouvre
 * rien de la société.
 *
 * La fiche est complétée par Prisma (SIRET, TVA, adresse) : l'édition de la
 * fiche n'est pas le sujet.
 */
import {
  instantToLocal,
  type AdminPlacedOrderResponse,
  type CounterAccountCeilingView,
  type CounterAccountConversionView,
  type CounterCustomerView,
  type CounterOpenedAccountsView,
} from "@lfd/contracts";

import { jsonBody } from "./e2e-harness.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import { MonthlyInvoicingReader } from "../src/lafoliecoffee/accounting/domain/ports/monthly-invoicing.reader.js";
import { PrincipalResolver } from "../src/platform/auth/principal.resolver.js";
import {
  clock,
  closesAt,
  ctx,
  DAY_MS,
  setUpEntity,
  staff,
  useCollectionReturnScene,
} from "./collection-returns-scene.js";
import { addBillingAddress, createCompany, handOver } from "./factories.js";
import { pickupSite } from "./order-factory.js";

const OPEN_ROUTE = "/admin/counter/accounts";
const PAGE = "/admin/counter-opened-accounts";
const CEILING = "/admin/counter-account-ceiling";
const CONTACT_EMAIL = "camille@kiosque.test";

useCollectionReturnScene();

/** La vraie ouverture, et l'acheteur que le comptoir propose ensuite. */
async function openedCounterAccount(
  enseigne = "Kiosque du Quai",
): Promise<{ id: string; buyer: string }> {
  const { id } = jsonBody<{ id: string }>(
    await staff()
      .post(OPEN_ROUTE)
      .set(INTENT_KEY, freshIntent())
      .send({
        enseigne,
        contact: {
          firstName: "Camille",
          lastName: "Rousseau",
          email: CONTACT_EMAIL,
          phone: "06 12 34 56 78",
        },
        identitySeen: true,
      })
      .expect(201),
  );
  const view = jsonBody<CounterCustomerView>(
    await staff().get(`/admin/counter/customers/${id}`).expect(200),
  );
  expect(view.buyers).toHaveLength(1);
  return { id, buyer: view.buyers[0]?.userId ?? "" };
}

/** La saisie du comptoir, au compte, servie à `servedAt`, passée trois jours avant. */
async function placeAtCounter(
  account: { readonly id: string; readonly buyer: string },
  servedAt: Date,
  status: number,
): Promise<string | null> {
  const now = clock.now();
  clock.set(new Date(servedAt.getTime() - 3 * DAY_MS));
  try {
    const response = await staff()
      .post("/admin/orders")
      .set(INTENT_KEY, freshIntent())
      .send({
        companyId: account.id,
        buyerUserId: account.buyer,
        settlement: "account",
        entryOrigin: "counter",
        requestedDeliveryDate: instantToLocal(servedAt).day,
        fulfillmentMethod: "pickup",
        pickupAddressId: await pickupSite(ctx.prisma),
        requestedWindow: { start: "07:00", end: "08:00" },
        note: "",
        lines: [{ sku: "VIE-001-1", quantity: 50 }],
      })
      .expect(status);
    return status === 201 ? jsonBody<AdminPlacedOrderResponse>(response).id : null;
  } finally {
    clock.set(now);
  }
}

/** Complète la fiche : identité légale, et l'adresse de facturation si demandée. */
async function completeFiche(
  companyId: string,
  fiche: { readonly vat: boolean; readonly billing: boolean },
): Promise<void> {
  await ctx.prisma.company.update({
    where: { id: companyId },
    data: {
      raisonSociale: "Kiosque du Quai SAS",
      formeJuridique: "SAS",
      siret: "81245678800023",
      siren: "812456788",
      vatNumber: fiche.vat ? "FR63812456788" : "",
    },
  });
  if (fiche.billing) {
    await addBillingAddress(ctx.prisma, companyId);
  }
}

function page(): Promise<CounterOpenedAccountsView> {
  return staff()
    .get(PAGE)
    .expect(200)
    .then((response) => jsonBody<CounterOpenedAccountsView>(response));
}

describe("l'acheteur d'un compte ouvert au comptoir (§ 3.1)", () => {
  it("est une fiche invité sans rattachement, que la passation de l'équipe admet", async () => {
    await setUpEntity(staff);
    const account = await openedCounterAccount();

    const buyer = await ctx.prisma.user.findUniqueOrThrow({ where: { id: account.buyer } });
    expect(buyer).toMatchObject({ auth0Sub: null, email: CONTACT_EMAIL, emailVerified: false });
    expect(await ctx.prisma.membership.count({ where: { userId: account.buyer } })).toBe(0);

    const orderId = await placeAtCounter(account, new Date(closesAt.getTime() + 3 * DAY_MS), 201);
    expect(orderId).not.toBeNull();
  });

  it("n'est l'acheteur que de SON compte : une autre société le refuse", async () => {
    await setUpEntity(staff);
    const account = await openedCounterAccount();
    const other = await openedCounterAccount("Autre kiosque");
    // La même adresse : la même fiche invité, nommée par les deux traces.
    expect(other.buyer).toBe(account.buyer);
    const stranger = await createCompany(ctx.prisma, { enseigne: "Café voisin" });

    await placeAtCounter(
      { id: stranger.id, buyer: account.buyer },
      new Date(closesAt.getTime() + 3 * DAY_MS),
      404,
    );
  });

  it("une connexion qui reprend la fiche n'ouvre AUCUN accès au compte", async () => {
    await setUpEntity(staff);
    const account = await openedCounterAccount();
    const orderId = await placeAtCounter(account, new Date(closesAt.getTime() + 3 * DAY_MS), 201);
    const subject = "email|counter-buyer";

    await ctx.app
      .get(PrincipalResolver)
      .resolve({ subject, scopes: [], email: CONTACT_EMAIL, emailVerified: true });

    const claimed = await ctx.prisma.user.findUniqueOrThrow({ where: { id: account.buyer } });
    expect(claimed.auth0Sub).toBe(subject);
    expect(await ctx.prisma.membership.count({ where: { userId: account.buyer } })).toBe(0);
    await ctx
      .asSub(subject)
      .get(`/orders/${orderId ?? ""}`)
      .expect(404);
    const mine = await ctx.asSub(subject).get("/orders/mine").expect(200);
    expect(jsonBody<readonly { id: string }[]>(mine).map((order) => order.id)).not.toContain(
      orderId,
    );
  });
});

describe("la page « Comptes du comptoir » — GET /admin/counter-opened-accounts", () => {
  it("liste les comptes du comptoir, leur dû, ce qui manque, et le total", async () => {
    await setUpEntity(staff);
    const account = await openedCounterAccount();
    const orderId = await placeAtCounter(account, new Date(closesAt.getTime() + 3 * DAY_MS), 201);
    const order = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: orderId ?? "" },
      select: { totalCents: true },
    });
    const archived = await openedCounterAccount("Kiosque supprimé");
    // Supprimé par le vrai geste : il n'a jamais commandé.
    await staff()
      .post(`/admin/companies/${archived.id}/archive`)
      .send({ reason: "Ouvert par erreur" })
      .expect(204);
    await createCompany(ctx.prisma, { enseigne: "Café actif" });

    const view = await page();

    expect(view.accounts.map((row) => row.companyId)).toEqual([account.id]);
    expect(view.accounts[0]).toMatchObject({
      enseigne: "Kiosque du Quai",
      contact: { firstName: "Camille", lastName: "Rousseau", email: CONTACT_EMAIL },
      onAccountOrders: 1,
      outstandingCents: order.totalCents,
      identityCheck: { seen: true },
      convertsToActive: false,
    });
    expect(view.accounts[0]?.missing).toEqual(
      expect.arrayContaining(["identite_legale", "facturation"]),
    );
    expect(view.totalOutstandingCents).toBe(order.totalCents);
  });
});

describe("convertir — POST /admin/counter-opened-accounts/:id/convert", () => {
  it("sans SIRET ni adresse : 409, le compte reste ouvert au comptoir", async () => {
    await setUpEntity(staff);
    const account = await openedCounterAccount();

    const refused = await staff().post(`${PAGE}/${account.id}/convert`).expect(409);

    expect(JSON.stringify(refused.body)).toContain("SIRET");
    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: account.id } });
    expect(company.status).toBe("counter_opened");
  });

  it("SIRET et adresse sans TVA : pending, et la facture du mois ne l'écarte plus", async () => {
    await setUpEntity(staff);
    const account = await openedCounterAccount();
    const servedAt = new Date(closesAt.getTime() - 2 * DAY_MS);
    const orderId = await placeAtCounter(account, servedAt, 201);
    const placed = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: orderId ?? "" },
      select: { id: true, orderNumber: true },
    });
    await handOver(ctx.prisma, { ...placed, createdAt: servedAt });
    const reader = ctx.app.get(MonthlyInvoicingReader);
    const window = [new Date(servedAt.getTime() - 7 * DAY_MS), closesAt] as const;
    const before = await reader.uninvoicedOrders(...window);
    await completeFiche(account.id, { vat: false, billing: true });

    const converted = await staff().post(`${PAGE}/${account.id}/convert`).expect(200);

    expect(jsonBody<CounterAccountConversionView>(converted)).toEqual({ status: "pending" });
    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: account.id } });
    expect(company.status).toBe("pending");
    expect(before.map((order) => order.orderId)).not.toContain(orderId);
    const after = await reader.uninvoicedOrders(...window);
    expect(after.map((order) => order.orderId)).toContain(orderId);
    // Le moyen reste le virement posé à l'ouverture.
    expect(
      await ctx.prisma.payerCollectionMeans.count({ where: { payerCompanyId: account.id } }),
    ).toBeGreaterThan(0);
    // Un second clic : le compte n'est plus ouvert au comptoir.
    await staff().post(`${PAGE}/${account.id}/convert`).expect(409);
    expect((await page()).accounts).toEqual([]);
  });

  it("fiche complète : le compte s'active directement", async () => {
    await setUpEntity(staff);
    const account = await openedCounterAccount();
    await completeFiche(account.id, { vat: true, billing: true });

    const converted = await staff().post(`${PAGE}/${account.id}/convert`).expect(200);

    expect(jsonBody<CounterAccountConversionView>(converted)).toEqual({ status: "active" });
    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: account.id } });
    expect(company.status).toBe("active");
    expect(company.activatedAt).not.toBeNull();
  });
});

describe("le plafond — GET/PUT /admin/counter-account-ceiling", () => {
  it("aucun par défaut ; posé par la route, il garde l'auteur et borne la passation", async () => {
    await setUpEntity(staff);
    const initial = jsonBody<CounterAccountCeilingView>(await staff().get(CEILING).expect(200));
    expect(initial).toEqual({
      ceilingCents: null,
      updatedAt: null,
      updatedByStaffId: null,
      updatedByName: null,
    });

    await staff().put(CEILING).send({ ceilingCents: -1 }).expect(400);
    await staff().put(CEILING).send({ ceilingCents: 100 }).expect(204);

    const set = jsonBody<CounterAccountCeilingView>(await staff().get(CEILING).expect(200));
    expect(set.ceilingCents).toBe(100);
    expect(set.updatedAt).not.toBeNull();
    expect(set.updatedByStaffId).not.toBeNull();
    const account = await openedCounterAccount();
    await placeAtCounter(account, new Date(closesAt.getTime() + 3 * DAY_MS), 409);

    await staff().put(CEILING).send({ ceilingCents: null }).expect(204);
    await placeAtCounter(account, new Date(closesAt.getTime() + 3 * DAY_MS), 201);
  });
});
