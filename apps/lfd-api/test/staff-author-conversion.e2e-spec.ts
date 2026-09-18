/**
 * E2E de la **conversion des auteurs staff** — la migration
 * `20260918190000_conversion_des_auteurs_staff`, rejouée sur une base semée.
 * Plan : `documentation/staff/plan-l-auteur-est-la-fiche.md` — D5.2, D7,
 * étape 4, §5 « Conversion ».
 *
 * Ce que seul le vrai SQL prouve : qu'un `sub` connu de la table des `sub`
 * devient l'id de sa fiche dans une colonne, dans le journal et dans une charge
 * utile ; que rien d'autre ne bouge — marqueur, `sub` inconnu, id déjà écrit,
 * fait client, contenu empreinté du catalogue ; et que le rejeu est inoffensif.
 *
 * 🔴 Les lignes « forme ancienne » s'écrivent ici en Prisma direct, et c'est le
 * seul endroit où c'est légitime. Depuis l'étape 3 (`7fb2c985`), aucun chemin
 * du domaine n'écrit plus un `sub` comme auteur : le `sub` est sorti du type
 * après résolution (D2), et l'acteur est l'id de fiche (D1). Une donnée qu'on ne
 * peut plus produire, mais que la production CONTIENT, ne se sème que par la
 * base — c'est précisément elle que la migration doit traiter.
 *
 * Aucune date du calendrier : chaque instant est relatif à maintenant
 * (`daysAgo`).
 *
 * ⚠️ Rejouée SANS ses sept instructions sur les anciennes colonnes d'auteur
 * (`*_by_sub`, `staff_sub`) : l'étape 5C les a supprimées, et la base de test
 * est migrée jusqu'au bout. Ce qu'elles y avaient converti a été recopié dans
 * les nouvelles colonnes par 5A, 5B et 5C ; le reste de la conversion — une
 * cinquantaine de colonnes, les journaux — s'éprouve toujours ici.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  type E2eContext,
} from "./e2e-harness.js";

const MIGRATION = join(
  process.cwd(),
  "prisma/migrations/20260918190000_conversion_des_auteurs_staff/migration.sql",
);

/** Une seconde fiche : son `sub` actuel, et un `sub` qu'elle a porté avant. */
const LEA_ID = "fiche-lea";
const LEA_CURRENT_SUB = "auth0|lea-actuel";
const LEA_OLD_SUB = "auth0|lea-ancien";
const UNKNOWN_SUB = "auth0|jamais-relie";
const MARKERS = ["seed-pim", "system", "unknown-staff"] as const;
const TRACE = "0".repeat(31) + "1";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** Les anciennes colonnes d'auteur, supprimées par l'étape 5C. */
const DROPPED_COLUMNS = [
  "updated_by_sub",
  "created_by_sub",
  "kbis_certified_by_sub",
  "activated_by_sub",
  "staff_sub",
] as const;

/** Autant d'instructions de la migration visent une colonne supprimée. */
const STATEMENTS_ON_DROPPED_COLUMNS = 7;

function targetsDroppedColumn(statement: string): boolean {
  return DROPPED_COLUMNS.some((column) => statement.includes(`"${column}"`));
}

/**
 * Les instructions de la migration, dans l'ordre : commentaires `--` retirés,
 * découpées sur le `;` de fin de ligne. On éprouve CE SQL-là, pas une copie —
 * moins les instructions sur les colonnes que 5C a supprimées, et exactement
 * elles : un compte qui bouge fait échouer la suite plutôt que d'en retirer
 * davantage.
 */
