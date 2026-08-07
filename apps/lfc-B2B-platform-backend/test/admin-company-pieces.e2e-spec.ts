/**
 * E2E des **pièces d'activation côté staff** (Porte B) : le commercial complète
 * une société **à la place** du client — KBIS, identité/TVA, condition de
 * règlement **convenue**, adresses.
 *
 * Ce que ces e2e éprouvent et que rien d'autre ne prouve : que ces mutations
 * passent **sans aucun membership** (le staff n'est membre de rien), écrivent la
 * vraie ligne SQL, et — pour le règlement — que fixer le terme convenu **solde**
 * la demande client. Deux frontières doublées : le verifier **staff**
 * (`AdminTokenVerifier`) et le **stockage objet** (`KbisStore`) ; le reste est réel.
 */
import { KbisStore } from "../src/account/domain/ports/kbis-store.js";
import { AdminTokenVerifier } from "../src/infra/auth/admin-token.verifier.js";
import { AddressKind, CompanyStatus, PaymentTerm } from "../src/infra/database/client/client.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

const PDF = Buffer.from("%PDF-1.4\nfake kbis", "latin1");

/** Staff doublé : accepte n'importe quel jeton porteur comme staff synthétique. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

/** Magasin objet en mémoire — le KBIS ne part pas vers R2 en test. */
class FakeKbisStore extends KbisStore {
  save(companyId: string): Promise<string> {
    return Promise.resolve(`companies/${companyId}/kbis.pdf`);
  }
  read(): Promise<Buffer> {
    return Promise.reject(new Error("non utilisé ici"));
  }
}

let ctx: E2eContext;
let companyId: string;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: KbisStore, value: new FakeKbisStore() },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.pending });
  companyId = company.id;
});

/** Requête authentifiée en **staff** (le verifier doublé accepte le jeton). */
function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

/** Une livraison minimale valide. */
const delivery = {
  label: "Boutique",
  ligne1: "9 rue de la Roquette",
  ligne2: "",
  codePostal: "75011",
  ville: "Paris",
  pays: "France",
  isDefault: false,
  specs: { note: "", slots: { mode: "everyday", slot: null }, deliveryContact: null, gps: null },
};

describe("pièces d'activation staff (Porte B)", () => {
  it("dépose le KBIS sans membership", async () => {
    await staff()
      .put(`/admin/companies/${companyId}/kbis`)
      .attach("file", PDF, "kbis.pdf")
      .expect(204);

    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(company.kbisFileName).toBe("kbis.pdf");
    // Un nouveau dépôt n'est jamais certifié tant que le staff ne l'a pas revalidé.
    expect(company.kbisCertifiedAt).toBeNull();
  });

  it("édite l'identité souple (enseigne + TVA)", async () => {
    await staff()
      .patch(`/admin/companies/${companyId}/identity`)
      .send({ enseigne: "Le Comptoir", tvaIntracom: "FR32812456789" })
      .expect(204);

    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(company.enseigne).toBe("Le Comptoir");
    expect(company.tvaIntracom).toBe("FR32812456789");

    // Une pièce posée par le STAFF (Porte B) franchit aussi l'étape (câblage staff→growth).
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if ((await ctx.prisma.activityEvent.count({ where: { type: "company.step_reached" } })) > 0) {
        break;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
    }
    const [step] = await ctx.prisma.activityEvent.findMany({
      where: { type: "company.step_reached" },
    });
    expect(step.idempotencyKey).toBe(`company.step_reached:tva:${companyId}`);
    expect(step.payload).toMatchObject({ step: "tva" });
  });

  it("fixe le règlement CONVENU et solde la demande client", async () => {
    // Le client a demandé net60 ; le staff convient net90 → convenu écrit, demande soldée.
    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { requestedPaymentTerm: PaymentTerm.net60 },
    });

    await staff()
      .patch(`/admin/companies/${companyId}/payment-term`)
      .send({ paymentTerm: "net90" })
      .expect(204);

    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(company.paymentTerm).toBe(PaymentTerm.net90);
    expect(company.requestedPaymentTerm).toBeNull();
  });

  it("enregistre l'adresse de facturation", async () => {
    await staff()
      .patch(`/admin/companies/${companyId}/billing-address`)
      .send({
        label: "Siège",
        ligne1: "18 rue des Archives",
        ligne2: "",
        codePostal: "75004",
        ville: "Paris",
        pays: "France",
      })
      .expect(204);

    const address = await ctx.prisma.address.findFirst({
      where: { companyId, kind: AddressKind.facturation },
    });
    expect(address?.ligne1).toBe("18 rue des Archives");
  });

  it("ajoute une adresse de livraison et renvoie son id", async () => {
    const response = await staff()
      .post(`/admin/companies/${companyId}/delivery-addresses`)
      .send(delivery)
      .expect(201);

    expect(response.body).toHaveProperty("id");
    const count = await ctx.prisma.address.count({
      where: { companyId, kind: AddressKind.livraison },
    });
    expect(count).toBe(1);
  });
});

describe("activation d'un compte (gate serveur)", () => {
  it("refuse l'activation si des pièces requises manquent (409)", async () => {
    // Défauts : tva + billing requises. La société pending n'a ni l'une ni l'autre.
    const response = await staff().post(`/admin/companies/${companyId}/activate`);
    expect(response.status).toBe(409);

    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(company.status).toBe(CompanyStatus.pending);
  });

  it("active quand les pièces requises sont présentes (kbis/livraison non requis)", async () => {
    // TVA renseignée + facturation présente ; KBIS optionnel et livraison cachée
    // par défaut ⇒ non requis. L'activation doit passer.
    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { tvaIntracom: "FR32812456789" },
    });
    await ctx.prisma.address.create({
      data: {
        companyId,
        kind: AddressKind.facturation,
        label: "Siège",
        ligne1: "18 rue des Archives",
        codePostal: "75004",
        ville: "Paris",
        pays: "France",
      },
    });

    await staff().post(`/admin/companies/${companyId}/activate`).expect(204);

    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(company.status).toBe(CompanyStatus.active);
    expect(company.activatedAt).not.toBeNull();
  });

  it("refuse d'activer un compte déjà actif (409)", async () => {
    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { status: CompanyStatus.active },
    });
    const response = await staff().post(`/admin/companies/${companyId}/activate`);
    expect(response.status).toBe(409);
  });
});
