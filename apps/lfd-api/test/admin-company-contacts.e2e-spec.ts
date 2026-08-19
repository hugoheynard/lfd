/**
 * E2E des **interlocuteurs d'une société vus par le staff** — une seule liste,
 * l'accès y étant un **état** de la personne et non une seconde liste.
 *
 * Ce que seul un vrai SQL prouve ici : que le rapprochement contact ↔ compte se
 * fait bien sur l'adresse (et survit à une casse différente), que le détenteur
 * sort en tête sans être une ligne du carnet, et que le rôle est refusé par la
 * frontière quand il manque — ou quand on tente d'en faire un second détenteur.
 */
import type { CompanyContactView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole, UserStatus } from "../src/platform/database/client/client.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

/** Staff doublé : accepte n'importe quel jeton porteur comme staff synthétique. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

/** La fiche, réduite à ce que cette suite éprouve. */
interface DetailBody {
  readonly contacts: readonly CompanyContactView[];
}

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
  // La fabrique pose `camille@test.fr` comme détenteur (contact principal).
  const company = await createCompany(ctx.prisma);
  companyId = company.id;
});

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

/** Les interlocuteurs de la société, tels que la fiche staff les rend. */
async function contactsOf(): Promise<readonly CompanyContactView[]> {
  const response = await staff().get(`/admin/companies/${companyId}`).expect(200);
  return jsonBody<DetailBody>(response).contacts;
}

const KARIM = {
  firstName: "Karim",
  lastName: "Benali",
  fonction: "Responsable achats",
  email: "achats@test.fr",
  phone: "06 12 88 54 30",
  role: "orders",
};

describe("la fiche rend UNE liste d'interlocuteurs", () => {
  it("met le détenteur en tête, sans en faire une ligne du carnet", async () => {
    const [holder] = await contactsOf();

    // `contactId: null` : le détenteur vit aplati sur la société. Lui inventer
    // un id le rendrait supprimable comme un contact ordinaire.
    expect(holder).toMatchObject({
      contactId: null,
      email: "camille@test.fr",
      role: "owner",
    });
  });

  it("dit `none` pour un interlocuteur qui n'a AUCUN accès", async () => {
    // Le cas le plus fréquent, et parfaitement légitime : le responsable
    // réception qui prend les livraisons n'a aucune raison de se connecter.
    await staff().post(`/admin/companies/${companyId}/contacts`).send(KARIM).expect(201);

    const karim = (await contactsOf()).find((contact) => contact.email === KARIM.email);

    expect(karim).toMatchObject({ access: "none", emailVerified: false, role: "orders" });
  });

  it("distingue l'invité (lien envoyé) de l'actif (mot de passe posé)", async () => {
    const invite = await createUser(ctx.prisma, {
      auth0Sub: "auth0|invite",
      email: "camille@test.fr",
      status: UserStatus.invited,
    });
    await attachTo(ctx.prisma, invite.id, companyId, CustomerRole.owner);

    const [holder] = await contactsOf();

    // `invited` n'est pas un détail technique : c'est la différence entre
    // renvoyer un lien et décrocher le téléphone.
    expect(holder).toMatchObject({ access: "invited", emailVerified: false });
  });

  it("rapproche le contact du compte MALGRÉ une casse différente", async () => {
    // L'adresse est la seule clé humaine commune entre un contact noté au
    // téléphone et une identité créée chez le fournisseur : la comparer telle
    // quelle ferait de `Camille@Test.fr` un inconnu.
    const active = await createUser(ctx.prisma, {
      auth0Sub: "auth0|actif",
      email: "Camille@TEST.fr",
      emailVerified: true,
    });
    await attachTo(ctx.prisma, active.id, companyId, CustomerRole.owner);

    const [holder] = await contactsOf();

    expect(holder).toMatchObject({ access: "active", emailVerified: true });
  });

  it("lit un compte DÉSACTIVÉ comme un absence d'accès", async () => {
    // La question posée à l'écran est « cette personne peut-elle entrer ? ».
    const off = await createUser(ctx.prisma, {
      auth0Sub: "auth0|off",
      email: "camille@test.fr",
      status: UserStatus.disabled,
    });
    await attachTo(ctx.prisma, off.id, companyId, CustomerRole.owner);

    const [holder] = await contactsOf();

    expect(holder).toMatchObject({ access: "none" });
  });
});

