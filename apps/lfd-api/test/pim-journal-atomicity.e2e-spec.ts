/**
 * E2E : **la trace conditionne l'écriture** — sur un vrai Postgres.
 *
 * C'est la seule preuve possible de la promesse faite par `UnitOfWork`. Les
 * tests unitaires montrent que le handler *appelle* le journal ; ils ne peuvent
 * rien dire de ce qui se passe quand l'append échoue, parce que le rollback
 * n'existe pas dans un double — il n'existe que dans une transaction Postgres.
 *
 * ## Pourquoi casser la TABLE plutôt que doubler le port
 *
 * Le harnais réserve les doubles aux frontières sortantes : doubler `PimJournal`
 * ferait retomber cette suite au rang de test d'intégration, et surtout ferait
 * échouer un **faux** journal. Ce qu'on veut éprouver est le vrai chemin —
 * l'append réel, dans la vraie table, dans la vraie transaction. On pose donc
 * une contrainte SQL qui refuse précisément l'événement attendu, et on regarde
 * ce que l'application fait d'un journal qui refuse.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const CATEGORIES = "/pim/catalogue/categories";
const PRODUCTS = "/pim/catalogue/products";
const IDENTITY_SAVED = "product.identity_saved";
const REFUSAL = "e2e_journal_en_panne";

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
  await repairJournal();
});

const staff = (): ReturnType<E2eContext["http"]> =>
  ctx.http().set("Authorization", "Bearer staff-e2e");

/** Le journal refuse d'écrire CE fait — une panne d'append, la vraie. */
async function breakJournal(): Promise<void> {
  await ctx.prisma.$executeRawUnsafe(
    `ALTER TABLE growth.activity_events
       ADD CONSTRAINT ${REFUSAL} CHECK (type <> '${IDENTITY_SAVED}') NOT VALID`,
  );
}

async function repairJournal(): Promise<void> {
  await ctx.prisma.$executeRawUnsafe(
    `ALTER TABLE growth.activity_events DROP CONSTRAINT IF EXISTS ${REFUSAL}`,
  );
}

async function seedProduct(): Promise<string> {
  const category = await staff()
    .post(CATEGORIES)
    .send({ name: { fr: "Pains" } });
  expect(category.status).toBe(201);
  const created = await staff()
    .post(PRODUCTS)
    .send({
      name: { fr: "Baguette" },
      kind: "daily",
      categoryId: jsonBody<{ id: string }>(category).id,
    });
  expect(created.status).toBe(201);
  return jsonBody<{ id: string }>(created).id;
}

async function readName(productId: string): Promise<string | undefined> {
  const response = await staff().get(`${PRODUCTS}/${productId}`);
  expect(response.status).toBe(200);
  return jsonBody<{ name: { fr?: string } }>(response).name.fr;
}

async function rename(productId: string, nameFr: string): Promise<number> {
  const response = await staff()
    .put(`${PRODUCTS}/${productId}/identity`)
    .send({ name: { fr: nameFr }, kind: "daily", categoryId: await categoryOf(productId) });
  return response.status;
}

async function categoryOf(productId: string): Promise<string> {
  const response = await staff().get(`${PRODUCTS}/${productId}`);
  return jsonBody<{ categoryId: string }>(response).categoryId;
}

async function journalCount(productId: string): Promise<number> {
  return ctx.prisma.activityEvent.count({
    where: { subjectType: "product", subjectId: productId, type: IDENTITY_SAVED },
  });
}

describe("le journal du référentiel conditionne l’écriture", () => {
  it("ANNULE la modification quand l’append échoue", async () => {
    const productId = await seedProduct();
    expect(await readName(productId)).toBe("Baguette");

    await breakJournal();
    const status = await rename(productId, "Baguette de tradition");

    // La requête échoue — et surtout, la fiche n'a pas bougé. C'est tout le
    // contrat : pas d'enregistrement sans trace, y compris quand la trace est
    // ce qui casse.
    expect(status).toBeGreaterThanOrEqual(500);
    expect(await readName(productId)).toBe("Baguette");
    expect(await journalCount(productId)).toBe(0);
  });

  it("écrit la fiche ET sa trace quand l’append passe", async () => {
    // Le miroir du test précédent : sans lui, un handler cassé qui n'écrirait
    // JAMAIS rien passerait le premier test avec les honneurs.
    const productId = await seedProduct();

    const status = await rename(productId, "Baguette de tradition");

    expect(status).toBe(200);
    expect(await readName(productId)).toBe("Baguette de tradition");
    expect(await journalCount(productId)).toBe(1);
  });

  it("laisse la base intacte : la panne réparée, l’enregistrement repasse", async () => {
    // Une transaction annulée ne doit pas laisser la connexion ou la fiche dans
    // un état bancal — l'écran suivant doit pouvoir réessayer.
    const productId = await seedProduct();
    await breakJournal();
    await rename(productId, "Tentative");
    await repairJournal();

    expect(await rename(productId, "Baguette de tradition")).toBe(200);
    expect(await readName(productId)).toBe("Baguette de tradition");
  });
});
