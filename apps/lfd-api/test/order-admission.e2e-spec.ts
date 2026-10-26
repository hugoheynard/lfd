/**
 * E2E de **« puis-je commander ? »** — la boutique et les exemptions à la
 * fermeture (décision de Hugo du 2026-10-26, option A ; doc
 * `documentation/commandes/passation/ouverture-de-la-boutique.md`).
 *
 * Ce que seul le vrai chemin prouve : que la société lue est celle que le
 * guard résout depuis les RATTACHEMENTS (aucun paramètre à deviner), que la
 * réponse ne dit rien de l'exemption d'un autre, et que l'invité ne reçoit
 * qu'un booléen pour l'adresse qu'il a tapée.
 */
import type { GuestOrderAdmissionView, MyOrderAdmissionView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const PERSO = "auth0|perso-admission";
const PRO = "auth0|pro-admission";
const OTHER_PRO = "auth0|autre-pro-admission";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let ctx: E2eContext;
let companyId = "";

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
  await createUser(ctx.prisma, { auth0Sub: PERSO });
  const buyer = await createUser(ctx.prisma, { auth0Sub: PRO });
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await attachTo(ctx.prisma, buyer.id, company.id, CustomerRole.owner);
  companyId = company.id;
  const other = await createUser(ctx.prisma, { auth0Sub: OTHER_PRO });
  const otherCompany = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await attachTo(ctx.prisma, other.id, otherCompany.id, CustomerRole.owner);
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

async function setOpening(patch: Record<string, boolean>): Promise<void> {
  await staff().patch("/admin/order-opening").send(patch).expect(204);
}

async function exempt(body: Record<string, unknown>): Promise<void> {
  await staff().post("/admin/order-opening/exemptions").send(body).expect(201);
}

async function mine(sub: string): Promise<MyOrderAdmissionView> {
  return jsonBody<MyOrderAdmissionView>(
    await ctx.asSub(sub).get("/order-admission/mine").expect(200),
  );
}

async function guest(email: string): Promise<GuestOrderAdmissionView> {
  const response = await ctx.http().post("/order-admission/guest").send({ email }).expect(200);
  return jsonBody<GuestOrderAdmissionView>(response);
}

describe("GET /order-admission/mine", () => {
  it("ouverte : ouvert et commandable", async () => {
    expect(await mine(PRO)).toEqual({ ordersOpen: true, canOrder: true });
  });

  it("fermée aux pros : la société exemptée peut commander, l'autre non, sans rien apprendre", async () => {
    await setOpening({ ordersOpenToB2b: false });
    expect(await mine(PRO)).toEqual({ ordersOpen: false, canOrder: false });

    await exempt({ kind: "company", companyId });

    expect(await mine(PRO)).toEqual({ ordersOpen: false, canOrder: true });
    expect(await mine(OTHER_PRO)).toEqual({ ordersOpen: false, canOrder: false });
  });

  it("fermée aux particuliers : la personne connectée passe par son adresse", async () => {
    await setOpening({ ordersOpenToB2c: false });
    expect(await mine(PERSO)).toEqual({ ordersOpen: false, canOrder: false });

    await exempt({ kind: "email", email: `${PERSO}@test.fr` });

    expect(await mine(PERSO)).toEqual({ ordersOpen: false, canOrder: true });
  });

  it("refuse sans jeton", async () => {
    await ctx.http().get("/order-admission/mine").expect(401);
  });
});

describe("POST /order-admission/guest", () => {
  it("rend un booléen pour CETTE adresse, et rien d'autre", async () => {
    expect(await guest("camille@visiteur.fr")).toEqual({ canOrder: true });

    await setOpening({ ordersOpenToB2c: false });
    expect(await guest("camille@visiteur.fr")).toEqual({ canOrder: false });

    await exempt({ kind: "email", email: "Camille@Visiteur.fr" });
    await exempt({ kind: "company", companyId });

    expect(await guest("camille@visiteur.fr")).toEqual({ canOrder: true });
    expect(await guest("autre@visiteur.fr")).toEqual({ canOrder: false });
  });

  it("refuse une adresse mal formée", async () => {
    await ctx.http().post("/order-admission/guest").send({ email: "pas-une-adresse" }).expect(400);
  });
});
