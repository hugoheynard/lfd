/**
 * E2E du **compte ouvert au comptoir** côté facturation et boutique (plan
 * `documentation/comptes-client/plan-comptes-du-comptoir.md`, § 3.2, § 6.2).
 *
 * Ce que seul le vrai serveur prouve : la clôture du mois écarte un compte
 * `counter_opened` PAR SON STATUT, dans la requête — sans SIREN ni adresse,
 * il bloquerait sinon la clôture des autres ; et la boutique ne lui dit
 * jamais « au compte », même crédité.
 *
 * L'ouverture passe par sa route (`POST /admin/counter/accounts`, K2). Les
 * deux premières scènes posent encore le statut par Prisma, et c'est voulu :
 * la première a besoin d'un bon servi au compte AVANT, que la passation de la
 * boutique ne prend que d'un compte actif (le comptoir l'admettra en K3) ; la
 * seconde, d'une membership que l'agrégat refuse — le test montre que la
 * boutique tient même si elle existait.
 */
import { jsonBody } from "./e2e-harness.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { TermsNotGrantedError } from "../src/lafoliecoffee/orders/domain/errors/order-errors.js";
import {
  closesAt,
  ctx,
  invoicedPayer,
  setUpEntity,
  staff,
  useCollectionReturnScene,
} from "./collection-returns-scene.js";
import { attachTo, createCompany, createUser, handOver } from "./factories.js";
import { placeServedOrder } from "./served-order.js";

const OPEN_ROUTE = "/admin/counter/accounts";
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

const DAY_MS = 24 * 60 * 60 * 1000;

/** Une société au compte, son bon servi avant la clôture, puis repassée au comptoir. */
async function counterAccountWithServedOrder(): Promise<string> {
  const company = await createCompany(ctx.prisma, {
    raisonSociale: "",
    enseigne: "Kiosque du Quai",
  });
  const buyer = await createUser(ctx.prisma, {
    auth0Sub: "counter-buyer",
    email: "kiosque@quai.test",
  });
  await attachTo(ctx.prisma, buyer.id, company.id, CustomerRole.owner);
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: ["monthly"] },
  });
  const servedAt = new Date(closesAt.getTime() - 2 * DAY_MS);
  const order = await placeServedOrder(ctx, {
    buyerUserId: buyer.id,
    companyId: company.id,
    servedAt,
  });
  await handOver(ctx.prisma, { ...order, createdAt: servedAt });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { status: "counter_opened", siret: "", siren: "" },
  });
  return company.id;
}

describe("la clôture du mois et un compte ouvert au comptoir", () => {
  it("émet la facture des autres payeurs, et rien pour le compte du comptoir", async () => {
    const entityId = await setUpEntity(staff);
    const payer = await invoicedPayer(ctx, staff, entityId, closesAt);
    const counter = await counterAccountWithServedOrder();

    await staff()
      .post("/admin/accounting/monthly-invoices")
      .send({ legalEntityId: entityId, periodClosesAt: closesAt.toISOString() })
      .expect(200);

    expect(await ctx.prisma.invoice.count({ where: { payerCompanyId: payer } })).toBe(1);
    expect(await ctx.prisma.invoice.count({ where: { payerCompanyId: counter } })).toBe(0);
    expect(
      await ctx.prisma.invoiceMonthlyOutcome.count({ where: { payerCompanyId: counter } }),
    ).toBe(0);
  });
});

describe("la boutique et un compte ouvert au comptoir", () => {
  it("refuse le règlement au compte, même avec le mensuel accordé", async () => {
    const company = await createCompany(ctx.prisma, { enseigne: "Kiosque du Quai" });
    const buyer = await createUser(ctx.prisma, {
      auth0Sub: "counter-shop",
      email: "shop@quai.test",
    });
    await attachTo(ctx.prisma, buyer.id, company.id, CustomerRole.owner);
    await ctx.prisma.company.update({
      where: { id: company.id },
      data: { grantedTerms: ["monthly"], status: "counter_opened" },
    });
    const servedAt = new Date(closesAt.getTime() + 3 * DAY_MS);

    await expect(
      placeServedOrder(ctx, { buyerUserId: buyer.id, companyId: company.id, servedAt }),
    ).rejects.toBeInstanceOf(TermsNotGrantedError);
    expect(await ctx.prisma.order.count({ where: { companyId: company.id } })).toBe(0);
  });
});

