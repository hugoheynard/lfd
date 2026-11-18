/**
 * E2E d'un **organisme public qui règle au compte, par virement** (plan
 * `documentation/comptabilite/facturation/plan-clients-publics-chorus.md`,
 * § 6 ter, P1b).
 *
 * Ce que seul le vrai serveur prouve : l'activation écrit, dans sa
 * transaction, le compte sur la société et le virement dans la table
 * append-only du moyen ; la fiche relit ce virement ; le prélèvement est
 * refusé à l'écriture ; la passation de la boutique refuse la carte et
 * accepte le compte.
 *
 * Aucune date absolue : la prise d'effet attendue se calcule depuis
 * l'instant présent.
 */
import type { PayerCollectionMeansView } from "@lfd/contracts";

import { PublicBuyerCardRefusedError } from "../src/lafoliecoffee/orders/domain/errors/public-buyer-errors.js";
import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { daysAgo, jsonBody } from "./e2e-harness.js";
import { addBillingAddress, attachTo, createCompany, createUser } from "./factories.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import { pickupSite, placeOrder } from "./order-factory.js";
import {
  BASE,
  ctx,
  declare,
  lastMonthlyClosure,
  staff,
  useBillingModeScene,
} from "./billing-mode-scene.js";

useBillingModeScene();

const BUYER = "auth0|ecole-intendance";
const PUBLIC_FORM = "public_establishment";

const meansRoute = (entityId: string, companyId: string): string =>
  `${BASE}/${entityId}/payers/${companyId}/collection-means`;

/** Une école en attente, complète : identité publique, téléphone, facturation, fiche Chorus. */
async function pendingSchool(): Promise<string> {
  const school = await createCompany(ctx.prisma, {
    raisonSociale: "Commune de Chamonix",
    status: CompanyStatus.pending,
  });
  await ctx.prisma.company.update({
    where: { id: school.id },
    data: { formeJuridique: PUBLIC_FORM, contactTelephone: "04 50 00 00 00" },
  });
  await addBillingAddress(ctx.prisma, school.id);
  await staff()
    .put(`/admin/companies/${school.id}/chorus-routing`)
    .send({
      commitmentRequired: true,
      serviceCodeRequired: false,
      defaultServiceCode: "",
      checkedOn: daysAgo(1).slice(0, 10),
    })
    .expect(204);
  return school.id;
}

describe("activer un organisme public", () => {
  it("lui accorde le compte et pose le virement, que la fiche relit", async () => {
    const entityId = await declare();
    const schoolId = await pendingSchool();

    await staff().post(`/admin/companies/${schoolId}/activate`).expect(204);

    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: schoolId } });
    expect(company.status).toBe(CompanyStatus.active);
    expect(company.grantedTerms).toEqual(["monthly"]);
    const means = jsonBody<PayerCollectionMeansView>(
      await staff().get(meansRoute(entityId, schoolId)).expect(200),
    );
    expect(means).toMatchObject({
      means: "bank_transfer",
      since: lastMonthlyClosure(),
      scheduled: null,
    });
    const fact = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { subjectId: schoolId, type: "company.chorus_routing_recorded" },
    });
    expect(fact.subjectId).toBe(schoolId);
  });

  it("refuse ensuite le prélèvement et le blocage du prélèvement, en les nommant", async () => {
    const entityId = await declare();
    const schoolId = await pendingSchool();
    await staff().post(`/admin/companies/${schoolId}/activate`).expect(204);

    const debit = await staff()
      .put(meansRoute(entityId, schoolId))
      .set(INTENT_KEY, freshIntent())
      .send({ means: "sepa_debit", reason: "Essai" })
      .expect(409);
    expect(jsonBody<{ code: string }>(debit).code).toBe(
      "accounting.collection_means.public_payer_direct_debit",
    );
    expect(await ctx.prisma.payerCollectionMeans.count({ where: { means: "sepa_debit" } })).toBe(0);
  });
});

describe("la boutique d'un organisme public", () => {
  async function activeSchoolBuyer(): Promise<{
    readonly userId: string;
    readonly companyId: string;
  }> {
    const school = await createCompany(ctx.prisma, { raisonSociale: "Lycée du Mont-Blanc" });
    await ctx.prisma.company.update({
      where: { id: school.id },
      data: { formeJuridique: PUBLIC_FORM, grantedTerms: ["monthly"] },
    });
    const buyer = await createUser(ctx.prisma, { auth0Sub: BUYER });
    await attachTo(ctx.prisma, buyer.id, school.id, CustomerRole.orders);
    return { userId: buyer.id, companyId: school.id };
  }

  it("refuse la carte, sans commande", async () => {
    const { userId, companyId } = await activeSchoolBuyer();

    await expect(
      placeOrder(ctx, {
        buyerUserId: userId,
        companyId,
        settlement: "card",
        fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
      }),
    ).rejects.toBeInstanceOf(PublicBuyerCardRefusedError);
    expect(await ctx.prisma.order.count()).toBe(0);
  });

  it("accepte le compte, sans rien à encaisser", async () => {
    const { userId, companyId } = await activeSchoolBuyer();

    const order = await placeOrder(ctx, {
      buyerUserId: userId,
      companyId,
      settlement: "account",
      fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    });

    const row = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { paymentStatus: true },
    });
    expect(row.paymentStatus).toBe("not_required");
  });

  it("sert à la boutique la nature du payeur", async () => {
    const { companyId } = await activeSchoolBuyer();

    const response = await ctx.asSub(BUYER).get("/me").expect(200);

    const me = jsonBody<{ companies: { id: string; payerIsPublic?: boolean }[] }>(response);
    expect(me.companies.find((company) => company.id === companyId)?.payerIsPublic).toBe(true);
  });
});

/** L'adresse de livraison d'un site : il n'a que son enseigne et elle. */
const DELIVERY = {
  label: "Annexe",
  ligne1: "12 route des Praz",
  ligne2: "",
  codePostal: "74400",
  ville: "Chamonix",
  pays: "France",
  isDefault: true,
  specs: {
    signatureRequired: false,
    note: "",
    slotList: { mode: "everyday", slots: [] },
    deliveryContact: null,
    gps: null,
  },
};

describe("un site qui suit la facturation d'un organisme public", () => {
  it("ne peut pas prendre une forme d'entreprise, et peut prendre une forme publique", async () => {
    const principal = await createCompany(ctx.prisma, { raisonSociale: "Commune de Chamonix" });
    await ctx.prisma.company.update({
      where: { id: principal.id },
      data: { formeJuridique: "public_local_authority" },
    });
    const created = await staff()
      .post(`/admin/companies/${principal.id}/sub-accounts`)
      .set(INTENT_KEY, freshIntent())
      .send({ enseigne: "École annexe", deliveryAddress: DELIVERY, follows: ["billing"] })
      .expect(201);
    const siteId = jsonBody<{ id: string }>(created).id;

    const refused = await staff()
      .patch(`/admin/companies/${siteId}/identity`)
      .send({ raisonSociale: "Annexe SAS", formeJuridique: "sas" })
      .expect(409);
    expect(jsonBody<{ code: string }>(refused).code).toBe(
      "account.hierarchy.billing_nature_change",
    );

    await staff()
      .patch(`/admin/companies/${siteId}/identity`)
      .send({ raisonSociale: "Commune de Chamonix", formeJuridique: PUBLIC_FORM })
      .expect(204);
    const site = await ctx.prisma.company.findUniqueOrThrow({ where: { id: siteId } });
    expect(site.formeJuridique).toBe(PUBLIC_FORM);
  });
});
