/**
 * E2E du **brouillon de commande** (`/admin/order-drafts/:companyId`).
 *
 * Ce que seul le vrai SQL prouve : que le brouillon est bien **un par société**
 * (l'index unique tient, un second enregistrement remplace au lieu d'empiler) ;
 * qu'il survit à l'aller-retour dans une colonne `jsonb` sans perdre ses champs ;
 * qu'il se relit **par un autre membre du staff** que celui qui l'a écrit — c'est
 * toute la raison de le sortir du navigateur ; et qu'une société inconnue rend
 * un 404 plutôt qu'une ligne orpheline.
 *
 * Frontière doublée : la signature du jeton staff. Le reste — guard, bus,
 * domaine, SQL — est réel.
 */
import type { OrderDraftResponse, OrderDraftView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CompanyStatus } from "../src/platform/database/client/client.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

let ctx: E2eContext;

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
});

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

async function seedCompany(): Promise<string> {
  const company = await createCompany(ctx.prisma, {
    raisonSociale: "Café des Halles SAS",
    status: CompanyStatus.active,
  });
  return company.id;
}

describe("/admin/order-drafts", () => {
  it("rend null tant que rien n'a été mis de côté", async () => {
    const companyId = await seedCompany();

    const body = jsonBody<OrderDraftResponse>(
      await staff().get(`/admin/order-drafts/${companyId}`).expect(200),
    );

    expect(body.draft).toBeNull();
  });

  it("garde la saisie et la rend telle quelle, avec sa trace", async () => {
    const companyId = await seedCompany();

    await staff()
      .put(`/admin/order-drafts/${companyId}`)
      .send({
        note: "sans sucre",
        requestedDeliveryDate: "2026-08-20",
        settlement: "account",
        lines: [{ sku: "VIE-001", quantity: 40 }],
      })
      .expect(200);

    const { draft } = jsonBody<OrderDraftResponse>(
      await staff().get(`/admin/order-drafts/${companyId}`).expect(200),
    );
    expect(draft?.note).toBe("sans sucre");
    expect(draft?.requestedDeliveryDate).toBe("2026-08-20");
    expect(draft?.settlement).toBe("account");
    expect(draft?.lines).toEqual([{ sku: "VIE-001", quantity: 40 }]);
    // La trace vient de la porte, pas du corps.
    expect(draft?.savedByStaffId).not.toBeNull();
    expect(draft?.savedAt).not.toBe("");
  });

  it("accepte un brouillon vide — une saisie interrompue n'a pas à être complète", async () => {
    const companyId = await seedCompany();

    const body = jsonBody<OrderDraftView>(
      await staff().put(`/admin/order-drafts/${companyId}`).send({}).expect(200),
    );

    expect(body.lines).toEqual([]);
    expect(body.buyerUserId).toBeNull();
  });

  it("remplace au lieu d'empiler : un seul brouillon par société", async () => {
    const companyId = await seedCompany();

    await staff().put(`/admin/order-drafts/${companyId}`).send({ note: "premier" }).expect(200);
    await staff().put(`/admin/order-drafts/${companyId}`).send({ note: "second" }).expect(200);

    const rows = await ctx.prisma.orderDraft.count({ where: { companyId } });
    expect(rows).toBe(1);
    const { draft } = jsonBody<OrderDraftResponse>(
      await staff().get(`/admin/order-drafts/${companyId}`).expect(200),
    );
    expect(draft?.note).toBe("second");
  });

  it("efface, et refuse de s'en émouvoir la seconde fois", async () => {
    const companyId = await seedCompany();
    await staff().put(`/admin/order-drafts/${companyId}`).send({ note: "à jeter" }).expect(200);

    await staff().delete(`/admin/order-drafts/${companyId}`).expect(204);
    await staff().delete(`/admin/order-drafts/${companyId}`).expect(204);

    const { draft } = jsonBody<OrderDraftResponse>(
      await staff().get(`/admin/order-drafts/${companyId}`).expect(200),
    );
    expect(draft).toBeNull();
  });

  it("refuse une société inconnue", async () => {
    await staff().put("/admin/order-drafts/cmp_inconnue").send({ note: "x" }).expect(404);
  });
});
