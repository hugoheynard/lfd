/**
 * E2E du **RIB d'une société cliente** côté staff.
 *
 * Ce que ces e2e éprouvent et que rien d'autre ne prouve :
 *
 * - que la colonne `iban_sealed` contient bien un **scellé**, et jamais l'IBAN —
 *   c'est la seule vérification qui regarde la vraie ligne SQL, et donc la seule
 *   qui puisse démentir le coffre ;
 * - qu'**aucune réponse d'API** ne laisse sortir un IBAN entier ;
 * - que `company_id` est réellement unique, donc qu'un second dépôt remplace au
 *   lieu d'empiler ;
 * - que le mur staff est en place.
 *
 * Une seule frontière doublée : le verifier staff. Le chiffrement est le VRAI —
 * la clé de repli hors production est une vraie clé AES-256.
 */
import { Buffer } from "node:buffer";

import type { CompanyBankAccountSectionView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

/** IBAN d'exemple de la documentation bancaire française — clé mod-97 correcte. */
const IBAN = "FR1420041010050500013M02606";
const OTHER_IBAN = "DE89370400440532013000";

const RIB = {
  iban: IBAN,
  bic: "CEPAFRPP751",
  holder: "Refuge du Col SARL",
  line1: "12 rue des Alpages",
  line2: "",
  postalCode: "73150",
  city: "Val d'Isère",
  countryCode: "FR",
};

/** Staff doublé : accepte n'importe quel jeton porteur comme staff synthétique. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

let ctx: E2eContext;
let companyId: string;

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
  const company = await createCompany(ctx.prisma);
  companyId = company.id;
});

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

describe("PUT /admin/companies/:id/bank-account", () => {
  it("enregistre le RIB et rend 204", async () => {
    await staff().put(`/admin/companies/${companyId}/bank-account`).send(RIB).expect(204);
  });

  /**
   * 🔴 LE test du coffre. Il lit la VRAIE ligne SQL : si l'IBAN y était en
   * clair, tout le reste passerait quand même — la relecture marcherait, la vue
   * serait juste, et personne ne s'en apercevrait.
   */
  it("écrit un scellé en base, jamais l'IBAN", async () => {
    await staff().put(`/admin/companies/${companyId}/bank-account`).send(RIB).expect(204);

    const row = await ctx.prisma.companyBankAccount.findUniqueOrThrow({ where: { companyId } });
    expect(row.ibanSealed).not.toContain(IBAN);
    expect(row.ibanSealed).not.toContain("20041010050500013M0260");
    // La forme du scellé : `v1.<empreinte>.<iv>.<tag>.<chiffré>`.
    expect(row.ibanSealed.split(".")).toHaveLength(5);
    expect(row.ibanSealed.startsWith("v1.")).toBe(true);
  });

  it("garde les quatre derniers en clair — l'écran en a besoin", async () => {
    await staff().put(`/admin/companies/${companyId}/bank-account`).send(RIB).expect(204);

    const row = await ctx.prisma.companyBankAccount.findUniqueOrThrow({ where: { companyId } });
    expect(row.ibanLast4).toBe("2606");
    // Le BIC n'est pas scellé : il désigne un établissement, pas un compte.
    expect(row.bic).toBe("CEPAFRPP751");
  });

  it("remplace au lieu d'empiler : un client a UN RIB", async () => {
    await staff().put(`/admin/companies/${companyId}/bank-account`).send(RIB).expect(204);
    await staff()
      .put(`/admin/companies/${companyId}/bank-account`)
      .send({ ...RIB, iban: OTHER_IBAN })
      .expect(204);

    const rows = await ctx.prisma.companyBankAccount.findMany({ where: { companyId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ibanLast4).toBe("3000");
  });

  it("refuse un IBAN dont la clé de contrôle ne tombe pas", async () => {
    await staff()
      .put(`/admin/companies/${companyId}/bank-account`)
      .send({ ...RIB, iban: "FR1420041010050500013M02607" })
      .expect(400);
  });

  /**
   * Régression : le message d'erreur recopiait l'IBAN refusé, et
   * `AppErrorFilter` rend le `message` d'une `DomainError` tel quel. Un IBAN
   * mal saisi est à un caractère du vrai (fix 2026-09-12).
   */
  it("ne renvoie PAS l'IBAN refusé dans le corps de l'erreur", async () => {
    const bad = "FR1420041010050500013M02607";
    const response = await staff()
      .put(`/admin/companies/${companyId}/bank-account`)
      .send({ ...RIB, iban: bad })
      .expect(400);

    expect(JSON.stringify(jsonBody(response))).not.toContain(bad);
  });

  it("refuse un RIB à moitié rempli", async () => {
    // Un compte incomplet ne se découvrirait qu'au rejet du lot.
    await staff()
      .put(`/admin/companies/${companyId}/bank-account`)
      .send({ ...RIB, bic: "" })
      .expect(400);
  });

  it("nomme la société inconnue plutôt que de rendre une erreur technique", async () => {
    await staff().put("/admin/companies/cmp_inexistante/bank-account").send(RIB).expect(404);
  });

  it("refuse un appel sans jeton", async () => {
    await ctx.http().put(`/admin/companies/${companyId}/bank-account`).send(RIB).expect(401);
  });
});

describe("GET /admin/companies/:id/bank-account", () => {
  it("rend null quand le client n'a jamais déposé de RIB", async () => {
    const response = await staff().get(`/admin/companies/${companyId}/bank-account`).expect(200);
    // Enveloppé : un `null` nu sortirait de Nest en corps VIDE, que le front
    // distinguerait mal d'une panne.
    expect(jsonBody<CompanyBankAccountSectionView>(response).account).toBeNull();
  });

  it("rend le bloc du RIB, et QUATRE caractères d'IBAN", async () => {
    await staff().put(`/admin/companies/${companyId}/bank-account`).send(RIB).expect(204);

    const response = await staff().get(`/admin/companies/${companyId}/bank-account`).expect(200);
    const { account } = jsonBody<CompanyBankAccountSectionView>(response);

    expect(account).toMatchObject({
      holder: "Refuge du Col SARL",
      addressLine1: "12 rue des Alpages",
      postalCode: "73150",
      city: "Val d'Isère",
      countryCode: "FR",
      bic: "CEPAFRPP751",
      last4: "2606",
    });
  });

  /** 🔴 Une réponse qui porterait un IBAN entier finit dans un journal d'accès. */
  it("ne laisse sortir l'IBAN sous AUCUNE forme", async () => {
    await staff().put(`/admin/companies/${companyId}/bank-account`).send(RIB).expect(204);

    const response = await staff().get(`/admin/companies/${companyId}/bank-account`).expect(200);
    const body = JSON.stringify(jsonBody(response));

    expect(body).not.toContain(IBAN);
    expect(body).not.toContain("20041010");
    // Ni le scellé, qui n'a rien à faire dehors non plus.
    expect(body).not.toContain("v1.");
  });

  it("refuse un appel sans jeton", async () => {
    await ctx.http().get(`/admin/companies/${companyId}/bank-account`).expect(401);
  });
});

describe("GET /admin/companies/:id/mandate/preview.pdf", () => {
  /** Une entité émettrice complète : identité, ICS, compte créancier. */
  async function declareIssuer(): Promise<void> {
    const response = await staff()
      .post("/admin/accounting/legal-entities")
      .send({
        name: "Crazeativity",
        legalForm: "SAS",
        siren: "900000001",
        rcs: "Chambéry",
        shareCapitalCents: 1_000_000,
        vatNumber: "",
        address: {
          line1: "Route de la Balme",
          line2: "",
          postalCode: "73150",
          city: "Val d'Isère",
          countryCode: "FR",
        },
      })
      .expect(201);
    const id = jsonBody<{ id: string }>(response).id;

    await staff()
      .put(`/admin/accounting/legal-entities/${id}/creditor-identifier`)
      .send({ ics: "FR00ZZZ900001" })
      .expect(204);
    await staff()
      .put(`/admin/accounting/legal-entities/${id}/creditor-account`)
      .send({
        iban: "FR7630006000011234567890189",
        bic: "CEPAFRPP751",
        holder: "Crazeativity",
        line1: "Route de la Balme",
        line2: "",
        postalCode: "73150",
        city: "Val d'Isère",
        countryCode: "FR",
      })
      .expect(204);
  }

  it("rend un PDF quand le client a un RIB et qu'une entité émet", async () => {
    await declareIssuer();
    await staff().put(`/admin/companies/${companyId}/bank-account`).send(RIB).expect(204);

    const response = await staff()
      .get(`/admin/companies/${companyId}/mandate/preview.pdf`)
      .expect(200)
      .expect("Content-Type", /application\/pdf/u);

    expect(
      Buffer.from(response.body as Buffer)
        .subarray(0, 5)
        .toString("latin1"),
    ).toBe("%PDF-");
  });

  it("nomme le fichier « apercu » — une liste de fichiers ne montre pas le filigrane", async () => {
    await declareIssuer();
    await staff().put(`/admin/companies/${companyId}/bank-account`).send(RIB).expect(204);

    const response = await staff()
      .get(`/admin/companies/${companyId}/mandate/preview.pdf`)
      .expect(200);

    expect(response.headers["content-disposition"]).toContain("apercu-mandat-sepa");
  });

  it("s'affiche dans l'onglet avec ?inline=1, se télécharge sans", async () => {
    await declareIssuer();
    await staff().put(`/admin/companies/${companyId}/bank-account`).send(RIB).expect(204);

    const inline = await staff()
      .get(`/admin/companies/${companyId}/mandate/preview.pdf?inline=1`)
      .expect(200);
    expect(inline.headers["content-disposition"]).toContain("inline");

    const attached = await staff()
      .get(`/admin/companies/${companyId}/mandate/preview.pdf?inline=0`)
      .expect(200);
    expect(attached.headers["content-disposition"]).toContain("attachment");
  });

  /**
   * Refuser plutôt que rendre un formulaire aux zones 5 et 6 vides : ce
   * document existe déjà, c'est le mandat d'EXEMPLE. En rendre un second, nommé
   * d'après un client, ferait croire qu'il lui est propre.
   */
  it("refuse quand le client n'a pas de RIB", async () => {
    await declareIssuer();
    await staff().get(`/admin/companies/${companyId}/mandate/preview.pdf`).expect(404);
  });

  it("refuse quand aucune entité n'émet", async () => {
    await staff().put(`/admin/companies/${companyId}/bank-account`).send(RIB).expect(204);
    await staff().get(`/admin/companies/${companyId}/mandate/preview.pdf`).expect(409);
  });

  it("refuse un appel sans jeton", async () => {
    await ctx.http().get(`/admin/companies/${companyId}/mandate/preview.pdf`).expect(401);
  });
});

describe("PUT /admin/companies/:id/mandate-options", () => {
  const OPTIONS = {
    debtorReference: "C-9P2X4B",
    contractNumber: "CT-42",
    contractDescription: "Fourniture de café",
  };

  it("pose les zones facultatives et les rend à la relecture", async () => {
    await staff().put(`/admin/companies/${companyId}/bank-account`).send(RIB).expect(204);
    await staff().put(`/admin/companies/${companyId}/mandate-options`).send(OPTIONS).expect(204);

    const response = await staff().get(`/admin/companies/${companyId}/bank-account`).expect(200);
    expect(jsonBody<CompanyBankAccountSectionView>(response).account).toMatchObject(OPTIONS);
  });

  it("les accepte toutes vides — la norme les dit indicatives", async () => {
    await staff().put(`/admin/companies/${companyId}/bank-account`).send(RIB).expect(204);
    await staff()
      .put(`/admin/companies/${companyId}/mandate-options`)
      .send({ debtorReference: "", contractNumber: "", contractDescription: "" })
      .expect(204);
  });

  /**
   * 🔴 Changer de banque ne change ni le contrat ni sa description. Les remettre
   * à zéro ferait perdre une saisie que personne n'a demandé à effacer.
   */
  it("survit au remplacement du RIB", async () => {
    await staff().put(`/admin/companies/${companyId}/bank-account`).send(RIB).expect(204);
    await staff().put(`/admin/companies/${companyId}/mandate-options`).send(OPTIONS).expect(204);
    await staff()
      .put(`/admin/companies/${companyId}/bank-account`)
      .send({ ...RIB, iban: OTHER_IBAN })
      .expect(204);

    const response = await staff().get(`/admin/companies/${companyId}/bank-account`).expect(200);
    const account = jsonBody<CompanyBankAccountSectionView>(response).account;
    expect(account?.contractNumber).toBe("CT-42");
    expect(account?.last4).toBe("3000");
  });

  it("refuse tant que le client n'a pas de RIB — ces zones vivent sur sa ligne", async () => {
    await staff().put(`/admin/companies/${companyId}/mandate-options`).send(OPTIONS).expect(404);
  });

  it("refuse un appel sans jeton", async () => {
    await ctx.http().put(`/admin/companies/${companyId}/mandate-options`).send(OPTIONS).expect(401);
  });
});