function migrationStatements(): readonly string[] {
  const code = readFileSync(MIGRATION, "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  const statements = code
    .split(/;\s*$/m)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
  if (statements.length === 0 || !statements.every((s) => /^(INSERT|UPDATE)\b/.test(s))) {
    throw new Error("Découpage de la migration de conversion inattendu : relire le fichier.");
  }
  const kept = statements.filter((statement) => !targetsDroppedColumn(statement));
  if (statements.length - kept.length !== STATEMENTS_ON_DROPPED_COLUMNS) {
    throw new Error(
      `La conversion ne porte plus ${String(STATEMENTS_ON_DROPPED_COLUMNS)} instructions sur les colonnes supprimées : relire le fichier.`,
    );
  }
  return kept;
}

/** Joue la migration entière dans UNE transaction, comme `migrate deploy`. */
async function runConversion(): Promise<void> {
  const statements = migrationStatements();
  await ctx.prisma.$transaction(
    async (tx) => {
      for (const statement of statements) {
        await tx.$executeRawUnsafe(statement);
      }
    },
    { timeout: 30_000 },
  );
}

async function seedLea(): Promise<void> {
  await ctx.prisma.staffUser.create({
    data: {
      id: LEA_ID,
      firstName: "Léa",
      lastName: "Petit",
      email: "lea@lfc.test",
      role: "commercial",
      status: "active",
      auth0Id: LEA_CURRENT_SUB,
    },
  });
  // L'ancien `sub`, tel que la liaison l'a inscrit (D5.1). Le `sub` actuel,
  // lui, n'est PAS semé : c'est l'étape 0 de la migration qui doit le poser.
  await ctx.prisma.staffSubjectAlias.create({
    data: { sub: LEA_OLD_SUB, staffUserId: LEA_ID, source: "linked" },
  });
}

async function seedNotification(id: string, readBy: string): Promise<void> {
  await ctx.prisma.staffNotification.create({
    data: {
      id,
      kind: "alert.account",
      subject: "Alerte",
      body: "Une ligne",
      link: "/comptes-clients",
      idempotencyKey: `notification:${id}`,
      occurredAt: new Date(daysAgo(3)),
      readAt: new Date(daysAgo(2)),
      readBy,
    },
  });
}

async function readBy(id: string): Promise<string | null> {
  const row = await ctx.prisma.staffNotification.findUniqueOrThrow({ where: { id } });
  return row.readBy;
}

type Fact = {
  readonly id: string;
  readonly type: string;
  readonly actorType: "staff" | "customer";
  readonly actorId: string;
  readonly payload: Record<string, string>;
};

async function seedFact(fact: Fact): Promise<void> {
  await ctx.prisma.activityEvent.create({
    data: {
      ...fact,
      occurredAt: new Date(daysAgo(4)),
      subjectType: "order",
      subjectId: `order-${fact.id}`,
      actorName: "Nom figé",
      actorRole: "Rôle figé",
      traceId: TRACE,
      idempotencyKey: `${fact.type}:${fact.id}`,
    },
  });
}

async function fact(id: string) {
  return ctx.prisma.activityEvent.findUniqueOrThrow({ where: { id } });
}

async function seedPricingAct(id: string, actor: string): Promise<void> {
  await ctx.prisma.pricingEvent.create({
    data: {
      id,
      subjectType: "rule",
      subjectId: `rule-${id}`,
      act: "posed",
      actor,
      occurredAt: new Date(daysAgo(5)),
      summary: "Règle posée",
    },
  });
}

async function pricingActor(id: string): Promise<string> {
  return (await ctx.prisma.pricingEvent.findUniqueOrThrow({ where: { id } })).actor;
}

describe("la conversion — un `sub` connu devient l'id de sa fiche", () => {
  it("le `sub` ACTUEL, ré-inscrit par l'étape 0 alors que la table est vide", async () => {
    await seedNotification("n-current", E2E_STAFF_SUB);
    expect(await ctx.prisma.staffSubjectAlias.count()).toBe(0);

    await runConversion();

    expect(await readBy("n-current")).toBe(E2E_STAFF_ID);
    expect(
      await ctx.prisma.staffSubjectAlias.findUnique({ where: { sub: E2E_STAFF_SUB } }),
    ).toMatchObject({ staffUserId: E2E_STAFF_ID, source: "current" });
  });

  it("le journal, les deux clés de charge utile, le journal tarifaire", async () => {
    await seedFact({
      id: "f-ready",
      type: "order.ready",
      actorType: "staff",
      actorId: E2E_STAFF_SUB,
      payload: { readyBy: E2E_STAFF_SUB, orderNumber: "C-1" },
    });
    await seedFact({
      id: "f-handed",
      type: "order.handed_over",
      actorType: "staff",
      actorId: E2E_STAFF_SUB,
      payload: { handedOverBy: E2E_STAFF_SUB, orderNumber: "C-2" },
    });
    await seedPricingAct("p-current", E2E_STAFF_SUB);

    await runConversion();

    expect(await fact("f-ready")).toMatchObject({
      actorId: E2E_STAFF_ID,
      actorName: "Nom figé",
      actorRole: "Rôle figé",
      payload: { readyBy: E2E_STAFF_ID, orderNumber: "C-1" },
    });
    expect((await fact("f-handed")).payload).toEqual({
      handedOverBy: E2E_STAFF_ID,
      orderNumber: "C-2",
    });
    expect(await pricingActor("p-current")).toBe(E2E_STAFF_ID);
  });

  it("un `sub` ANCIEN, connu par la table, devient l'id de la même fiche", async () => {
    await seedLea();
    await seedNotification("n-old", LEA_OLD_SUB);
    await seedNotification("n-lea-now", LEA_CURRENT_SUB);
    await seedFact({
      id: "f-old",
      type: "order.ready",
      actorType: "staff",
      actorId: LEA_OLD_SUB,
      payload: { readyBy: LEA_OLD_SUB },
    });
    await seedPricingAct("p-old", LEA_OLD_SUB);

    await runConversion();

    expect(await readBy("n-old")).toBe(LEA_ID);
    expect(await readBy("n-lea-now")).toBe(LEA_ID);
    expect(await fact("f-old")).toMatchObject({ actorId: LEA_ID, payload: { readyBy: LEA_ID } });
    expect(await pricingActor("p-old")).toBe(LEA_ID);
  });
});

describe("la conversion — ce qui ne bouge pas", () => {
  it("un `sub` inconnu, un marqueur, un id de fiche déjà écrit restent tels quels", async () => {
    const kept = [UNKNOWN_SUB, ...MARKERS, E2E_STAFF_ID];
    for (const [index, value] of kept.entries()) {
      await seedNotification(`n-kept-${String(index)}`, value);
      await seedPricingAct(`p-kept-${String(index)}`, value);
    }
    await seedFact({
      id: "f-unknown",
      type: "order.ready",
      actorType: "staff",
      actorId: UNKNOWN_SUB,
      payload: { readyBy: UNKNOWN_SUB },
    });

    await runConversion();

    for (const [index, value] of kept.entries()) {
      expect(await readBy(`n-kept-${String(index)}`)).toBe(value);
      expect(await pricingActor(`p-kept-${String(index)}`)).toBe(value);
    }
    expect(await fact("f-unknown")).toMatchObject({
      actorId: UNKNOWN_SUB,
      payload: { readyBy: UNKNOWN_SUB },
    });
  });

  it("un fait CLIENT dont l'`actor_id` égale un `sub` n'est pas touché", async () => {
    await seedFact({
      id: "f-customer",
      type: "order.placed",
      actorType: "customer",
      actorId: E2E_STAFF_SUB,
      payload: { orderNumber: "C-3" },
    });

    await runConversion();

    expect(await fact("f-customer")).toMatchObject({
      actorType: "customer",
      actorId: E2E_STAFF_SUB,
      actorName: "Nom figé",
      actorRole: "Rôle figé",
    });
  });

  it("un contenu empreinté du catalogue garde son `sub` (D6)", async () => {
    const payload = { sku: "CAF-1", readyBy: E2E_STAFF_SUB };
    await ctx.prisma.catalogContent.create({ data: { hash: "empreinte-figee", payload } });

    await runConversion();

    const content = await ctx.prisma.catalogContent.findUniqueOrThrow({
      where: { hash: "empreinte-figee" },
    });
    expect(content.payload).toEqual(payload);
  });

  it("rejouer la conversion ne change rien", async () => {
    await seedLea();
    await seedNotification("n-a", E2E_STAFF_SUB);
    await seedNotification("n-b", LEA_OLD_SUB);
    await seedNotification("n-c", "seed-pim");
    await seedFact({
      id: "f-a",
      type: "order.handed_over",
      actorType: "staff",
      actorId: LEA_OLD_SUB,
      payload: { handedOverBy: LEA_CURRENT_SUB },
    });
    await seedPricingAct("p-a", E2E_STAFF_SUB);

    await runConversion();
    const snapshot = await everything();
    await runConversion();

    expect(await everything()).toEqual(snapshot);
    expect(snapshot.facts[0]).toMatchObject({ actorId: LEA_ID, payload: { handedOverBy: LEA_ID } });
  });
});

async function everything() {
  const [notifications, facts, acts, aliases] = await Promise.all([
    ctx.prisma.staffNotification.findMany({ orderBy: { id: "asc" } }),
    ctx.prisma.activityEvent.findMany({ orderBy: { id: "asc" } }),
    ctx.prisma.pricingEvent.findMany({ orderBy: { id: "asc" } }),
    ctx.prisma.staffSubjectAlias.findMany({ orderBy: { sub: "asc" } }),
  ]);
  return { notifications, facts, acts, aliases };
}
