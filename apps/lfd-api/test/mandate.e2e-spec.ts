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
import { MandateGateway } from "../src/b2b/payments/domain/mandate-gateway.js";
import { MandateProofChangedError } from "../src/b2b/payments/domain/errors/mandate-proof-errors.js";
import { PaymentMandateRepository } from "../src/b2b/payments/domain/payment-mandate.repository.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";
import { storageKeys } from "./storage.js";

const PDF = Buffer.from("%PDF-1.4\nmandat signé", "latin1");
/**
 * La date portée par le papier — relative : l'agrégat la compare à l'horloge
 * (une date à venir est refusée), donc écrite en dur elle vieillirait mal.
 */
const ON_PAPER = daysAgo(3).slice(0, 10);

/** Staff doublé : accepte n'importe quel jeton porteur comme staff synthétique. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

/** Prestataire doublé : aucun appel réseau, mais la même forme de réponse. */
class FakeMandateGateway extends MandateGateway {
  readonly revoked: string[] = [];

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
  gateway.revoked.length = 0;
  const company = await createCompany(ctx.prisma);
  companyId = company.id;
});

/** Requête authentifiée en **staff** (le verifier doublé accepte le jeton). */
function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

/**
 * Sème un mandat **directement en base**, faute de route pour l'enregistrer.
 *
 * 🔴 La route `POST /admin/companies/:id/mandate` a été **supprimée** le
 * 2026-09-12 avec le canal Stripe. Ces e2e n'en éprouvaient pas seulement
 * l'écriture : ils tiennent aussi le dépôt de la preuve et la révocation, qui
 * servent le parcours DIRECT à venir. Les supprimer avec la route aurait rendu
 * deux chemins vivants à la couverture nulle.
 *
 * ⚠️ Écrire par Prisma contourne les invariants de l'agrégat — c'est la dette
 * que `test/factories.ts` porte déjà, et elle est acceptable ici parce que ce
 * que ces suites éprouvent est en AVAL de l'écriture. Elle se referme quand la
 * frappe de la RUM donne une vraie porte d'entrée.
 */
async function seedMandate(
  paymentMethodId = "pm_e2e",
  status: "active" | "draft" = "active",
): Promise<string> {
  const row = await ctx.prisma.paymentMandate.create({
    data: {
      scheme: "B2B",
      paymentType: "recurrent",
      companyId,
      stripeCustomerId: "cus_e2e",
      paymentMethodId,
      reference: "RUM-E2E",
      last4: "3000",
      bankCode: "BNPA",
      country: "FR",
      status,
      // Un brouillon n'est pas signé : il n'a pas de date de consentement.
      acceptedAt: status === "draft" ? null : new Date("2026-01-15T10:00:00.000Z"),
    },
    select: { id: true },
  });
  return row.id;
}

/**
 * 🔴 Le canal d'ENREGISTREMENT chez un prestataire reste fermé, et ce test est
 * le seul endroit où la fermeture est vérifiée de l'extérieur.
 *
 * ⚠️ **Il ne peut plus le vérifier par l'absence de route** — corrigé le
 * 2026-09-13, après un échec en e2e. `POST /admin/companies/:id/mandate` existe
 * de nouveau depuis le 2026-09-12 : elle **frappe** un mandat sous NOTRE ICS, et
 * n'enregistre rien chez personne. Le test attendait un 404 et recevait un 409.
 *
 * Ce qu'il éprouve désormais est le fait, pas le code de retour : ce qu'on lui
 * envoie du prestataire est **ignoré**, et aucun mandat n'en sort. C'est plus
 * robuste : un code de statut change avec la cause du refus, le fait ne change
 * pas.
 */
describe("Mandat — le canal d'enregistrement est fermé", () => {
  it("n'enregistre AUCUN mandat depuis un identifiant de prestataire", async () => {
    // La société n'a pas d'émetteur déclaré dans ce contexte : la frappe refuse
    // donc AVANT toute écriture. Ce qui est éprouvé ici n'est pas ce refus-là,
    // mais le fait qu'aucun `paymentMethodId` reçu ne devienne jamais un mandat.
    await staff().post(`/admin/companies/${companyId}/mandate`).send({ paymentMethodId: "pm_e2e" });

    const section = await staff().get(`/admin/companies/${companyId}/mandate`).expect(200);

    expect(jsonBody<MandateSectionView>(section).mandate).toBeNull();
  });

  it("rend le mandat semé, et ne laisse JAMAIS sortir de quoi débiter", async () => {
    // C'est l'identifiant de moyen de paiement qui permet de débiter. La réponse
    // doit permettre de reconnaître le compte, pas de s'en servir.
    await seedMandate();

    const response = await staff().get(`/admin/companies/${companyId}/mandate`).expect(200);
    const { mandate } = jsonBody<MandateSectionView>(response);

    expect(mandate?.status).toBe("active");
    expect(mandate?.reference).toBe("RUM-E2E");
    expect(mandate?.last4).toBe("3000");
    expect(mandate?.hasProof).toBe(false);
    expect(JSON.stringify(response.body)).not.toContain("pm_e2e");
    expect(JSON.stringify(response.body)).not.toContain("cus_e2e");
  });
});