describe("le rôle d'un contact est exigé à la frontière", () => {
  it("refuse un contact SANS rôle", async () => {
    const sansRole = { ...KARIM, role: undefined };

    const response = await staff().post(`/admin/companies/${companyId}/contacts`).send(sansRole);

    expect(response.status).toBe(400);
  });

  it("refuse de faire un SECOND détenteur", async () => {
    // `owner` n'est pas attribué, il est constaté : l'offrir au choix laisserait
    // croire qu'une société peut en avoir deux.
    const response = await staff()
      .post(`/admin/companies/${companyId}/contacts`)
      .send({ ...KARIM, role: "owner" });

    expect(response.status).toBe(400);
  });

  it("écrit le rôle sur la vraie ligne SQL", async () => {
    await staff()
      .post(`/admin/companies/${companyId}/contacts`)
      .send({ ...KARIM, role: "billing" })
      .expect(201);

    const row = await ctx.prisma.companyContact.findFirstOrThrow({ where: { companyId } });
    expect(row.role).toBe(CustomerRole.billing);
  });

  it("REFUSE deux fois la même adresse dans le carnet", async () => {
    // Une personne, une adresse, un rôle : deux lignes donneraient deux rôles à
    // la même personne, et l'accès ouvert depuis l'une contredirait l'autre.
    // Tenu par la base — deux commerciaux simultanés passeraient une simple
    // vérification applicative.
    await staff().post(`/admin/companies/${companyId}/contacts`).send(KARIM).expect(201);

    const response = await staff()
      .post(`/admin/companies/${companyId}/contacts`)
      .send({ ...KARIM, firstName: "Karim (bis)" });

    expect(response.status).toBe(409);
  });

  it("REFUSE d'ajouter le détenteur au carnet", async () => {
    // Il y figure déjà, en tête de la fiche.
    const response = await staff()
      .post(`/admin/companies/${companyId}/contacts`)
      .send({ ...KARIM, email: "camille@test.fr" });

    expect(response.status).toBe(409);
  });

  it("aligne les DROITS RÉELS sur le rôle affiché", async () => {
    // Le rôle affiché est celui du contact ; les droits vivent sur le
    // rattachement. Les laisser diverger, c'est montrer « Commandes » à
    // quelqu'un qui administre l'espace.
    const created = await staff()
      .post(`/admin/companies/${companyId}/contacts`)
      .send(KARIM)
      .expect(201);
    const contactId = jsonBody<{ readonly id: string }>(created).id;
    const karim = await createUser(ctx.prisma, { auth0Sub: "auth0|karim", email: KARIM.email });
    await attachTo(ctx.prisma, karim.id, companyId, CustomerRole.orders);

    await staff()
      .patch(`/admin/companies/${companyId}/contacts/${contactId}`)
      .send({ ...KARIM, role: "admin" })
      .expect(200);

    const membership = await ctx.prisma.membership.findFirstOrThrow({
      where: { userId: karim.id, companyId },
    });
    expect(membership.role).toBe(CustomerRole.admin);
  });

  it("laisse le rôle à `null` sur un contact d'avant les rôles", async () => {
    // « À préciser » à l'écran. Le deviner propagerait une valeur inventée
    // qu'on ne saurait plus distinguer d'une vraie.
    await ctx.prisma.companyContact.create({
      data: {
        companyId,
        prenom: "Ancien",
        nom: "Contact",
        email: "ancien@test.fr",
        telephone: "",
      },
    });

    const legacy = (await contactsOf()).find((contact) => contact.email === "ancien@test.fr");

    expect(legacy?.role).toBeNull();
  });
});
