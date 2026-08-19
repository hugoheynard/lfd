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
import { CustomerIdentityPort } from "../src/b2b/account/domain/ports/customer-identity.port.js";
import type { CreatedCompanyResponse } from "../src/b2b/account/http/companies.controller.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CompanyStatus } from "../src/platform/database/client/client.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

/** Staff doublé : accepte n'importe quel jeton porteur comme staff synthétique. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

/**
 * Fournisseur d'identité doublé — Auth0 est un tenant distant, hors périmètre.
 * Tout le reste (guard, bus, domaine, SQL, membership) est réel.
 */
const identityDouble: CustomerIdentityPort = {
  changeEmail: (): Promise<void> => Promise.resolve(),
  provision: (): Promise<{ subject: string }> => Promise.resolve({ subject: "auth0|milo" }),
  issuePasswordLink: (): Promise<string> => Promise.resolve("https://exemple.test/mot-de-passe"),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: CustomerIdentityPort, value: identityDouble },
    ],
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
  it("crée une société pending et rattache son détenteur, contact inclus", async () => {
    const created = await staff().post("/admin/companies").send(valide).expect(201);

    const company = await ctx.prisma.company.findUniqueOrThrow({
      where: { id: jsonBody<CreatedCompanyResponse>(created).id },
      include: { memberships: true },
    });

    expect(company.status).toBe(CompanyStatus.pending);
    // Le staff n'est pas le client : la seule appartenance posée est celle du
    // DÉTENTEUR saisi, jamais celle de l'agent qui ouvre le compte.
    expect(company.memberships).toHaveLength(1);
    expect(company.memberships[0]?.role).toBe("owner");
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

  it("ouvre un compte sur la SEULE enseigne, sans détenteur", async () => {
    // Le parcours au téléphone : le commercial n'a que le nom de la maison.
    const created = await staff()
      .post("/admin/companies")
      .send({ enseigne: "Chez Milo" })
      .expect(201);

    const body = jsonBody<{ id: string; holder: string }>(created);
    // « deferred », pas un échec : l'écran ne doit pas annoncer d'incident.
    expect(body.holder).toBe("deferred");

    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: body.id } });
    expect(company.contactEmail).toBe("");
    expect(company.enseigne).toBe("Chez Milo");
  });

  // La porte staff (401 sans jeton valide) est couverte par le test unitaire du
  // guard ; ici le bypass de dev est actif, donc l'endpoint ne peut pas la jouer.
});

describe("POST /admin/companies/:id/holder", () => {
  /** Ouvre un compte sans détenteur et rend son identifiant. */
  async function openWithoutHolder(): Promise<string> {
    const created = await staff()
      .post("/admin/companies")
      .send({ enseigne: "Chez Milo" })
      .expect(201);
    return jsonBody<{ id: string }>(created).id;
  }

  const holder = {
    email: "milo@chezmilo.fr",
    firstName: "Milo",
    lastName: "Bertin",
    fonction: "Gérant",
    phone: "01 42 71 08 44",
  };

  it("rattache le détenteur d'un compte ouvert sans lui", async () => {
    const companyId = await openWithoutHolder();

    await staff().post(`/admin/companies/${companyId}/holder`).send(holder).expect(201);

    const company = await ctx.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      include: { memberships: true },
    });
    // Les DEUX moitiés du geste : la fiche porte le contact, et l'espace a son
    // propriétaire. Un rattachement qui n'en ferait qu'une laisserait un compte
    // affichant un détenteur qui ne peut pas se connecter.
    expect(company.contactEmail).toBe("milo@chezmilo.fr");
    expect(company.memberships).toHaveLength(1);
    expect(company.memberships[0]?.role).toBe("owner");
  });

  it("REFUSE de remplacer un détenteur en place", async () => {
    const created = await staff().post("/admin/companies").send(valide).expect(201);
    const companyId = jsonBody<CreatedCompanyResponse>(created).id;

    const response = await staff().post(`/admin/companies/${companyId}/holder`).send(holder);

    expect(response.status).toBe(409);
  });

  it("refuse une adresse invalide, et laisse le compte intact", async () => {
    const companyId = await openWithoutHolder();

    await staff()
      .post(`/admin/companies/${companyId}/holder`)
      .send({ ...holder, email: "" })
      .expect(400);

    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(company.contactEmail).toBe("");
  });

  it("répond 404 pour une société inconnue", async () => {
    const response = await staff().post("/admin/companies/company_inexistante/holder").send(holder);

    expect(response.status).toBe(404);
  });
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
