/**
 * E2E de la règle « **chaque audience ne reçoit que son information** » (Hugo,
 * 2026-11-01 ; `documentation/promotions/plan-chaque-audience-son-information.md`,
 * § 7.1) sur les deux routes de la carte de contact de la boutique.
 *
 * Une carte et un numéro par public, plus un numéro partagé. Chaque appel ne
 * reçoit qu'une carte et ses numéros, et la réponse SÉRIALISÉE ne porte
 * aucune clé par public : c'est le seul endroit où l'on voit ce qui part
 * réellement dans le réseau.
 */
import {
  type AudienceContactSettingsView,
  type ContactSettingsPayload,
  DEFAULT_CONTACT_SETTINGS,
} from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const ACTIVE = "auth0|contact-info-active";
const PENDING = "auth0|contact-info-pending";
const PERSO = "auth0|contact-info-perso";

const PRO_TITLE = "Une question pro ?";
const INDIVIDUAL_TITLE = "Une question ?";
const PRO_NUMBER = "04 79 00 00 01";
const SHARED_NUMBER = "04 79 00 00 02";
const INDIVIDUAL_NUMBER = "04 79 00 00 03";

/** Une clé par public, où qu'elle soit dans la réponse. */
const PER_AUDIENCE_KEY = /"(b2b|b2c|cards)"\s*:/u;

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
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

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

async function personIn(sub: string, status: CompanyStatus | null): Promise<void> {
  const user = await createUser(ctx.prisma, { auth0Sub: sub });
  if (status !== null) {
    const company = await createCompany(ctx.prisma, { status });
    await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  }
}

/** Un numéro par public, un partagé, et une carte titrée par public. */
async function seedCards(): Promise<void> {
  const phones = [
    ["b2b", PRO_NUMBER],
    ["both", SHARED_NUMBER],
    ["b2c", INDIVIDUAL_NUMBER],
  ] as const;
  for (const [index, [audience, number]] of phones.entries()) {
    await staff()
      .post("/admin/contact/phones")
      .send({
        label: { fr: audience, en: "", it: "" },
        audience,
        number,
        position: index,
        active: true,
      })
      .expect(201);
  }
  const title = (fr: string) => ({ fr, en: "", it: "" });
  const payload: ContactSettingsPayload = {
    cards: {
      b2b: { ...DEFAULT_CONTACT_SETTINGS.cards.b2b, title: title(PRO_TITLE) },
      b2c: { ...DEFAULT_CONTACT_SETTINGS.cards.b2c, title: title(INDIVIDUAL_TITLE) },
    },
  };
  await staff().put("/admin/contact/settings").send(payload).expect(204);
}

interface Served {
  readonly raw: string;
  readonly view: AudienceContactSettingsView;
}

async function served(path: string, sub: string | null = null): Promise<Served> {
  const agent = sub === null ? ctx.http() : ctx.asSub(sub);
  const response = await agent.get(path).expect(200);
  return { raw: response.text, view: jsonBody<AudienceContactSettingsView>(response) };
}

/** La carte des pros, et rien de celle des particuliers. */
function expectPros(answer: Served): void {
  expect(answer.raw).not.toMatch(PER_AUDIENCE_KEY);
  expect(answer.view.card.title.fr).toBe(PRO_TITLE);
  expect(answer.view.phones.map((phone) => phone.number)).toEqual([PRO_NUMBER, SHARED_NUMBER]);
  expect(answer.raw).not.toContain(INDIVIDUAL_TITLE);
  expect(answer.raw).not.toContain(INDIVIDUAL_NUMBER);
}

/** La carte des particuliers, et rien de celle des pros. */
function expectIndividuals(answer: Served): void {
  expect(answer.raw).not.toMatch(PER_AUDIENCE_KEY);
  expect(answer.view.card.title.fr).toBe(INDIVIDUAL_TITLE);
  expect(answer.view.phones.map((phone) => phone.number)).toEqual([
    SHARED_NUMBER,
    INDIVIDUAL_NUMBER,
  ]);
  expect(answer.raw).not.toContain(PRO_TITLE);
  expect(answer.raw).not.toContain(PRO_NUMBER);
}

describe("GET /contact-settings — public, une audience déclarée", () => {
  /**
   * Régression : la route publique servait les deux cartes et les numéros des
   * deux publics à n'importe quel anonyme (corrigé le 2026-11-01).
   */
  it("un visiteur ne reçoit que la carte des particuliers", async () => {
    await seedCards();
    expectIndividuals(await served("/contact-settings"));
  });

  it("?audience=pro : la vitrine pro reçoit la carte des pros, et elle seule", async () => {
    await seedCards();
    expectPros(await served("/contact-settings?audience=pro"));
  });

  it("?audience=pending est refusé (400) : une audience qui se déclare ne s'établit pas", async () => {
    await ctx.http().get("/contact-settings?audience=pending").expect(400);
    await ctx.http().get("/contact-settings?audience=b2c").expect(400);
  });
});

describe("GET /me/contact-settings — l'audience établie", () => {
  it("un pro d'une société active reçoit la carte des pros", async () => {
    await seedCards();
    await personIn(ACTIVE, CompanyStatus.active);
    expectPros(await served("/me/contact-settings", ACTIVE));
  });

  it("une société en attente reçoit la carte des particuliers, comme son message", async () => {
    await seedCards();
    await personIn(PENDING, CompanyStatus.pending);
    expectIndividuals(await served("/me/contact-settings", PENDING));
  });

  it("un particulier inscrit reçoit la carte des particuliers", async () => {
    await seedCards();
    await personIn(PERSO, null);
    expectIndividuals(await served("/me/contact-settings", PERSO));
  });

  it("un anonyme est refusé (401) : la route connectée ne se lit pas sans jeton", async () => {
    await ctx.http().get("/me/contact-settings").expect(401);
  });
});
