/**
 * E2E de la chaîne **compte** : éditer son profil, déclarer une entreprise.
 *
 * Ce sont les deux écritures de « Réglages → Mon profil » et de « Mes
 * entreprises ». Elles traversent le bus CQRS, le domaine et le vrai SQL — donc
 * les contraintes, la transaction société+rattachement, et le refus d'un SIRET
 * déjà pris.
 *
 * Le fournisseur d'identité (Auth0) est **doublé** : c'est un service distant,
 * et ce n'est pas lui qu'un e2e éprouve. Le double enregistre ses appels, ce qui
 * permet de vérifier la seule chose qui compte ici — que le changement d'e-mail
 * passe par lui, et dans le bon ordre.
 */
import { CustomerIdentityPort } from "../src/b2b/account/domain/ports/customer-identity.port.js";
import type { AccountView } from "../src/b2b/account/domain/ports/account.reader.js";
import type { CreatedCompanyResponse } from "../src/b2b/account/http/companies.controller.js";
import { CompanyStatus } from "../src/platform/database/client/client.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import type { ProvisionedIdentity } from "../src/platform/shared/identity/provisioned-identity.js";

const SUB = "auth0|compte";

/** Trace des propagations demandées au fournisseur d'identité. */
const emailChanges: { subject: string; email: string }[] = [];
/** Armé par un test pour simuler une panne du canal Auth0. */
let identityFails = false;

const identityDouble: CustomerIdentityPort = {
  provision: (): Promise<ProvisionedIdentity> =>
    Promise.resolve({ subject: "auth0|double", passwordSetupUrl: "https://exemple.test/mdp" }),
  issuePasswordLink: (): Promise<string> => Promise.resolve("https://exemple.test/mdp"),

  changeEmail(subject: string, email: string): Promise<void> {
    if (identityFails) {
      return Promise.reject(new Error("Auth0 indisponible (double e2e)"));
    }
    emailChanges.push({ subject, email });
    return Promise.resolve();
  },
};

let ctx: E2eContext;
let userId: string;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [{ token: CustomerIdentityPort, value: identityDouble }] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  emailChanges.length = 0;
  identityFails = false;
  const user = await createUser(ctx.prisma, {
    auth0Sub: SUB,
    email: "camille@ancienne.fr",
    firstName: "Camille",
    lastName: "Rousseau",
    phone: "",
  });
  userId = user.id;
});

describe("PATCH /me/profile", () => {
  it("enregistre le profil et renvoie le compte relu", async () => {
    const response = await ctx
      .asSub(SUB)
      .patch("/me/profile")
      .send({
        firstName: "  Camille  ",
        lastName: "Rousseau-Benali",
        email: "camille@ancienne.fr",
        phone: "01 42 71 08 44",
      })
      .expect(200);

    // Normalisation par le domaine : les espaces superflus ne franchissent pas
    // la frontière.
    expect(jsonBody<AccountView>(response).profile).toMatchObject({
      firstName: "Camille",
      lastName: "Rousseau-Benali",
      phone: "01 42 71 08 44",
    });
    const stored = await ctx.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(stored.lastName).toBe("Rousseau-Benali");
  });

  it("ne touche PAS au fournisseur d'identité quand l'e-mail ne change pas", async () => {
    // Un simple renommage ne doit pas déclencher une re-vérification d'adresse,
    // ni échouer quand le canal Auth0 est indisponible.
    identityFails = true;

    await ctx
      .asSub(SUB)
      .patch("/me/profile")
      .send({
        firstName: "Camille",
        lastName: "Rousseau",
        email: "CAMILLE@ancienne.FR", // même adresse, autre casse
        phone: "",
      })
      .expect(200);

    expect(emailChanges).toEqual([]);
  });

  it("propage un nouvel e-mail à Auth0 avant de l'écrire chez nous", async () => {
    await ctx
      .asSub(SUB)
      .patch("/me/profile")
      .send({
        firstName: "Camille",
        lastName: "Rousseau",
        email: "camille@nouvelle.fr",
        phone: "",
      })
      .expect(200);

    expect(emailChanges).toEqual([{ subject: SUB, email: "camille@nouvelle.fr" }]);
    const stored = await ctx.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(stored.email).toBe("camille@nouvelle.fr");
  });

  it("n'écrit RIEN chez nous si la propagation à Auth0 échoue", async () => {
    // L'invariant qui compte : sans ce refus, l'utilisateur se connecterait avec
    // son ancienne adresse tout en voyant la nouvelle affichée.
    identityFails = true;

    const response = await ctx.asSub(SUB).patch("/me/profile").send({
      firstName: "Camille",
      lastName: "Rousseau",
      email: "camille@nouvelle.fr",
      phone: "",
    });

    expect(response.status).toBe(500);
    const stored = await ctx.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(stored.email).toBe("camille@ancienne.fr");
  });

  it("refuse un e-mail déjà utilisé par un autre compte", async () => {
    await createUser(ctx.prisma, { auth0Sub: "auth0|autre", email: "occupe@client.fr" });

    const response = await ctx.asSub(SUB).patch("/me/profile").send({
      firstName: "Camille",
      lastName: "Rousseau",
      email: "occupe@client.fr",
      phone: "",
    });

    expect(response.status).toBe(409);
    expect(emailChanges).toEqual([]);
  });

  it("refuse un profil sans nom, et un téléphone qui n'en est pas un", async () => {
    const sansNom = await ctx
      .asSub(SUB)
      .patch("/me/profile")
      .send({ firstName: "Camille", lastName: "   ", email: "camille@ancienne.fr", phone: "" });
    expect(sansNom.status).toBe(400);

    const telInvalide = await ctx.asSub(SUB).patch("/me/profile").send({
      firstName: "Camille",
      lastName: "Rousseau",
      email: "camille@ancienne.fr",
      phone: "01 42",
    });
    expect(telInvalide.status).toBe(400);
  });
});

