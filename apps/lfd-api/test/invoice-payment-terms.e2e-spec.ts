/**
 * E2E des **mentions de paiement de la facture** et des **manques pour
 * émettre** (plan `documentation/comptabilite/facturation/facture-emise.md`).
 *
 * Ce que seul le vrai serveur prouve : les trois colonnes s'écrivent et se
 * relisent (une colonne oubliée dans le mapper rendrait « enregistré » puis
 * l'ancienne valeur), un refus de borne traverse le filtre en 400 en nommant
 * le champ, le fait tombe au journal, et le dossier de facturation lit
 * l'entité en service et la fiche du payeur pour dire ce qui manque.
 *
 * Aucune date : rien ici ne lit l'horloge.
 */
import type { InvoiceDossierView, LegalEntityView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { addBillingAddress, createCompany } from "./factories.js";

const BASE = "/admin/accounting/legal-entities";

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

async function declare(): Promise<string> {
  const response = await staff()
    .post(BASE)
    .send({
      name: "La Folie Douce",
      legalForm: "SAS",
      siren: "552100554",
      rcs: "Chambéry B 552 100 554",
      shareCapitalCents: 1_000_000,
      vatNumber: "FR40552100554",
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

async function read(id: string): Promise<LegalEntityView> {
  return jsonBody<LegalEntityView>(await staff().get(`${BASE}/${id}`).expect(200));
}

async function dossier(companyId: string): Promise<InvoiceDossierView> {
  return jsonBody<InvoiceDossierView>(
    await staff().get(`/admin/accounting/invoice-dossiers/companies/${companyId}`).expect(200),
  );
}

const TERMS = {
  latePenaltyRateBasisPoints: 1_415,
  recoveryIndemnityCents: 4_000,
  earlyPaymentDiscount: "néant",
};

describe("les mentions de paiement de l'entité", () => {
  it("déclarée, rien n'est posé : tout est à renseigner, et la fiche le dit", async () => {
    const id = await declare();

    const entity = await read(id);

    expect(entity.invoicePaymentTerms).toEqual({
      latePenaltyRateBasisPoints: null,
      recoveryIndemnityCents: null,
      earlyPaymentDiscount: null,
    });
    expect(entity.missingToInvoice).toHaveLength(1);
    expect(entity.missingToInvoice[0]).toContain("le taux des pénalités de retard");
  });

  it("s'écrivent, se relisent, et journalisent l'après", async () => {
    const id = await declare();

    await staff().put(`${BASE}/${id}/invoice-payment-terms`).send(TERMS).expect(204);

    const entity = await read(id);
    expect(entity.invoicePaymentTerms).toEqual(TERMS);
    expect(entity.missingToInvoice).toEqual([]);
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: id, type: "legal_entity.invoice_payment_terms_changed" },
      select: { payload: true },
    });
    expect(facts).toEqual([{ payload: { subjectLabel: "La Folie Douce", ...TERMS } }]);
  });

  it("refuse en 400 une indemnité tapée en euros, en nommant le champ", async () => {
    const id = await declare();

    const response = await staff()
      .put(`${BASE}/${id}/invoice-payment-terms`)
      .send({ ...TERMS, recoveryIndemnityCents: 40 })
      .expect(400);

    expect(response.text).toContain("Indemnité forfaitaire de recouvrement");
    expect((await read(id)).invoicePaymentTerms.recoveryIndemnityCents).toBeNull();
  });

  it("refuse en 400 un payload qui omet un champ — rien n'est remis à son défaut", async () => {
    const id = await declare();

    await staff()
      .put(`${BASE}/${id}/invoice-payment-terms`)
      .send({ latePenaltyRateBasisPoints: 1_415 })
      .expect(400);
  });
});

describe("le dossier de facturation dit ce qui empêcherait d'émettre", () => {
  it("sans entité en service, et un payeur sans SIREN ni TVA", async () => {
    const company = await createCompany(ctx.prisma, { raisonSociale: "Café du Port", siren: "" });

    const view = await dossier(company.id);

    expect(view.issuanceBlockers.map((blocker) => blocker.code)).toEqual([
      "no_issuer",
      "buyer_siren_missing",
      "buyer_vat_missing",
      "buyer_address_missing",
    ]);
    expect(view.issuanceBlockers[1]?.message).toContain("Café du Port");
  });

  it("l'entité sans mentions, puis plus rien côté vendeur une fois réglées", async () => {
    const id = await declare();
    const company = await createCompany(ctx.prisma, { raisonSociale: "Café du Port" });
    await addBillingAddress(ctx.prisma, company.id);
    await ctx.prisma.company.update({
      where: { id: company.id },
      data: { vatNumber: "FR44732829320" },
    });

    expect((await dossier(company.id)).issuanceBlockers.map((b) => b.code)).toEqual([
      "payment_terms_missing",
    ]);

    await staff().put(`${BASE}/${id}/invoice-payment-terms`).send(TERMS).expect(204);

    expect((await dossier(company.id)).issuanceBlockers).toEqual([]);
  });
});
