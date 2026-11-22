/**
 * E2E de « Supprimer le compte » (`POST /admin/companies/:id/archive` et
 * `/unarchive`) — un archivage, rien n'est effacé.
 *
 * Ce que seul le vrai SQL prouve :
 * - un compte sans commande se supprime : les quatre colonnes, la contrainte
 *   `CHECK`, le fait au journal, dans la même transaction, et la fiche le dit ;
 * - une commande, dans n'importe quel sens (passée par lui, par un site dont
 *   il est le principal, réglée par lui), le retient — un brouillon non ;
 * - un site ne se supprime pas ;
 * - rendre le compte remet les quatre colonnes à NULL.
 *
 * Seule frontière doublée : la signature du jeton staff.
 */
import type { AdminCompanyFicheView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CompanyStatus, OrderStatus } from "../src/platform/database/client/client.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  type E2eContext,
} from "./e2e-harness.js";
import { LATEST_DELIVERY_FULFILLMENT } from "./delivery-deadline-fixture.js";
import { createCompany, createUser } from "./factories.js";

const REASON = "Doublon de La Ferme du Col";

/** Le jeton porteur EST le `sub`. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

let ctx: E2eContext;
/** Un numéro de commande distinct par commande semée (format `ORD-NNNNNN`). */
let orderSequence = 900_000;

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
  return ctx.asSub(E2E_STAFF_SUB);
}

/** Une commande écrite à la main, hors agrégat : seule sa présence compte ici. */
async function seedOrder(input: {
  readonly companyId: string;
  readonly principalCompanyId?: string;
  readonly billedCompanyId?: string;
  readonly status?: OrderStatus;
}): Promise<void> {
  const buyer = await createUser(ctx.prisma, { auth0Sub: `auth0|acheteur-${input.companyId}` });
  await ctx.prisma.order.create({
    data: {
      vatMethod: "line_ht",
      orderNumber: `ORD-${(orderSequence += 1)}`,
      companyId: input.companyId,
      principalCompanyId: input.principalCompanyId ?? null,
      billedCompanyId: input.billedCompanyId ?? null,
      placedByUserId: buyer.id,
      status: input.status ?? OrderStatus.placed,
      subtotalCents: 1_000,
      totalCents: 1_000,
      paymentStatus: "not_required",
      fulfillment: LATEST_DELIVERY_FULFILLMENT,
    },
  });
}

async function fiche(companyId: string): Promise<AdminCompanyFicheView> {
  const response = await staff().get(`/admin/companies/${companyId}`).expect(200);
  return jsonBody<AdminCompanyFicheView>(response);
}

function archive(companyId: string, reason = REASON) {
  return staff().post(`/admin/companies/${companyId}/archive`).send({ reason });
}

describe("supprimer un compte", () => {
  it("supprime un compte sans commande : colonnes, fiche et journal", async () => {
    const company = await createCompany(ctx.prisma, { status: CompanyStatus.pending });
    expect((await fiche(company.id)).hasOrders).toBe(false);

    await archive(company.id).expect(204);

    const row = await ctx.prisma.company.findUniqueOrThrow({
      where: { id: company.id },
      select: { archivedAt: true, archivedByStaffId: true, archiveReason: true, status: true },
    });
    expect(row.archivedAt).not.toBeNull();
    expect(row).toMatchObject({
      archivedByStaffId: E2E_STAFF_ID,
      archiveReason: REASON,
      status: CompanyStatus.pending,
    });
    expect(await fiche(company.id)).toMatchObject({
      archivedByName: "Opérateur E2E",
      archiveReason: REASON,
    });
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "company.archived" },
      select: { subjectId: true, actorId: true, payload: true },
    });
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ subjectId: company.id, actorId: E2E_STAFF_ID });
    expect(facts[0]?.payload).toMatchObject({ reason: REASON });
  });

  it("un brouillon ne retient pas", async () => {
    const company = await createCompany(ctx.prisma);
    await seedOrder({ companyId: company.id, status: OrderStatus.draft });

    await archive(company.id).expect(204);
  });

  it("refuse un compte qui a une commande, et dit de le résilier", async () => {
    const company = await createCompany(ctx.prisma);
    await seedOrder({ companyId: company.id });
    expect((await fiche(company.id)).hasOrders).toBe(true);

    const response = await archive(company.id).expect(409);

    expect(JSON.stringify(response.body)).toContain("Résiliez-le");
    const row = await ctx.prisma.company.findUniqueOrThrow({
      where: { id: company.id },
      select: { archivedAt: true },
    });
    expect(row.archivedAt).toBeNull();
    expect(await ctx.prisma.activityEvent.count({ where: { type: "company.archived" } })).toBe(0);
  });

  it("retient le principal d'une commande passée par un de ses sites, et son payeur", async () => {
    const principal = await createCompany(ctx.prisma);
    const payer = await createCompany(ctx.prisma);
    const site = await createCompany(ctx.prisma);
    await seedOrder({
      companyId: site.id,
      principalCompanyId: principal.id,
      billedCompanyId: payer.id,
    });

    await archive(principal.id).expect(409);
    await archive(payer.id).expect(409);
  });

  it("refuse un site rattaché à un principal", async () => {
    const principal = await createCompany(ctx.prisma);
    const site = await createCompany(ctx.prisma);
    await ctx.prisma.company.update({
      where: { id: site.id },
      data: { parentCompanyId: principal.id },
    });

    await archive(site.id).expect(409);
  });

  it("refuse un motif vide (400)", async () => {
    const company = await createCompany(ctx.prisma);

    await archive(company.id, "   ").expect(400);
  });

  it("rend un compte supprimé : les colonnes reviennent à NULL, le journal le dit", async () => {
    const company = await createCompany(ctx.prisma);
    await archive(company.id).expect(204);

    await staff().post(`/admin/companies/${company.id}/unarchive`).expect(204);

    const row = await ctx.prisma.company.findUniqueOrThrow({
      where: { id: company.id },
      select: {
        archivedAt: true,
        archivedByStaffId: true,
        archivedByName: true,
        archiveReason: true,
      },
    });
    expect(row).toEqual({
      archivedAt: null,
      archivedByStaffId: null,
      archivedByName: null,
      archiveReason: null,
    });
    expect(await ctx.prisma.activityEvent.count({ where: { type: "company.unarchived" } })).toBe(1);
    await staff().post(`/admin/companies/${company.id}/unarchive`).expect(409);
  });
});
