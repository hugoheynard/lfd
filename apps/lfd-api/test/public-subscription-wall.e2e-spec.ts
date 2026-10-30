/**
 * E2E : **le mur du rayon public sur les abonnements de particulier**
 * (`documentation/catalogue/plan-articles-sur-mesure.md`, § 12).
 *
 * Régression du 2026-10-30 : un abonnement en perso (`companyId` null) ne
 * passait aucun mur, et un particulier s'abonnait à un article masqué au
 * public, sur mesure ou réservé à un pro. Ce que seul le vrai SQL prouve :
 * le lecteur `public` du catalogue (`servedTo`) appliqué à la création et à
 * la dérogation d'une échéance, avec les gestes réels du back-office.
 *
 * Doublée : la signature des jetons (le jeton EST le `sub`).
 */
import type { CreatedSubscription } from "../src/b2b/subscriptions/domain/ports/subscription.repository.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const stubAdminVerifier = {
  verify: (sub: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: sub, scopes: [] }),
};

/** L'article que les gestes du back-office retirent au public. */
const X = "PAI-001-1";
/** Un article servi au public. */
const OPEN = "VIE-001-1";

const PERSON = "auth0|public-wall-person";
const PRO = "auth0|public-wall-pro";
const REFUSED = "catalog.article_not_served_to_public";

let ctx: E2eContext;
let company = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await createUser(ctx.prisma, { auth0Sub: PERSON });
  company = (await createCompany(ctx.prisma, { enseigne: "Maison Pro" })).id;
  const pro = await createUser(ctx.prisma, { auth0Sub: PRO });
  await attachTo(ctx.prisma, pro.id, company, CustomerRole.owner);
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

function weekly(sku: string): Record<string, unknown> {
  return {
    fromOrderId: null,
    recurrence: "weekly",
    startDate: serviceDay(1),
    endDate: serviceDay(60),
    fulfillmentMethod: "pickup",
    deliveryAddress: null,
    pickupAddressId: null,
    lines: [{ sku, quantity: 2 }],
    note: "",
  };
}

const subscribe = (sku: string) => ctx.asSub(PERSON).post("/subscriptions").send(weekly(sku));

const GESTURES: readonly [string, () => Promise<unknown>][] = [
  [
    "masqué au public",
    () =>
      staff()
        .put(`/admin/catalog/${X}/masking`)
        .send({ audience: "public", hidden: true })
        .expect(204),
  ],
  [
    "sur mesure",
    () => staff().put(`/admin/catalog/${X}/made-to-order`).send({ madeToOrder: true }).expect(204),
  ],
  [
    "réservé à un pro",
    () => staff().put(`/admin/catalog/${X}/reservations/${company}`).expect(204),
  ],
];

describe("abonnement de particulier", () => {
  it("accepte un article servi au public", async () => {
    await subscribe(OPEN).expect(201);
  });

  it.each(GESTURES)("refuse un article %s, par son nom, et n'écrit rien", async (_, gesture) => {
    await gesture();

    const refused = await subscribe(X).expect(409);
    expect(jsonBody<{ code: string; message: string }>(refused)).toMatchObject({ code: REFUSED });
    expect(jsonBody<{ message: string }>(refused).message).toContain(X);
    expect(await ctx.prisma.subscription.count()).toBe(0);
  });

  it("refuse une dérogation d'échéance qui ajoute un article non servi au public", async () => {
    const id = jsonBody<CreatedSubscription>(await subscribe(OPEN).expect(201)).id;
    await staff().put(`/admin/catalog/${X}/made-to-order`).send({ madeToOrder: true }).expect(204);

    const refused = await ctx
      .asSub(PERSON)
      .put(`/subscriptions/${id}/occurrences/${serviceDay(8)}`)
      .send({ skipped: false, lines: [{ sku: X, quantity: 1 }], note: "" })
      .expect(409);
    expect(jsonBody<{ code: string }>(refused).code).toBe(REFUSED);
  });
});

/** Décision de Hugo (2026-10-30) : un abonnement pro passe le mur complet du rayon pro. */
describe("abonnement pro", () => {
  const subscribePro = (sku: string) => ctx.asSub(PRO).post("/subscriptions").send(weekly(sku));
  const NOT_SERVED = "catalog.article_not_served_to_company";

  it("accepte un article servi aux pros, sur mesure compris", async () => {
    await subscribePro(OPEN).expect(201);
    await staff().put(`/admin/catalog/${X}/made-to-order`).send({ madeToOrder: true }).expect(204);
    await subscribePro(X).expect(201);
  });

  it("refuse un article masqué au rayon pro, par son nom", async () => {
    await staff()
      .put(`/admin/catalog/${X}/masking`)
      .send({ audience: "pro", hidden: true })
      .expect(204);

    const refused = await subscribePro(X).expect(409);
    expect(jsonBody<{ code: string; message: string }>(refused)).toMatchObject({
      code: NOT_SERVED,
    });
    expect(jsonBody<{ message: string }>(refused).message).toContain(X);
  });

  it("refuse une référence inconnue", async () => {
    const refused = await subscribePro("ZZZ-999-1").expect(409);
    expect(jsonBody<{ code: string }>(refused).code).toBe(NOT_SERVED);
    expect(await ctx.prisma.subscription.count()).toBe(0);
  });
});