describe("ouvrir un compte au comptoir — POST /admin/counter/accounts", () => {
  it("ouvre la société counter_opened, au mensuel, au virement, avec la trace de la case", async () => {
    const entityId = await setUpEntity(staff);
    const agent = await ctx.prisma.staffUser.findFirstOrThrow({ where: { auth0Id: "staff-e2e" } });

    const response = await staff()
      .post(OPEN_ROUTE)
      .set(INTENT_KEY, freshIntent())
      .send(OPEN_PAYLOAD)
      .expect(201);
    const { id } = jsonBody<{ id: string }>(response);

    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id } });
    expect(company).toMatchObject({
      status: "counter_opened",
      grantedTerms: ["monthly"],
      enseigne: "Kiosque du Quai",
      siret: "",
    });
    expect(
      await ctx.prisma.payerCollectionMeans.findMany({
        where: { payerCompanyId: id },
        select: { legalEntityId: true, means: true, reason: true, cancelledAt: true },
      }),
    ).toEqual([
      {
        legalEntityId: entityId,
        means: "bank_transfer",
        reason: "Ouvert au comptoir : règlement par virement.",
        cancelledAt: null,
      },
    ]);
    const trace = await ctx.prisma.counterOpeningAttestation.findUniqueOrThrow({
      where: { companyId: id },
    });
    expect(trace).toMatchObject({ identitySeen: true, attestedByStaffId: agent.id });
    expect(await ctx.prisma.membership.count({ where: { companyId: id } })).toBe(0);
  });

  it("la trace ne se décoche pas : la base refuse de la réécrire", async () => {
    const response = await staff()
      .post(OPEN_ROUTE)
      .set(INTENT_KEY, freshIntent())
      .send({ ...OPEN_PAYLOAD, identitySeen: false })
      .expect(201);
    const { id } = jsonBody<{ id: string }>(response);

    await expect(
      ctx.prisma.counterOpeningAttestation.update({
        where: { companyId: id },
        data: { identitySeen: true },
      }),
    ).rejects.toThrow(/append_only/u);
  });

  it("refuse le prélèvement sur ce compte, en disant de le convertir d'abord", async () => {
    const entityId = await setUpEntity(staff);
    const { id } = jsonBody<{ id: string }>(
      await staff().post(OPEN_ROUTE).set(INTENT_KEY, freshIntent()).send(OPEN_PAYLOAD).expect(201),
    );

    const refused = await staff()
      .put(`/admin/accounting/legal-entities/${entityId}/payers/${id}/collection-means`)
      .send({ means: "sepa_debit", reason: "Le client a signé un mandat." })
      .expect(409);
    expect(JSON.stringify(refused.body)).toContain("Convertissez d'abord le compte");
  });

  it("refuse à qui n'a pas le droit des comptes du comptoir (403), sans rien ouvrir", async () => {
    await ctx.prisma.staffUser.create({
      data: {
        firstName: "Test",
        lastName: "comptoir",
        email: "counter-agent@lfc.test",
        role: "comptoir",
        status: "active",
        auth0Id: "staff-counter-agent",
      },
    });

    await ctx
      .asSub("staff-counter-agent")
      .post(OPEN_ROUTE)
      .set(INTENT_KEY, freshIntent())
      .send(OPEN_PAYLOAD)
      .expect(403);
    expect(await ctx.prisma.company.count({ where: { status: "counter_opened" } })).toBe(0);
  });
});
