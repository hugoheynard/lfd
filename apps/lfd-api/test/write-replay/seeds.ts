import { instantToLocal } from "@lfd/contracts";

import { invoicingMomentOf } from "../../src/lafoliecoffee/accounting/domain/services/invoicing-closures.js";
import { StatementMonth } from "../../src/lafoliecoffee/accounting/domain/value-objects/statement-month.js";
import { CompanyStatus, CustomerRole } from "../../src/platform/database/client/client.js";
import { invoicedPayer, setUpEntity } from "../collection-returns-scene.js";
import { daysAgo, jsonBody, type E2eContext } from "../e2e-harness.js";
import { attachTo, createCompany, createUser } from "../factories.js";
import { INTENT_KEY, freshIntent } from "../intent-key.js";
import type { ReplayWorld } from "./scenario.js";
import { staffOf } from "./scenario.js";

/**
 * Les semis communs aux scénarios du rejeu, par les vraies routes quand il y
 * en a une — repris des scènes voisines (`collection-returns-scene.ts`,
 * `issued-invoices.e2e-spec.ts`), dont ils gardent les dettes : mandats écrits
 * par Prisma, faute de route pour les poser.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
export const ENTITIES = "/admin/accounting/legal-entities";
export const PDF = Buffer.from("%PDF-1.4\npièce du rejeu", "latin1");
export const DEBTOR_RIB = {
  iban: "FR7630004000031234567890143",
  bic: "BNPAFRPP",
  holder: "Client e2e",
  line1: "1 rue du Test",
  line2: "",
  postalCode: "73000",
  city: "Chambéry",
  countryCode: "FR",
};

/** Un PNG réel (signature, `IHDR`, `IEND`) aux dimensions données. */
export function png(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    return Buffer.concat([length, Buffer.from(type, "latin1"), data, Buffer.alloc(4)]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, chunk("IHDR", header), chunk("IEND", Buffer.alloc(0))]);
}

/** Le corps d'une déclaration d'entité émettrice. */
export function entityDeclaration(siren = "552100554"): object {
  return {
    name: "La Folie Douce",
    legalForm: "SAS",
    siren,
    rcs: "Chambéry B 552 100 554",
    shareCapitalCents: 1_000_000,
    vatNumber: "FR89552100554",
    address: {
      line1: "12 rue du Fournil",
      line2: "",
      postalCode: "73000",
      city: "Chambéry",
      countryCode: "FR",
    },
  };
}

/** Une entité complète : ICS, compte, mentions, préfixe de numéro. */
export function completeEntity(ctx: E2eContext): Promise<string> {
  return setUpEntity(staffOf(ctx));
}

/** Une entité juste déclarée. */
export async function declaredEntity(ctx: E2eContext): Promise<string> {
  const response = await ctx
    .asSub("staff-e2e")
    .post(ENTITIES)
    .set(INTENT_KEY, freshIntent())
    .send(entityDeclaration())
    .expect(201);
  return jsonBody<{ id: string }>(response).id;
}

let mandateSeq = 0;

/** Une société active, son RIB par la route, un mandat B2B actif chez l'entité. */
export async function mandatedCompany(
  ctx: E2eContext,
  entityId: string,
): Promise<{ readonly companyId: string; readonly mandateId: string }> {
  mandateSeq += 1;
  const company = await createCompany(ctx.prisma, { raisonSociale: "Folie Douce Val" });
  await ctx
    .asSub("staff-e2e")
    .put(`/admin/companies/${company.id}/bank-account`)
    .send(DEBTOR_RIB)
    .expect(204);
  const mandate = await ctx.prisma.paymentMandate.create({
    data: {
      companyId: company.id,
      creditorId: entityId,
      reference: `RUM-REPLAY-${String(mandateSeq)}`,
      status: "active",
      acceptedAt: new Date(daysAgo(60)),
      scheme: "B2B",
      paymentType: "recurrent",
    },
  });
  return { companyId: company.id, mandateId: mandate.id };
}

/** Le mois clos d'hier, ses planchers posés, l'horloge au moment de facturer. */
export async function closedMonth(world: ReplayWorld): Promise<Date> {
  const month = StatementMonth.containing(new Date(daysAgo(0))).previous();
  const closesAt = month.cycle().closesAt;
  world.clock.set(new Date(invoicingMomentOf(closesAt).getTime() + 2 * 60 * 1000));
  const startsAt = month.cycle().startsAt;
  await world.ctx.prisma.collectionFloor.create({ data: { id: true, floorAt: startsAt } });
  await world.ctx.prisma.invoicingFloor.create({ data: { id: true, floorAt: startsAt } });
  return closesAt;
}

/** Les factures du mois clos, émises par la route. */
export async function issueMonth(ctx: E2eContext, entityId: string, closesAt: Date): Promise<void> {
  await ctx
    .asSub("staff-e2e")
    .post("/admin/accounting/monthly-invoices")
    .send({ legalEntityId: entityId, periodClosesAt: closesAt.toISOString() })
    .expect(200);
  await ctx.drain();
}

/** Une entité, un payeur au compte sous mandat, sa facture du mois émise. */
export async function invoicedWorld(
  world: ReplayWorld,
  beforeIssue: (entityId: string, payerId: string) => Promise<void> = () => Promise.resolve(),
): Promise<{ readonly entityId: string; readonly payerId: string; readonly closesAt: Date }> {
  const closesAt = await closedMonth(world);
  const entityId = await completeEntity(world.ctx);
  const payerId = await invoicedPayer(world.ctx, staffOf(world.ctx), entityId, closesAt);
  await beforeIssue(entityId, payerId);
  await issueMonth(world.ctx, entityId, closesAt);
  return { entityId, payerId, closesAt };
}

/** Le point de retrait par défaut. */
export async function pickupPoint(ctx: E2eContext): Promise<string> {
  const point = await ctx.prisma.site.create({
    data: {
      label: "Labo",
      ligne1: "1 rue du Four",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  return point.id;
}

/** Une société active et son détenteur, `sub` donné ; `onAccount` : un crédit accordé. */
export async function companyWithOwner(
  ctx: E2eContext,
  sub: string,
  onAccount = false,
): Promise<{ readonly companyId: string; readonly ownerId: string }> {
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  if (onAccount) {
    await ctx.prisma.company.update({
      where: { id: company.id },
      data: { grantedTerms: ["monthly"] },
    });
  }
  const owner = await createUser(ctx.prisma, { auth0Sub: sub, email: `${sub}@replay.test` });
  await attachTo(ctx.prisma, owner.id, company.id, CustomerRole.owner);
  return { companyId: company.id, ownerId: owner.id };
}

/** Le jour de Paris de l'horloge du scénario. */
export function today(world: ReplayWorld): string {
  return instantToLocal(world.clock.now()).day;
}