describe("Mandat — révocation puis remplacement", () => {
  it("date la révocation, détache chez le prestataire, et rouvre la voie", async () => {
    await seedMandate();

    await staff().delete(`/admin/companies/${companyId}/mandate`).expect(204);

    expect(gateway.revoked).toEqual(["pm_e2e"]);
    const revoked = jsonBody<MandateSectionView>(
      await staff().get(`/admin/companies/${companyId}/mandate`).expect(200),
    );
    // Le mandat révoqué reste lisible : « aucun mandat » ferait croire qu'on n'a
    // jamais rien signé avec ce client.
    expect(revoked.mandate?.status).toBe("revoked");
    expect(revoked.mandate?.revokedAt).not.toBeNull();
  });

  it("refuse de révoquer quand il n'y a rien à révoquer", async () => {
    await staff().delete(`/admin/companies/${companyId}/mandate`).expect(404);
  });
});

describe("Mandat — la preuve", () => {
  it("marque le brouillon prouvé une fois le papier signé déposé", async () => {
    await seedMandate("pm_e2e", "draft");

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
    await seedMandate("pm_e2e", "draft");

    await staff()
      .put(`/admin/companies/${companyId}/mandate/proof`)
      .attach("file", Buffer.from("MZ\x90\x00", "latin1"), "virus.pdf")
      .expect(400);
  });

  /**
   * 🔴 Régression (2026-09-14) : un scan déposé sur un mandat ACTIF remplaçait
   * la pièce qu'on oppose en contestation. Refusé en 409, et rien ne bouge.
   */
  it("refuse le scan d'un mandat actif, et n'y attache rien", async () => {
    await seedMandate();

    await staff()
      .put(`/admin/companies/${companyId}/mandate/proof`)
      .attach("file", PDF, "mandat-signe.pdf")
      .expect(409);

    const response = await staff().get(`/admin/companies/${companyId}/mandate`).expect(200);
    const mandate = jsonBody<MandateSectionView>(response).mandate as PaymentMandateView;
    expect(mandate.hasProof).toBe(false);
  });

  it("refuse d'activer un brouillon dont le scan n'est pas déposé", async () => {
    const mandateId = await seedMandate("pm_e2e", "draft");

    await staff()
      .put(`/admin/companies/${companyId}/mandate/${mandateId}/signature`)
      // Aucune pièce : la révision n'a rien à désigner, le refus est l'absence de scan.
      .send({ signedAt: ON_PAPER, proofRevision: "sans-piece" })
      .expect(409);

    const response = await staff().get(`/admin/companies/${companyId}/mandate`).expect(200);
    expect((jsonBody<MandateSectionView>(response).mandate as PaymentMandateView).status).toBe(
      "draft",
    );
  });

  it("active le brouillon une fois son scan déposé", async () => {
    const mandateId = await seedMandate("pm_e2e", "draft");
    await staff()
      .put(`/admin/companies/${companyId}/mandate/proof`)
      .attach("file", PDF, "mandat-signe.pdf")
      .expect(204);

    await staff()
      .put(`/admin/companies/${companyId}/mandate/${mandateId}/signature`)
      .send({ signedAt: ON_PAPER, proofRevision: (await currentView()).proofRevision })
      .expect(204);

    const response = await staff().get(`/admin/companies/${companyId}/mandate`).expect(200);
    const mandate = jsonBody<MandateSectionView>(response).mandate as PaymentMandateView;
    expect(mandate.status).toBe("active");
    expect(mandate.hasProof).toBe(true);
  });
});

/** La vue du mandat courant — de quoi lire sa révision de pièce. */
async function currentView(): Promise<PaymentMandateView> {
  const response = await staff().get(`/admin/companies/${companyId}/mandate`).expect(200);
  return jsonBody<MandateSectionView>(response).mandate as PaymentMandateView;
}

/** Dépose un scan sur le brouillon de la société. */
async function deposit(fileName = "mandat-signe.pdf"): Promise<void> {
  await staff()
    .put(`/admin/companies/${companyId}/mandate/proof`)
    .attach("file", PDF, fileName)
    .expect(204);
}

/** Les pièces de mandat de la société dans le bucket réel. */
async function mandateObjects(): Promise<string[]> {
  return (await storageKeys()).filter((key) => key.startsWith(`companies/${companyId}/mandates/`));
}

async function factCount(type: string): Promise<number> {
  return ctx.prisma.activityEvent.count({ where: { type } });
}

