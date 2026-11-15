/**
 * E2E de la **grille d'étapes** du suivi commercial (`GET /admin/sales-oversight`,
 * plan `documentation/b2b/plan-suivi-commercial.md`, § 1 bis).
 *
 * Ce que seul le vrai serveur prouve : chaque étape lue par lot sur les vraies
 * tables — crédit, mode et moyen du payeur chez l'entité en service, RIB,
 * mandat, KBIS, carnet, commandes — et les cartes et le filtre de prochaine
 * étape appliqués à ce que la base rend.
 */
import type { SalesOversightRowView, SalesOversightView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { LATEST_DELIVERY_FULFILLMENT } from "./delivery-deadline-fixture.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { addBillingAddress, createCompany, createUser } from "./factories.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const ROUTE = "/admin/sales-oversight";

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

async function read(query = ""): Promise<SalesOversightView> {
  const res = await ctx.asSub(E2E_STAFF_SUB).get(`${ROUTE}${query}`).expect(200);
  return jsonBody<SalesOversightView>(res);
}

async function rowOf(companyId: string): Promise<SalesOversightRowView> {
  const row = (await read()).rows.find((candidate) => candidate.companyId === companyId);
  if (row === undefined) {
    throw new Error(`fiche ${companyId} absente du suivi`);
  }
  return row;
}

/** Une fiche principale suivie, avec SIRET, forme SAS, sans TVA ni téléphone. */
async function sheet(raisonSociale: string): Promise<string> {
  const company = await createCompany(ctx.prisma, { raisonSociale, status: "pending" });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { followedByStaffId: E2E_STAFF_ID, declaredVia: "staff" },
  });
  return company.id;
}

/** L'entité en service, déclarée par la vraie route. */
async function entity(): Promise<string> {
  const response = await ctx
    .asSub(E2E_STAFF_SUB)
    .post("/admin/accounting/legal-entities")
    .set(INTENT_KEY, freshIntent())
    .send({
      name: "La Folie Douce",
      legalForm: "SAS",
      siren: "552100554",
      rcs: "",
      shareCapitalCents: 1_000_000,
      vatNumber: "",
      address: {
        line1: "12 rue du Fournil",
        line2: "",
        postalCode: "73000",
        city: "Chambéry",
        countryCode: "FR",
      },
    })
    .expect(201);
  return jsonBody<{ id: string }>(response).id;
}

/** Au compte (crédit mensuel accordé). */
async function onAccount(companyId: string): Promise<void> {
  await ctx.prisma.company.update({
    where: { id: companyId },
    data: { grantedTerms: ["monthly"] },
  });
}

/**
 * Un segment de mode ou de moyen déjà en vigueur, écrit par Prisma comme
 * `bank-transfer-scene.ts` : la route le daterait à la prochaine clôture.
 */
async function modeSince(entityId: string, payerId: string, mode: string): Promise<void> {
  const since = new Date(daysAgo(10));
  await ctx.prisma.payerBillingMode.create({
    data: {
      id: `mode_${payerId}`,
      legalEntityId: entityId,
      payerCompanyId: payerId,
      effectiveFrom: since,
      mode,
      createdAt: since,
      createdByStaffId: "staff-e2e",
    },
  });
}

async function transferSince(entityId: string, payerId: string, cancelled = false): Promise<void> {
  const since = new Date(daysAgo(10));
  await ctx.prisma.payerCollectionMeans.create({
    data: {
      id: `means_${payerId}`,
      legalEntityId: entityId,
      payerCompanyId: payerId,
      effectiveFrom: since,
      means: "bank_transfer",
      reason: "Le client règle par virement",
      createdAt: since,
      createdByStaffId: "staff-e2e",
      ...(cancelled ? { cancelledAt: new Date(daysAgo(5)), cancelledByStaffId: "staff-e2e" } : {}),
    },
  });
}

async function bankAccount(companyId: string): Promise<void> {
  await ctx
    .asSub(E2E_STAFF_SUB)
    .put(`/admin/companies/${companyId}/bank-account`)
    .set(INTENT_KEY, freshIntent())
    .send({
      iban: "FR7630004000031234567890143",
      bic: "BNPAFRPP",
      holder: "Client e2e",
      line1: "1 rue du Test",
      line2: "",
      postalCode: "73000",
      city: "Chambéry",
      countryCode: "FR",
    })
    .expect(204);
}

async function mandate(entityId: string, companyId: string): Promise<void> {
  await ctx.prisma.paymentMandate.create({
    data: {
      companyId,
      creditorId: entityId,
      reference: `RUM-SUIVI-${companyId}`,
      status: "active",
      acceptedAt: new Date(daysAgo(30)),
      scheme: "B2B",
      paymentType: "recurrent",
    },
  });
}

let orderSeq = 0;

