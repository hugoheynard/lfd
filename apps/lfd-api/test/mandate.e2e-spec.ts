/**
 * E2E du **mandat de prélèvement SEPA** côté staff.
 *
 * Ce que ces e2e éprouvent et que rien d'autre ne prouve : que la ligne SQL
 * s'écrit vraiment, que l'index partiel **un seul mandat actif par société**
 * tient sous une seconde tentative, que la révocation date sans effacer, et —
 * surtout — qu'**aucune réponse ne laisse sortir d'identifiant de moyen de
 * paiement**. Deux frontières doublées : le verifier staff et le prestataire
 * (Stripe). Le stockage objet est réel (MinIO) — le mandat signé part vraiment,
 * sous une clé qui porte la société ET le mandat.
 */
import type { MandateSectionView, PaymentMandateView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  MandateGateway,
  type MandateToRegister,
} from "../src/b2b/payments/domain/mandate-gateway.js";
import type { RegisteredMandate } from "../src/b2b/payments/domain/entities/payment-mandate.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

const PDF = Buffer.from("%PDF-1.4\nmandat signé", "latin1");

/** Staff doublé : accepte n'importe quel jeton porteur comme staff synthétique. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

/** Prestataire doublé : aucun appel réseau, mais la même forme de réponse. */
class FakeMandateGateway extends MandateGateway {
  readonly registered: MandateToRegister[] = [];
  readonly revoked: string[] = [];

  registerMandate(input: MandateToRegister): Promise<RegisteredMandate> {
    this.registered.push(input);
    return Promise.resolve({
      stripeCustomerId: input.existingCustomerId ?? "cus_e2e",
      paymentMethodId: input.paymentMethodId,
      reference: "RUM-E2E",
      last4: "3000",
      bankCode: "BNPA",
      country: "FR",
      status: "active",
    });
  }

  revokeMandate(paymentMethodId: string): Promise<void> {
    this.revoked.push(paymentMethodId);
    return Promise.resolve();
  }
}

let ctx: E2eContext;
let gateway: FakeMandateGateway;
let companyId: string;

beforeAll(async () => {
  gateway = new FakeMandateGateway();
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: MandateGateway, value: gateway },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  gateway.registered.length = 0;
  gateway.revoked.length = 0;
  const company = await createCompany(ctx.prisma);
  companyId = company.id;
});

/** Requête authentifiée en **staff** (le verifier doublé accepte le jeton). */
function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

async function registerMandate(): Promise<string> {
  const response = await staff()
    .post(`/admin/companies/${companyId}/mandate`)
    .send({ paymentMethodId: "pm_e2e" })
    .expect(201);
  return jsonBody<{ id: string }>(response).id;
}

describe("Mandat — enregistrement", () => {
  it("écrit la ligne et la rend lisible sur la fiche", async () => {
    await registerMandate();

    const response = await staff().get(`/admin/companies/${companyId}/mandate`).expect(200);
    const { mandate } = jsonBody<MandateSectionView>(response);

    expect(mandate?.status).toBe("active");
    expect(mandate?.reference).toBe("RUM-E2E");
    expect(mandate?.last4).toBe("3000");
    // Rien n'est encore prouvé : le scan du papier n'est pas déposé.
    expect(mandate?.hasProof).toBe(false);
  });

  it("ne laisse JAMAIS sortir l'identifiant du moyen de paiement", async () => {
    // C'est lui qui permet de débiter. La réponse doit permettre de reconnaître
    // le compte, pas de s'en servir.
    await registerMandate();

    const response = await staff().get(`/admin/companies/${companyId}/mandate`).expect(200);

    expect(JSON.stringify(response.body)).not.toContain("pm_e2e");
    expect(JSON.stringify(response.body)).not.toContain("cus_e2e");
  });

  it("REFUSE un second mandat tant que le premier est actif", async () => {
    await registerMandate();

    await staff()
      .post(`/admin/companies/${companyId}/mandate`)
      .send({ paymentMethodId: "pm_autre" })
      .expect(409);

    expect(gateway.registered).toHaveLength(1);
  });

  it("refuse une société inconnue sans appeler le prestataire", async () => {
    await staff()
      .post(`/admin/companies/fantome/mandate`)
      .send({ paymentMethodId: "pm_e2e" })
      .expect(404);

    expect(gateway.registered).toHaveLength(0);
  });

  it("refuse une date de signature dans le futur", async () => {
    await staff()
      .post(`/admin/companies/${companyId}/mandate`)
      .send({ paymentMethodId: "pm_e2e", acceptedAt: "2099-01-01T00:00:00.000Z" })
      .expect(400);
  });
});

describe("Mandat — révocation puis remplacement", () => {
  it("date la révocation, détache chez le prestataire, et rouvre la voie", async () => {
    await registerMandate();

    await staff().delete(`/admin/companies/${companyId}/mandate`).expect(204);

    expect(gateway.revoked).toEqual(["pm_e2e"]);
    const revoked = jsonBody<MandateSectionView>(
      await staff().get(`/admin/companies/${companyId}/mandate`).expect(200),
    );
    // Le mandat révoqué reste lisible : « aucun mandat » ferait croire qu'on n'a
    // jamais rien signé avec ce client.
    expect(revoked.mandate?.status).toBe("revoked");
    expect(revoked.mandate?.revokedAt).not.toBeNull();

    // Et un nouveau mandat peut alors être enregistré.
    await staff()
      .post(`/admin/companies/${companyId}/mandate`)
      .send({ paymentMethodId: "pm_nouveau" })
      .expect(201);
    expect(gateway.registered.at(-1)?.existingCustomerId).toBe("cus_e2e");
  });

  it("refuse de révoquer quand il n'y a rien à révoquer", async () => {
    await staff().delete(`/admin/companies/${companyId}/mandate`).expect(404);
  });
});

describe("Mandat — la preuve", () => {
  it("marque le mandat prouvé une fois le papier signé déposé", async () => {
    await registerMandate();

    await staff()
      .put(`/admin/companies/${companyId}/mandate/proof`)
      .attach("file", PDF, "mandat-signe.pdf")
      .expect(204);

    const response = await staff().get(`/admin/companies/${companyId}/mandate`).expect(200);
    const mandate = jsonBody<MandateSectionView>(response).mandate as PaymentMandateView;
    expect(mandate.hasProof).toBe(true);
    expect(mandate.proofFileName).toBe("mandat-signe.pdf");
  });

  it("refuse une pièce dont les octets ne sont pas une pièce", async () => {
    await registerMandate();

    await staff()
      .put(`/admin/companies/${companyId}/mandate/proof`)
      .attach("file", Buffer.from("MZ\x90\x00", "latin1"), "virus.pdf")
      .expect(400);
  });
});
