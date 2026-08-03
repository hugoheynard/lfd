/**
 * E2E de la **création d'un compte depuis l'admin** (`POST /admin/companies`,
 * Porte B — « le commercial provisionne »).
 *
 * Ce que l'e2e éprouve et que rien d'autre ne prouve : que la société sort en
 * `pending`, **sans aucun membership** (le staff n'est pas le client), avec son
 * contact principal — fonction incluse — écrit sur la vraie ligne SQL, et que la
 * porte staff garde bien l'endpoint.
 *
 * Seule frontière doublée : la vérification de signature du jeton **staff**
 * (`AdminTokenVerifier`) — un tenant Auth0 distant, pas ce qu'on teste ici. Le
 * double **déclare** le porteur staff sans vérifier ; le reste (guard, bus,
 * domaine, SQL) est réel.
 */
import type { CreatedCompanyResponse } from "../src/account/http/companies.controller.js";
import { AdminTokenVerifier } from "../src/infra/auth/admin-token.verifier.js";
import { CompanyStatus } from "../src/infra/database/client/client.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

/** Staff doublé : accepte n'importe quel jeton porteur comme staff synthétique. */
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

/** Requête authentifiée en **staff** (le verifier doublé accepte le jeton). */
function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

const valide = {
  raisonSociale: "Café des Halles SAS",
  enseigne: "Le Comptoir des Halles",
  formeJuridique: "SAS",
  siret: "812 456 789 00021",
  tvaIntracom: "FR32812456789",
  primaryContact: {
    firstName: "Camille",
    lastName: "Rousseau",
    fonction: "Gérante",
    email: "camille@halles.fr",
    phone: "01 42 71 08 44",
  },
};

describe("POST /admin/companies", () => {
  it("crée une société pending SANS propriétaire, contact principal inclus", async () => {
    const created = await staff().post("/admin/companies").send(valide).expect(201);

    const company = await ctx.prisma.company.findUniqueOrThrow({
      where: { id: jsonBody<CreatedCompanyResponse>(created).id },
      include: { memberships: true },
    });

    expect(company.status).toBe(CompanyStatus.pending);
    // Le staff n'est pas le client : aucune appartenance posée à la création.
    expect(company.memberships).toEqual([]);
    // SIRET normalisé (14 chiffres) et contact — fonction comprise — écrits.
    expect(company.siret).toBe("81245678900021");
    expect(company.contactEmail).toBe("camille@halles.fr");
    expect(company.contactFonction).toBe("Gérante");
  });

  it("refuse un SIRET déjà enregistré (unicité globale)", async () => {
    await createCompany(ctx.prisma, { siret: "81245678900021" });

    const response = await staff().post("/admin/companies").send(valide);

    expect(response.status).toBe(409);
  });

  it("refuse un contact invalide (e-mail vide)", async () => {
    const response = await staff()
      .post("/admin/companies")
      .send({ ...valide, primaryContact: { ...valide.primaryContact, email: "" } });

    expect(response.status).toBe(400);
  });

  // La porte staff (401 sans jeton valide) est couverte par le test unitaire du
  // guard ; ici le bypass de dev est actif, donc l'endpoint ne peut pas la jouer.
});

/** Forme de la fiche détail (sous-ensemble éprouvé ici). */
interface AdminCompanyDetailBody {
  readonly id: string;
  readonly status: string;
  readonly vatNumberRequired: boolean;
  readonly addresses: { readonly billing: unknown; readonly deliveries: readonly unknown[] };
}

describe("GET /admin/companies/:id", () => {
  it("renvoie la fiche cross-tenant enrichie (TVA requise + adresses)", async () => {
    // La factory pose une SAS ⇒ assujettie à la TVA ; aucune adresse ⇒
    // facturation nulle, aucune livraison. `pending` : un dossier à compléter.
    const seed = await createCompany(ctx.prisma, { status: CompanyStatus.pending });

    const response = await staff().get(`/admin/companies/${seed.id}`).expect(200);
    const body = jsonBody<AdminCompanyDetailBody>(response);

    expect(body.id).toBe(seed.id);
    expect(body.status).toBe(CompanyStatus.pending);
    expect(body.vatNumberRequired).toBe(true);
    expect(body.addresses).toEqual({ billing: null, deliveries: [] });
  });

  it("répond 404 pour un id inconnu", async () => {
    const response = await staff().get("/admin/companies/company_inexistante");

    expect(response.status).toBe(404);
  });
});
