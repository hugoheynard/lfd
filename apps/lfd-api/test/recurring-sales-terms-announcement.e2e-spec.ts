/**
 * E2E de **l'annonce d'une nouvelle version des CGV aux paniers récurrents**
 * (plan `documentation/commandes/paniers-recurrents/plan-bloc-recurrent.md`,
 * § 7 ; Q-B7 : l'acte qui publie est le dépôt du PDF des CGV).
 *
 * Ce que seul le vrai chemin prouve : le fait `content.sales_terms_published`
 * écrit dans la transaction du dépôt, relayé par la boîte d'envoi jusqu'à
 * l'abonné durable du bloc `recurring`, les colonnes de l'annonce sur
 * `recurring.basket`, et une demande d'e-mail par acheteur au bloc `mail`.
 */
import { PERSONAL_WORKSPACE } from "@lfd/contracts";

import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { OutboxRelay } from "../src/platform/outbox/outbox-relay.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, serviceDay, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import { prose } from "./legal-document-writes.js";
import { openBasket, publishSalesTerms } from "./recurring-scene.js";

const JEANNE = "auth0|cgv-jeanne";
const PAUL = "auth0|cgv-paul";
const TEMPLATE = "customer.recurring-sales-terms-changed";
const PDF = Buffer.from("%PDF-1.7\nles nouvelles CGV\n%%EOF", "latin1");

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

const staff = () => ctx.asSub(E2E_STAFF_SUB);

/** Un acheteur pro, propriétaire de sa société active ; rend l'id de la société. */
async function proBuyer(sub: string, email: string): Promise<string> {
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  const user = await createUser(ctx.prisma, { auth0Sub: sub, email });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  return company.id;
}

/** Corrige un article des CGV pro : la révision monte (2), comme un texte qu'on retravaille. */
async function reviseProText(): Promise<void> {
  await staff()
    .post("/admin/content/legal/salesTermsPro/paragraphs")
    .send({ ...prose("nouvelle-version"), expectedRevision: 1 })
    .expect(201);
}

async function depositProPdf(): Promise<void> {
  await staff()
    .post("/admin/content/legal/salesTermsPro/files")
    .set(INTENT_KEY, freshIntent())
    .attach("file", PDF, "cgv.pdf")
    .expect(201);
}

/** La boîte d'envoi, relayée jusqu'au calme. */
async function relayAll(): Promise<void> {
  const relay = ctx.app.get(OutboxRelay);
  for (let round = 0; round < 3; round += 1) {
    await relay.sweep();
    await ctx.drain();
  }
}

const announcementMails = () =>
  ctx.prisma.mailRequest.findMany({
    where: { template: TEMPLATE },
    orderBy: { recipient: "asc" },
    select: { recipient: true, idempotencyKey: true },
  });

let jeanneBaskets: readonly string[] = [];
let paulBasket = "";
let personalBasket = "";

beforeEach(async () => {
  await ctx.reset();
  await publishSalesTerms(ctx);
  const jeanneCompany = await proBuyer(JEANNE, "jeanne@cgv.test");
  const paulCompany = await proBuyer(PAUL, "paul@cgv.test");
  jeanneBaskets = [
    await openBasket(ctx, JEANNE, jeanneCompany),
    await openBasket(ctx, JEANNE, jeanneCompany),
  ];
  paulBasket = await openBasket(ctx, PAUL, paulCompany);
  personalBasket = await openBasket(ctx, PAUL, PERSONAL_WORKSPACE);
  await ctx
    .asSub(JEANNE)
    .patch(`/subscriptions/${jeanneBaskets[1] ?? ""}/status`)
    .send({ status: "paused" })
    .expect(204);
  await relayAll();
});

describe("déposer le PDF des CGV pro annonce la nouvelle version aux paniers", () => {
  it("les paniers actifs et en pause portent la version à venir, effet à +30 jours ; un e-mail par acheteur", async () => {
    await reviseProText();
    await depositProPdf();
    await relayAll();

    const file = await ctx.prisma.legalDocumentFile.findFirstOrThrow({
      where: { documentKey: "sales-terms-pro", supersededAt: null },
      select: { id: true },
    });
    const pro = await ctx.prisma.basket.findMany({
      where: { id: { in: [...jeanneBaskets, paulBasket] } },
      select: {
        salesTermsRevision: true,
        salesTermsNextRevision: true,
        salesTermsNextFileId: true,
        salesTermsEffectiveOn: true,
      },
    });
    expect(pro).toHaveLength(3);
    for (const basket of pro) {
      expect(basket).toEqual({
        salesTermsRevision: 1,
        salesTermsNextRevision: 2,
        salesTermsNextFileId: file.id,
        salesTermsEffectiveOn: new Date(`${serviceDay(30)}T00:00:00.000Z`),
      });
    }
    const personal = await ctx.prisma.basket.findUniqueOrThrow({
      where: { id: personalBasket },
      select: { salesTermsNextRevision: true },
    });
    expect(personal.salesTermsNextRevision).toBeNull();

    const jeanne = await ctx.prisma.user.findUniqueOrThrow({ where: { auth0Sub: JEANNE } });
    const paul = await ctx.prisma.user.findUniqueOrThrow({ where: { auth0Sub: PAUL } });
    expect(await announcementMails()).toEqual([
      { recipient: "jeanne@cgv.test", idempotencyKey: `${TEMPLATE}:${file.id}:${jeanne.id}` },
      { recipient: "paul@cgv.test", idempotencyKey: `${TEMPLATE}:${file.id}:${paul.id}` },
    ]);
  });

  it("un second dépôt de la même version n'annonce rien et ne renvoie aucun e-mail", async () => {
    await reviseProText();
    await depositProPdf();
    await relayAll();
    const first = await ctx.prisma.basket.findMany({
      select: { id: true, salesTermsNextFileId: true },
      orderBy: { id: "asc" },
    });

    await depositProPdf();
    await relayAll();

    expect(
      await ctx.prisma.outboxMessage.count({ where: { type: "content.sales_terms_published" } }),
    ).toBe(2);
    expect(
      await ctx.prisma.basket.findMany({
        select: { id: true, salesTermsNextFileId: true },
        orderBy: { id: "asc" },
      }),
    ).toEqual(first);
    expect(await announcementMails()).toHaveLength(2);
  });

  it("un dépôt sans nouvelle révision du texte n'annonce rien", async () => {
    await depositProPdf();
    await relayAll();

    expect(
      await ctx.prisma.basket.count({ where: { salesTermsNextRevision: { not: null } } }),
    ).toBe(0);
    expect(await announcementMails()).toEqual([]);
  });
});
