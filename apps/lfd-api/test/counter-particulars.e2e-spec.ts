/**
 * E2E de la **saisie particulier au comptoir** (`/admin/counter/particulars`) —
 * plan `documentation/commandes/passation/commande-particulier-reglee-en-boutique.md`, § 3.
 *
 * Ce qui ne se prouve qu'ici : le SQL de la recherche et du refus des doublons
 * (normalisation de l'adresse et du téléphone, aucun motif `ILIKE`, exclusion
 * des membres d'une société). Seule la signature du jeton staff est doublée.
 */
import type { CounterParticularCard } from "@lfd/contracts";
import type request from "supertest";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createGuest, createUser } from "./factories.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

const ROUTE = "/admin/counter/particulars";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
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

/** Un vendeur du comptoir : il a le droit de passation de l'équipe. */
async function counterAgent(): Promise<request.Agent> {
  const sub = "staff-counter-particulars";
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: "Comptoir",
      email: "counter-particulars@lfc.test",
      role: "comptoir",
      status: "active",
      auth0Id: sub,
    },
  });
  return ctx.asSub(sub);
}

async function search(agent: request.Agent, q: string): Promise<readonly CounterParticularCard[]> {
  const response = await agent.get(ROUTE).query({ q }).expect(200);
  return jsonBody<readonly CounterParticularCard[]>(response);
}

describe("chercher un particulier", () => {
  it("distingue deux particuliers du même prénom par leurs coordonnées masquées", async () => {
    const agent = await counterAgent();
    await createGuest(ctx.prisma, {
      email: "jean.a@gmail.com",
      firstName: "Jean",
      phone: "06 11 11 11 11",
    });
    await createUser(ctx.prisma, {
      auth0Sub: "auth0|jean-b",
      email: "jean.b@orange.fr",
      firstName: "Jean",
      lastName: "Martin",
      phone: "+33 7 22 22 22 22",
    });

    const cards = await search(agent, "jean");

    expect(cards.map((c) => [c.maskedEmail, c.maskedPhone, c.connectable]).sort()).toEqual([
      ["j***@gmail.com", "06 •• •• •• 11", false],
      ["j***@orange.fr", "07 •• •• •• 22", true],
    ]);
  });

  it("trouve un téléphone saisi sous une autre graphie", async () => {
    const agent = await counterAgent();
    await createGuest(ctx.prisma, {
      email: "paul@x.fr",
      firstName: "Paul",
      phone: "06 12 34 56 78",
    });

    const cards = await search(agent, "+33 6 12 34");

    expect(cards.map((c) => c.firstName)).toEqual(["Paul"]);
  });

  it("n'expose pas le membre d'une société", async () => {
    const agent = await counterAgent();
    const company = await createCompany(ctx.prisma);
    const member = await createUser(ctx.prisma, {
      auth0Sub: "auth0|membre",
      email: "jean.pro@societe.fr",
      firstName: "Jean",
    });
    await attachTo(ctx.prisma, member.id, company.id);

    expect(await search(agent, "jean")).toEqual([]);
  });

  /** `_` vaut n'importe quel caractère sous `ILIKE` : il doit rester un caractère. */
  it("ne trouve pas jeanXdupont en cherchant jean_dupont", async () => {
    const agent = await counterAgent();
    await createGuest(ctx.prisma, {
      email: "jeanXdupont@x.fr",
      firstName: "Autre",
      phone: "0600000001",
    });

    expect(await search(agent, "jean_dupont")).toEqual([]);
  });

  it("refuse une saisie d'un caractère", async () => {
    const agent = await counterAgent();
    await agent.get(ROUTE).query({ q: "j" }).expect(400);
  });
});

describe("inscrire un particulier", () => {
  async function register(
    agent: request.Agent,
    body: { firstName: string; email: string; phone: string },
  ): Promise<request.Response> {
    return agent.post(ROUTE).set(INTENT_KEY, freshIntent()).send(body);
  }

  it("inscrit une fiche invitée, sans identité de connexion", async () => {
    const agent = await counterAgent();

    const response = await register(agent, {
      firstName: "Léa",
      email: "Lea@X.fr",
      phone: "0611223344",
    });

    expect(response.status).toBe(201);
    const { id } = jsonBody<{ id: string }>(response);
    const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({
      auth0Sub: null,
      email: "lea@x.fr",
      firstName: "Léa",
      phone: "0611223344",
    });
  });

  it("refuse l'adresse d'un particulier existant, écrite dans une autre casse", async () => {
    const agent = await counterAgent();
    await createGuest(ctx.prisma, {
      email: "lea@x.fr",
      firstName: "Léa",
      phone: "0611223344",
    });

    const response = await register(agent, {
      firstName: "Léa",
      email: " LEA@X.FR ",
      phone: "0799999999",
    });

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe(
      "account.counter_particular.contact_taken",
    );
    expect(await ctx.prisma.user.count()).toBe(1);
  });

  it("refuse le téléphone d'un particulier existant, formaté autrement", async () => {
    const agent = await counterAgent();
    await createGuest(ctx.prisma, { email: "lea@x.fr", firstName: "Léa", phone: "06 11 22 33 44" });

    const response = await register(agent, {
      firstName: "Lea",
      email: "autre@x.fr",
      phone: "+33 6 11 22 33 44",
    });

    expect(response.status).toBe(409);
    expect(await ctx.prisma.user.count()).toBe(1);
  });
});
