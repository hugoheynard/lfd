/**
 * E2E de la **recherche libre** du journal (`GET /admin/activity?q=`).
 *
 * Seul le vrai Postgres le prouve : la charge utile se lit en texte
 * (`payload::text ILIKE`), les jokers d'un `LIKE` sont échappés, et la
 * recherche se combine aux autres filtres dans UNE requête.
 *
 * Les faits de l'équipe sont écrits par la route réelle — l'auteur figé est
 * celui de l'adaptateur, pas une chaîne semée à la main. Un fait d'un autre
 * module, écrit hors requête (acteur `system`, sans nom), sert de témoin.
 *
 * Doublés, et eux seuls : le fournisseur d'identité et le courrier.
 */
import type { ActivityEventView, ActivityPageView, CreatedStaffUserResponse } from "@lfd/contracts";

import { ActivityRecorder } from "../src/b2b/growth/domain/ports/activity-recorder.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { StaffIdentityPort } from "../src/staff/invitations/staff-identity.port.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const stubIdentity = {
  provision: (input: { email: string }): Promise<{ subject: string; passwordSetupUrl: string }> =>
    Promise.resolve({
      subject: `auth0|${input.email}`,
      passwordSetupUrl: "https://tenant.invalid/ticket/neuf",
    }),
  issuePasswordLink: (): Promise<string> => Promise.resolve("https://tenant.invalid/ticket/renvoi"),
  changeEmail: (): Promise<void> => Promise.resolve(),
};

const silentMailer = {
  enabled: true,
  send: (): Promise<{ providerId: null }> => Promise.resolve({ providerId: null }),
};

/** Le numéro posé sur la fiche de Cécile — cherché ensuite par morceaux. */
const CECILE_PHONE = "0611223344";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: StaffIdentityPort, value: stubIdentity },
      { token: MAILER, value: silentMailer },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const operator = (): ReturnType<E2eContext["asSub"]> => ctx.asSub("staff-e2e");

async function createColleague(firstName: string, lastName: string): Promise<string> {
  const response = await operator()
    .post("/admin/staff-users")
    .send({ firstName, lastName, email: `${lastName.toLowerCase()}@lfc.test`, role: "commercial" })
    .expect(201);
  return jsonBody<CreatedStaffUserResponse>(response).id;
}

/**
 * Le type témoin, pris au catalogue des faits : le journal est strict sous le
 * harnais, et un type inventé y serait refusé. Il vit hors de l'équipe
 * (module `commercial`), et porte le nom cherché dans une valeur de sa charge.
 */
const WITNESS = "lead.captured";

/** Cécile (téléphone modifié), Paul, et un fait d'un autre module qui cite « Martin ». */
async function seedJournal(): Promise<{ cecile: string; paul: string }> {
  const cecile = await createColleague("Cécile", "Martin");
  const paul = await createColleague("Paul", "Durand");
  await operator()
    .patch(`/admin/staff-users/${cecile}`)
    .send({
      firstName: "Cécile",
      lastName: "Martin",
      email: "martin@lfc.test",
      phone: CECILE_PHONE,
      jobTitle: "",
      role: "commercial",
      overrides: [],
    })
    .expect(204);
  await ctx.app.get(ActivityRecorder).record({
    type: WITNESS,
    subjectType: "lead",
    subjectId: "company_witness",
    idempotencyKey: `${WITNESS}:1`,
    payload: { businessName: "Boulangerie Martin", email: "" },
  });
  await ctx.drain();
  return { cecile, paul };
}

/** Un fait témoin, hors équipe : un lead qui porte le nom cherché. */
let witnesses = 0;
async function witness(businessName: string): Promise<void> {
  witnesses += 1;
  await ctx.app.get(ActivityRecorder).record({
    type: WITNESS,
    subjectType: "lead",
    subjectId: `company_witness_${witnesses}`,
    idempotencyKey: `${WITNESS}:w${witnesses}`,
    payload: { businessName, email: "" },
  });
}

async function search(query: Record<string, string>): Promise<readonly ActivityEventView[]> {
  const response = await operator().get("/admin/activity").query(query).expect(200);
  return jsonBody<ActivityPageView>(response).events;
}

