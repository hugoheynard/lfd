/**
 * E2E du **compte ouvert au comptoir** côté facturation et boutique (plan
 * `documentation/comptes-client/plan-comptes-du-comptoir.md`, § 3.2, § 6.2).
 *
 * Ce que seul le vrai serveur prouve : la clôture du mois écarte un compte
 * `counter_opened` PAR SON STATUT, dans la requête — sans SIREN ni adresse,
 * il bloquerait sinon la clôture des autres ; et la boutique ne lui dit
 * jamais « au compte », même crédité.
 *
 * ⚠️ Dette de scène : aucune route n'ouvre encore un compte au comptoir. Le
 * statut est donc posé par Prisma, après la passation du bon au compte (qui
 * le demande actif) ; la membership de la deuxième scène aussi — l'agrégat la
 * refuse, et le test montre que la boutique tient même si elle existait.
 */
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