describe("POST /companies", () => {
  const valide = {
    raisonSociale: "Boulangerie du Marais SAS",
    enseigne: "Le Pain Quotidien du Marais",
    formeJuridique: "SAS",
    siret: "812 456 789 00021",
    tvaIntracom: "FR32812456789",
  };

  it("déclare l'entreprise, la laisse en attente, et fait du créateur son gestionnaire", async () => {
    const created = await ctx.asSub(SUB).post("/companies").send(valide).expect(201);

    const company = await ctx.prisma.company.findUniqueOrThrow({
      where: { id: jsonBody<CreatedCompanyResponse>(created).id },
      include: { memberships: true },
    });
    // Déclarée, pas cliente : l'activation reste commerciale.
    expect(company.status).toBe(CompanyStatus.pending);
    // SIRET normalisé : saisi espacé, stocké en 14 chiffres.
    expect(company.siret).toBe("81245678900021");
    // Le contact de la société est repris du profil du créateur, sans double saisie.
    expect(company).toMatchObject({ contactPrenom: "Camille", contactNom: "Rousseau" });
    expect(company.memberships).toEqual([expect.objectContaining({ userId, role: "owner" })]);
  });

  it("journalise company.declared via `self`, acteur customer (câblage account→growth)", async () => {
    const created = await ctx.asSub(SUB).post("/companies").send(valide).expect(201);
    const companyId = jsonBody<CreatedCompanyResponse>(created).id;

    for (let attempt = 0; attempt < 50; attempt += 1) {
      if ((await ctx.prisma.activityEvent.count({ where: { type: "company.declared" } })) > 0) {
        break;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
    }

    const [event] = await ctx.prisma.activityEvent.findMany({
      where: { type: "company.declared" },
    });
    expect(event!.subjectType).toBe("company");
    expect(event!.subjectId).toBe(companyId);
    expect(event!.actorType).toBe("customer");
    expect(event!.idempotencyKey).toBe(`company.declared:${companyId}`);
    expect(event!.payload).toMatchObject({ via: "self", ownerUserId: userId });
  });

  it("la fait apparaître dans le compte du créateur, et de personne d'autre", async () => {
    const created = await ctx.asSub(SUB).post("/companies").send(valide).expect(201);
    await createUser(ctx.prisma, { auth0Sub: "auth0|voisin", email: "voisin@client.fr" });

    const mine = await ctx.asSub(SUB).get("/me").expect(200);
    const voisin = await ctx.asSub("auth0|voisin").get("/me").expect(200);

    expect(jsonBody<AccountView>(mine).companies).toEqual([
      expect.objectContaining({
        id: jsonBody<CreatedCompanyResponse>(created).id,
        role: "owner",
      }),
    ]);
    expect(jsonBody<AccountView>(voisin).companies).toEqual([]);
  });

  it("refuse un SIRET dont la clé de contrôle est fausse (faute de frappe)", async () => {
    const response = await ctx
      .asSub(SUB)
      .post("/companies")
      .send({ ...valide, siret: "812 456 789 00028" });

    expect(response.status).toBe(400);
  });

  it("refuse un SIRET déjà enregistré", async () => {
    await createCompany(ctx.prisma, { siret: "81245678900021" });

    const response = await ctx.asSub(SUB).post("/companies").send(valide);

    expect(response.status).toBe(409);
  });

  it("refuse une déclaration sans ENSEIGNE — le nom d'usage", async () => {
    // La raison sociale, elle, peut manquer : un compte s'ouvre avant que les
    // papiers soient sur la table.
    const response = await ctx
      .asSub(SUB)
      .post("/companies")
      .send({ ...valide, enseigne: "  " });

    expect(response.status).toBe(400);
  });

  it("laisse une personne déclarer une seconde entreprise", async () => {
    // Le cas que l'ancien modèle interdisait : c'est lui qui donne un sens aux
    // onglets de « Mes entreprises ».
    const premiere = await createCompany(ctx.prisma, { raisonSociale: "Déjà là SAS" });
    await attachTo(ctx.prisma, userId, premiere.id);

    await ctx.asSub(SUB).post("/companies").send(valide).expect(201);

    const mine = await ctx.asSub(SUB).get("/me").expect(200);
    expect(jsonBody<AccountView>(mine).companies).toHaveLength(2);
  });
});
