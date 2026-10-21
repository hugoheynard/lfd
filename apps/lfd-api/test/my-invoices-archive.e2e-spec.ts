/**
 * E2E du **zip de « Mes factures »** (plan
 * `documentation/comptabilite/facturation/plan-page-mes-factures.md`, lot P2).
 *
 * Ce que seul le vrai SQL et le vrai seau prouvent : le zip relu porte
 * exactement les PDF rangés, octet pour octet, sous le numéro de la pièce,
 * en STORE ; le mur des rôles tient (autre rôle 403) ; un id d'une autre
 * société est refusé en le nommant, jamais un zip partiel.
 *
 * ⚠️ Mandat, bons et membres écrits par Prisma : la scène de
 * `collection-returns-scene.ts`, même dette. Aucune date absolue : le mois
 * est le PRÉCÉDENT du jour du test.
 */
import { Buffer } from "node:buffer";

import { unzipSync } from "fflate";
import type { Response } from "supertest";

import { invoicingMomentOf } from "../src/b2b/accounting/domain/services/invoicing-closures.js";
import { StatementMonth } from "../src/b2b/accounting/domain/value-objects/statement-month.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { invoicedPayer, setUpEntity } from "./collection-returns-scene.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};
const recordingMailer = {
  enabled: true,
  send: (): Promise<{ providerId: null }> => Promise.resolve({ providerId: null }),
};

const clock = new FixedClock(new Date());
let ctx: E2eContext;
let closesAt: Date;
let month: StatementMonth;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: MAILER, value: recordingMailer },
      { token: Clock, value: clock },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  month = StatementMonth.containing(new Date(daysAgo(0))).previous();
  closesAt = month.cycle().closesAt;
  clock.set(new Date(invoicingMomentOf(closesAt).getTime() + 2 * 60 * 1000));
  const startsAt = month.cycle().startsAt;
  await ctx.prisma.collectionFloor.create({ data: { id: true, floorAt: startsAt } });
  await ctx.prisma.invoicingFloor.create({ data: { id: true, floorAt: startsAt } });
});

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

async function member(companyId: string, sub: string, role: CustomerRole): Promise<string> {
  const user = await createUser(ctx.prisma, { auth0Sub: sub, email: `${sub}@port.test` });
  await attachTo(ctx.prisma, user.id, companyId, role);
  return sub;
}

/** La facture du mois du payeur de la scène, PDF rendu. */
async function issuedInvoice(): Promise<{
  companyId: string;
  invoiceId: string;
  number: string;
  issuedYear: number;
}> {
  const entityId = await setUpEntity(staff);
  const companyId = await invoicedPayer(ctx, staff, entityId, closesAt);
  await staff()
    .post("/admin/accounting/monthly-invoices")
    .send({ legalEntityId: entityId, periodClosesAt: closesAt.toISOString() })
    .expect(200);
  await ctx.drain();
  const invoice = await ctx.prisma.invoice.findFirstOrThrow({
    where: { payerCompanyId: companyId },
  });
  expect(invoice.documentKey).not.toBeNull();
  return {
    companyId,
    invoiceId: invoice.id,
    number: invoice.number,
    issuedYear: invoice.issuedOn.getUTCFullYear(),
  };
}

/** Le corps brut d'une réponse binaire. */
async function binary(sub: string, url: string, status: number): Promise<Response> {
  return ctx
    .asSub(sub)
    .get(url)
    .buffer()
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => callback(null, Buffer.concat(chunks)));
    })
    .expect(status);
}

function bytesOf(response: Response): Buffer {
  return Buffer.from(jsonBody<Uint8Array>(response));
}

/** La méthode de chaque entrée locale (`PK\x03\x04`, 2 octets LE à l'offset 8). */
function methodsOf(zip: Buffer): number[] {
  const methods: number[] = [];
  let at = zip.indexOf("PK\u0003\u0004", 0, "latin1");
  while (at >= 0) {
    methods.push(zip.readUInt16LE(at + 8));
    at = zip.indexOf("PK\u0003\u0004", at + 4, "latin1");
  }
  return methods;
}

describe("le zip de « Mes factures » (P2)", () => {
  it("porte les PDF rangés, octet pour octet, sous leur numéro, en STORE — filtre ou sélection", async () => {
    const { companyId, invoiceId, number, issuedYear } = await issuedInvoice();
    const compta = await member(companyId, "zip-compta", CustomerRole.billing);
    const base = `/companies/${companyId}/invoices`;
    const pdf = bytesOf(await binary(compta, `${base}/${invoiceId}/pdf`, 200));

    const filtered = await binary(compta, `${base}.zip?year=${String(issuedYear)}`, 200);
    expect(filtered.headers["content-type"]).toBe("application/zip");
    expect(filtered.headers["content-disposition"]).toContain(
      `factures-boulangerie-du-port-${String(issuedYear)}.zip`,
    );
    const zip = bytesOf(filtered);
    const entries = unzipSync(zip);
    expect(Object.keys(entries)).toEqual([`${number}.pdf`]);
    expect(Buffer.from(entries[`${number}.pdf`] ?? []).equals(pdf)).toBe(true);
    expect(methodsOf(zip)).toEqual([0]);

    const selected = bytesOf(await binary(compta, `${base}.zip?ids=${invoiceId}`, 200));
    expect(Object.keys(unzipSync(selected))).toEqual([`${number}.pdf`]);
  });

  it("le mur : autre rôle 403, non-membre 404 ; filtres et ids ensemble 400", async () => {
    const { companyId, invoiceId } = await issuedInvoice();
    const commis = await member(companyId, "zip-commis", CustomerRole.orders);
    const compta = await member(companyId, "zip-compta", CustomerRole.billing);
    const base = `/companies/${companyId}/invoices.zip`;

    await ctx.asSub(commis).get(base).expect(403);
    const stranger = await createCompany(ctx.prisma, { raisonSociale: "Ailleurs" });
    const outsider = await member(stranger.id, "zip-outsider", CustomerRole.owner);
    await ctx.asSub(outsider).get(base).expect(404);
    await ctx.asSub(compta).get(`${base}?ids=${invoiceId}&year=2026`).expect(400);
  });

  it("un id d'une autre société : refusé en le nommant, aucun zip", async () => {
    const { invoiceId } = await issuedInvoice();
    const elsewhere = await createCompany(ctx.prisma, { raisonSociale: "Café d'en face" });
    const theirCompta = await member(elsewhere.id, "zip-theirs", CustomerRole.billing);

    const refused = await ctx
      .asSub(theirCompta)
      .get(`/companies/${elsewhere.id}/invoices.zip?ids=${invoiceId}`)
      .expect(404);

    expect(refused.headers["content-type"]).toContain("application/json");
    expect(JSON.stringify(refused.body)).toContain(invoiceId);
    expect(JSON.stringify(refused.body)).toContain("accounting.invoice_archive.not_visible");
  });

  it("rien ne répond au filtre : 409 nommé, pas un zip vide", async () => {
    const { companyId, issuedYear } = await issuedInvoice();
    const compta = await member(companyId, "zip-compta", CustomerRole.billing);

    await ctx
      .asSub(compta)
      .get(`/companies/${companyId}/invoices.zip?year=${String(issuedYear - 5)}`)
      .expect(409);
  });
});