/** Un bon passé par la fiche, écrit par Prisma comme `billing-mode-scene.ts`. */
async function ordered(companyId: string): Promise<void> {
  orderSeq += 1;
  const buyer = await createUser(ctx.prisma, { auth0Sub: `suivi-buyer-${String(orderSeq)}` });
  await ctx.prisma.order.create({
    data: {
      vatMethod: "line_ht",
      orderNumber: `ORD-${String(900_000 + orderSeq)}`,
      companyId,
      billedCompanyId: companyId,
      placedByUserId: buyer.id,
      subtotalCents: 1_000,
      vatCents: 55,
      totalCents: 1_055,
      status: "placed",
      paymentStatus: "not_required",
      fulfillment: LATEST_DELIVERY_FULFILLMENT,
    },
  });
}

describe("GET /admin/sales-oversight — la grille d'étapes", () => {
  it("lit une fiche sans pièces : à la commande, KBIS manquant, livraison manquante, à contacter", async () => {
    const id = await sheet("Sans pièces");

    const row = await rowOf(id);

    expect(row.steps).toEqual({
      contact: { last: null, daysAgo: null },
      // La factory pose raison sociale, forme et SIRET : l'identité légale est là.
      legal: { done: 1, of: 4, missing: ["vat", "phone", "billing_address"], nameOnly: false },
      kbis: "missing",
      payment: { terms: "on_order", requested: false, rhythm: null, means: null },
      debitReady: "not_applicable",
      delivery: "missing",
      login: false,
      activated: false,
      orders: 0,
    });
    expect(row.nextStep).toBe("contact");
    expect(row.nextStepActor).toBe("commercial");
  });

  it("compte la fiche remplie : identité, TVA, téléphone d'un autre interlocuteur, facturation", async () => {
    const id = await sheet("Remplie");
    await ctx.prisma.company.update({
      where: { id },
      data: { formeJuridique: "SAS", vatNumber: "FR00123456789" },
    });
    await ctx.prisma.companyContact.create({
      data: { companyId: id, prenom: "Léa", nom: "Martin", email: "", telephone: "0611223344" },
    });
    await addBillingAddress(ctx.prisma, id);

    expect((await rowOf(id)).steps.legal).toEqual({ done: 4, of: 4, missing: [], nameOnly: false });
  });

  it("dit le KBIS à vérifier, puis certifié", async () => {
    const id = await sheet("Kbis");
    await ctx.prisma.company.update({
      where: { id },
      data: { kbisFileName: "kbis.pdf", kbisUploadedAt: new Date(daysAgo(1)) },
    });
    expect((await rowOf(id)).steps.kbis).toBe("to_verify");

    await ctx.prisma.company.update({
      where: { id },
      data: { kbisCertifiedAt: new Date(daysAgo(0)) },
    });
    expect((await rowOf(id)).steps.kbis).toBe("certified");
  });

  it("dit une demande de crédit non accordée", async () => {
    const id = await sheet("Demande");
    await ctx.prisma.company.update({ where: { id }, data: { requestedTerm: "monthly" } });

    expect((await rowOf(id)).steps.payment).toMatchObject({ terms: "on_order", requested: true });
  });

  it("au compte sans aucune ligne : mensuel au prélèvement, RIB manquant puis mandat, puis prêt", async () => {
    const entityId = await entity();
    const id = await sheet("Au compte");
    await onAccount(id);

    expect((await rowOf(id)).steps).toMatchObject({
      payment: { terms: "on_account", rhythm: "monthly", means: "sepa_debit" },
      debitReady: "bank_account_missing",
    });
    await bankAccount(id);
    expect((await rowOf(id)).steps.debitReady).toBe("mandate_missing");
    await mandate(entityId, id);
    expect((await rowOf(id)).steps.debitReady).toBe("ready");
    await ctx.prisma.company.update({
      where: { id },
      data: {
        directDebitBlockedAt: new Date(daysAgo(0)),
        directDebitBlockedBy: "staff-e2e",
        directDebitBlockReason: "Rejets répétés",
      },
    });
    expect((await rowOf(id)).steps.debitReady).toBe("blocked");
  });

  it("au compte deux fois par mois, par virement : prélèvement sans objet", async () => {
    const entityId = await entity();
    const id = await sheet("Virement");
    await onAccount(id);
    await modeSince(entityId, id, "semimonthly");
    await transferSince(entityId, id);

    const row = await rowOf(id);

    expect(row.steps.payment).toEqual({
      terms: "on_account",
      requested: false,
      rhythm: "semimonthly",
      means: "bank_transfer",
    });
    expect(row.steps.debitReady).toBe("not_applicable");
  });

  it("ne compte pas un virement annulé", async () => {
    const entityId = await entity();
    const id = await sheet("Annulé");
    await onAccount(id);
    await transferSince(entityId, id, true);

    expect((await rowOf(id)).steps.payment.means).toBe("sepa_debit");
  });

  it("dit « retrait » d'une fiche en retrait seul", async () => {
    const id = await sheet("Retrait");
    await ctx.prisma.company.update({
      where: { id },
      data: { preferredFulfillmentMethod: "pickup" },
    });

    expect((await rowOf(id)).steps.delivery).toBe("pickup");
  });

  it("compte les commandes une fois activée, et range la fiche sous « Clients qui commandent »", async () => {
    const id = await sheet("Commande");
    await ctx.prisma.company.update({ where: { id }, data: { activatedAt: new Date(daysAgo(3)) } });
    await ordered(id);
    await ordered(id);

    const view = await read();

    expect(view.rows[0]?.steps).toMatchObject({ activated: true, orders: 2 });
    expect(view.cards.ordering).toBe(1);
  });

  it("filtre par prochaine étape, et compte les cartes sur tout le filtre", async () => {
    const unassigned = await sheet("Libre");
    await ctx.prisma.company.update({
      where: { id: unassigned },
      data: { followedByStaffId: null },
    });
    const followed = await sheet("Suivie");

    const view = await read("?nextStep=assign");

    expect(view.rows.map((row) => row.companyId)).toEqual([unassigned]);
    expect(view.total).toBe(1);
    expect(view.cards.noContact).toBe(2);
    expect((await read("?nextStep=contact")).rows.map((row) => row.companyId)).toEqual([followed]);
  });

  it("filtre par carte : chaque carte retient ses fiches, les cartes restent entières", async () => {
    await entity();
    const silent = await sheet("Silencieuse");
    const noRib = await sheet("Sans RIB");
    await onAccount(noRib);
    const toActivate = await sheet("À activer");
    const buyer = await sheet("Cliente");
    await ctx.prisma.company.update({
      where: { id: buyer },
      data: { activatedAt: new Date(daysAgo(3)) },
    });
    await ordered(buyer);
    for (const id of [noRib, toActivate, buyer]) {
      await noteContact(id);
    }
    await completeSheet(toActivate);
    await ownerLoggedIn(toActivate);

    const ids = async (card: string): Promise<string[]> =>
      (await read(`?card=${card}`)).rows.map((row) => row.companyId);
    expect(await ids("noContact")).toEqual([silent]);
    expect(await ids("onAccountNotDebitReady")).toEqual([noRib]);
    expect(await ids("readyNotActivated")).toEqual([toActivate]);
    expect(await ids("ordering")).toEqual([buyer]);
    expect((await read("?card=ordering")).cards).toEqual({
      noContact: 1,
      onAccountNotDebitReady: 1,
      readyNotActivated: 1,
      ordering: 1,
    });
  });

  it("date le dernier contact, et fait recontacter au-delà de 30 jours", async () => {
    const stale = await sheet("Oubliée");
    await noteContact(stale, serviceDay(-40));
    const fresh = await sheet("Récente");
    await noteContact(fresh, serviceDay(-40));
    await noteContact(fresh, serviceDay(-2));

    const staleRow = await rowOf(stale);
    expect(staleRow.steps.contact).toEqual({ last: serviceDay(-40), daysAgo: 40 });
    expect(staleRow.signals).toContain("stale_contact");
    expect(staleRow.nextStep).toBe("contact");
    expect((await rowOf(fresh)).steps.contact).toEqual({ last: serviceDay(-2), daysAgo: 2 });
    expect((await read("?signal=stale_contact")).rows.map((row) => row.companyId)).toEqual([stale]);
    expect((await read()).cards.noContact).toBe(0);
  });

  it("rend la signature du mandat au client", async () => {
    await entity();
    const id = await sheet("Mandat");
    await onAccount(id);
    await noteContact(id);
    await completeSheet(id);
    await bankAccount(id);

    const row = await rowOf(id);
    expect(row.nextStep).toBe("mandate");
    expect(row.nextStepActor).toBe("client");
  });
});

async function noteContact(companyId: string, date = serviceDay(0)): Promise<void> {
  await ctx
    .asSub(E2E_STAFF_SUB)
    .post(`/admin/companies/${companyId}/noted-contacts`)
    .set(INTENT_KEY, freshIntent())
    .send({ mode: "phone", date })
    .expect(201);
}

/** Les quatre pièces : SAS avec TVA, téléphone, adresse de facturation. */
async function completeSheet(companyId: string): Promise<void> {
  await ctx.prisma.company.update({
    where: { id: companyId },
    data: { vatNumber: "FR00123456789", contactTelephone: "0102030405" },
  });
  await addBillingAddress(ctx.prisma, companyId);
}

async function ownerLoggedIn(companyId: string): Promise<void> {
  const user = await createUser(ctx.prisma, { auth0Sub: `owner-${companyId}` });
  await ctx.prisma.user.update({
    where: { id: user.id },
    data: { firstLoginAt: new Date(daysAgo(1)) },
  });
  await ctx.prisma.membership.create({ data: { userId: user.id, companyId, role: "owner" } });
}