/** Un RIB valide — le réécrire rend caduc le brouillon en cours. */
const RIB = {
  iban: "FR1420041010050500013M02606",
  bic: "CEPAFRPP751",
  holder: "Refuge du Col SARL",
  line1: "12 rue des Alpages",
  line2: "",
  postalCode: "73150",
  city: "Val d'Isère",
  countryCode: "FR",
};

/** Plan `documentation/comptabilite/plan-restes-du-mandat.md` §4 et §7 #3, #9. */
describe("Mandat — la purge des pièces jamais valides", () => {
  it("purge le scan remplacé d'un brouillon, et l'écrit au journal", async () => {
    await seedMandate("pm_e2e", "draft");
    await deposit("premier.pdf");
    const [first] = await mandateObjects();

    await deposit("second.pdf");

    const remaining = await mandateObjects();
    expect(remaining).toHaveLength(1);
    expect(remaining).not.toContain(first);
    const row = await ctx.prisma.paymentMandate.findFirstOrThrow({ where: { companyId } });
    expect(remaining).toEqual([row.proofStorageKey]);
    expect(await factCount("payment_mandate.proof_purged")).toBe(1);
    const fact = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { type: "payment_mandate.proof_purged" },
    });
    expect(JSON.stringify(fact.payload)).not.toContain("companies/");
  });

  it("purge le scan d'un brouillon devenu caduc", async () => {
    await seedMandate("pm_e2e", "draft");
    await deposit();

    await staff().put(`/admin/companies/${companyId}/bank-account`).send(RIB).expect(204);

    expect((await currentView()).status).toBe("revoked");
    expect(await mandateObjects()).toEqual([]);
    expect(await factCount("payment_mandate.proof_purged")).toBe(1);
  });

  it("garde le scan d'un mandat signé, même révoqué ensuite", async () => {
    const mandateId = await seedMandate("pm_e2e", "draft");
    await deposit();
    await staff()
      .put(`/admin/companies/${companyId}/mandate/${mandateId}/signature`)
      .send({ signedAt: ON_PAPER, proofRevision: (await currentView()).proofRevision })
      .expect(204);

    await staff().delete(`/admin/companies/${companyId}/mandate`).expect(204);

    expect(await mandateObjects()).toHaveLength(1);
    expect(await factCount("payment_mandate.proof_purged")).toBe(0);
  });

  it("refuse une signature sur une révision de pièce périmée", async () => {
    const mandateId = await seedMandate("pm_e2e", "draft");
    await deposit("premier.pdf");
    const read = (await currentView()).proofRevision;
    await deposit("second.pdf");

    const response = await staff()
      .put(`/admin/companies/${companyId}/mandate/${mandateId}/signature`)
      .send({ signedAt: ON_PAPER, proofRevision: read })
      .expect(409);

    expect(jsonBody<{ code: string }>(response).code).toBe("payments.mandate.proof_revision_stale");
    const view = await currentView();
    expect(view.status).toBe("draft");
    expect(view.proofRevision).not.toBe(read);
  });

  it("refuse une signature sans révision de pièce", async () => {
    const mandateId = await seedMandate("pm_e2e", "draft");
    await deposit();

    await staff()
      .put(`/admin/companies/${companyId}/mandate/${mandateId}/signature`)
      .send({ signedAt: ON_PAPER })
      .expect(400);
  });

  /**
   * Régression (plan §7 #3) : l'écriture de la pièce était inconditionnelle.
   * Un dépôt chargé avant une signature réécrivait le mandat activé, et la
   * purge qui suit détruisait sa pièce. Éprouvé contre le vrai SQL : le dépôt
   * lit le brouillon, la signature passe, puis le dépôt tente d'écrire.
   */
  it("un redépôt concurrent d'une signature ne détruit pas la pièce signée", async () => {
    const mandateId = await seedMandate("pm_e2e", "draft");
    await deposit();
    const signedView = await currentView();
    const repository = ctx.app.get(PaymentMandateRepository);
    const stale = await repository.findById(mandateId);
    if (stale === null) {
      throw new Error(`Le brouillon semé ${mandateId} est introuvable.`);
    }
    const previousKey = stale.proofStorageKey();

    await staff()
      .put(`/admin/companies/${companyId}/mandate/${mandateId}/signature`)
      .send({ signedAt: ON_PAPER, proofRevision: signedView.proofRevision })
      .expect(204);
    stale.attachProof({ storageKey: `${String(previousKey)}-concurrent`, fileName: "tardif.pdf" });

    await expect(repository.depositProof(stale, previousKey)).rejects.toBeInstanceOf(
      MandateProofChangedError,
    );
    const after = await currentView();
    expect(after).toMatchObject({ status: "active", proofRevision: signedView.proofRevision });
    expect(await mandateObjects()).toEqual([previousKey]);
  });
});