describe("la recherche du journal — un nom, un auteur, un numéro", () => {
  it("par le prénom d'une personne visée : ses faits, et eux seuls", async () => {
    const { cecile } = await seedJournal();

    const events = await search({ q: "Cécile" });

    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.subjectId === cecile)).toBe(true);
    expect(events.map((event) => event.type)).toContain("staff_user.identity_edited");
  });

  it("par le nom de l'auteur, casse ignorée : ses faits, pas ceux du système", async () => {
    await seedJournal();

    const events = await search({ q: "opérateur e2e" });

    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.actorName === "Opérateur E2E")).toBe(true);
    expect(events.some((event) => event.type === WITNESS)).toBe(false);
  });

  it("par un morceau de numéro de téléphone : l'édition qui l'a posé", async () => {
    const { cecile } = await seedJournal();

    const events = await search({ q: "2233" });

    expect(events.map((event) => [event.type, event.subjectId])).toEqual([
      ["staff_user.identity_edited", cecile],
    ]);
    expect(events[0]?.payload).toMatchObject({
      changes: [{ field: "phone", label: "téléphone", from: "", to: CECILE_PHONE }],
    });
  });

  it("insensible à la casse : « MARTIN » trouve Cécile Martin ET le témoin", async () => {
    const { cecile } = await seedJournal();

    const subjects = new Set((await search({ q: "MARTIN" })).map((event) => event.subjectId));

    expect(subjects).toEqual(new Set([cecile, "company_witness"]));
  });

  it("par l'identifiant exact du sujet", async () => {
    const { paul } = await seedJournal();

    const events = await search({ q: paul });

    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.subjectId === paul)).toBe(true);
  });
});

describe("la recherche du journal — combinée, bornée, sans joker", () => {
  it("se combine au module : « Martin » dans `equipe` écarte le témoin", async () => {
    const { cecile } = await seedJournal();

    const events = await search({ q: "Martin", module: "equipe" });

    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.subjectId === cecile)).toBe(true);
  });

  it("se combine aux dates, à la milliseconde : `since` inclus, `until` exclu", async () => {
    await seedJournal();
    const [edited] = await search({ q: "2233", type: "staff_user.identity_edited" });
    const at = edited?.occurredAt ?? "";

    expect((await search({ q: "2233", since: at })).map((event) => event.id)).toEqual([edited?.id]);
    expect(await search({ q: "2233", until: at })).toEqual([]);
  });

  it("se combine au curseur : les pages d'une recherche se suivent sans trou", async () => {
    const { cecile } = await seedJournal();
    const all = (await search({ q: "Cécile" })).map((event) => event.id);

    const walked: string[] = [];
    let before: string | null = null;
    do {
      const query: Record<string, string> = {
        q: "Cécile",
        limit: "1",
        ...(before === null ? {} : { before }),
      };
      const response = await operator().get("/admin/activity").query(query).expect(200);
      const page = jsonBody<ActivityPageView>(response);
      expect(page.events.every((event) => event.subjectId === cecile)).toBe(true);
      walked.push(...page.events.map((event) => event.id));
      before = page.nextBefore;
    } while (before !== null);

    expect(walked).toEqual(all);
  });

  /**
   * Un `%` ou un `_` tapé dans la barre est un caractère, pas un joker : non
   * échappés, « 06%44 » et « 061_223 » trouveraient tous deux le téléphone de
   * Cécile.
   */
  it("un `%` ou un `_` dans la recherche ne joue pas le joker", async () => {
    await seedJournal();

    expect(await search({ q: "06%44" })).toEqual([]);
    expect(await search({ q: "061_223" })).toEqual([]);
    expect(await search({ q: "%%" })).toEqual([]);
  });

  it("sans les accents : « cecile » trouve Cécile, en nom comme en charge", async () => {
    const { cecile } = await seedJournal();

    const subjects = new Set((await search({ q: "cecile" })).map((event) => event.subjectId));
    expect(subjects).toContain(cecile);
  });

  it("une majuscule accentuée se trouve sans accent, et l'inverse", async () => {
    await witness("Élan Boulanger");

    expect(await search({ q: "elan" })).toHaveLength(1);
    expect(await search({ q: "ÉLAN" })).toHaveLength(1);
    expect(await search({ q: "élan" })).toHaveLength(1);
  });

  it("ne lit que les VALEURS de la charge : une clé ne répond pas", async () => {
    await witness("Boulangerie Durand");

    expect(await search({ q: "businessName" })).toEqual([]);
    expect(await search({ q: "Durand" })).toHaveLength(1);
  });

  it("une valeur numérique se trouve", async () => {
    await ctx.app.get(ActivityRecorder).record({
      type: "reco.shown",
      subjectType: "lead",
      subjectId: "company_witness_score",
      idempotencyKey: "reco.shown:w-score",
      payload: { play: "nurture", score: 4817 },
    });

    expect(await search({ q: "4817" })).toHaveLength(1);
  });

  it("un guillemet ou une barre oblique dans une valeur ne casse rien", async () => {
    await witness('Le "Fournil" \\ Nord');

    expect(await search({ q: "fournil" })).toHaveLength(1);
    // Un guillemet cherché ne casse pas la requête — il part en paramètre.
    expect(await search({ q: '"Fo' })).toBeDefined();
  });

  it("refuse une recherche d'un seul caractère", async () => {
    await operator().get("/admin/activity").query({ q: " a " }).expect(400);
  });
});
