/**
 * E2E de la **reprise du journal de l'annuaire** — la migration
 * `20260918160000_reprise_du_journal_de_l_annuaire`, rejouée sur une base
 * semée. Plan : `documentation/staff/journalisation-staff/plan-reprise-du-journal-de-l-annuaire.md` §4.
 *
 * Ce que seul le vrai SQL prouve : que l'ULID fabriqué en SQL range chaque fait
 * à sa date — tri ET pagination de l'écran Journal, au milieu des faits vécus
 * que le code a écrits —, que le `NOT EXISTS` n'ajoute rien à une fiche déjà
 * journalisée, et que le rejeu est inoffensif.
 *
 * Aucune date du calendrier : chaque instant est relatif à maintenant
 * (`daysAgo`). La migration ne compare rien à l'horloge, mais l'écran si.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ActivityEventView, ActivityPageView, CreatedStaffUserResponse } from "@lfd/contracts";
import { decodeTime, ulid } from "ulid";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { StaffIdentityPort } from "../src/staff/invitations/staff-identity.port.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";

const MIGRATION = join(
  process.cwd(),
  "prisma/migrations/20260918160000_reprise_du_journal_de_l_annuaire/migration.sql",
);

const ROOT_EMAIL = "dev@lafoliedouce.com";
const SOURCE = "reprise attestée par Hugo le 2026-09-18";
const KEY_SUFFIX = ":reprise-2026-09-18";
const CROCKFORD_ULID = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;
const SECOND = 1000;

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};
const stubIdentity = {
  provision: (input: { email: string }): Promise<{ subject: string; passwordSetupUrl: string }> =>
    Promise.resolve({ subject: `auth0|${input.email}`, passwordSetupUrl: "https://t.invalid/n" }),
  issuePasswordLink: (): Promise<string> => Promise.resolve("https://t.invalid/r"),
  changeEmail: (): Promise<void> => Promise.resolve(),
};
const silentMailer = { enabled: true, send: () => Promise.resolve({ providerId: null }) };

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

/** L'unique instruction de la migration : on éprouve CE SQL-là. */
function backfillStatement(): string {
  const sql = readFileSync(MIGRATION, "utf8");
  const start = sql.indexOf("WITH sheets AS");
  const end = sql.lastIndexOf(";");
  if (start < 0 || end < start) {
    throw new Error("Instruction de reprise introuvable dans la migration.");
  }
  return sql.slice(start, end);
}

async function runBackfill(): Promise<number> {
  return ctx.prisma.$executeRawUnsafe(backfillStatement());
}

type Sheet = {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly role: "admin" | "commercial" | "support";
  readonly createdAt: Date;
  readonly invitedAt?: Date;
};

async function seedSheet(sheet: Sheet): Promise<string> {
  const row = await ctx.prisma.staffUser.create({ data: sheet, select: { id: true } });
  return row.id;
}

const DAY = 24 * 60 * 60 * SECOND;
/** Un seul « maintenant » par fichier : deux appels à `at(40)` rendent le même instant. */
const NOW = Date.parse(daysAgo(0));
const at = (daysBack: number, plusMs = 0): Date => new Date(NOW - daysBack * DAY + plusMs);

const seedRoot = (): Promise<string> =>
  seedSheet({
    firstName: "Admin",
    lastName: "La Folie Coffee",
    email: ROOT_EMAIL,
    role: "admin",
    createdAt: at(40),
  });

/** Un fait VÉCU à une date passée, identifié comme le fait `UlidGenerator`. */
async function livedFact(subjectId: string, occurredAt: Date): Promise<void> {
  await ctx.prisma.activityEvent.create({
    data: {
      id: ulid(occurredAt.getTime()),
      type: "staff_user.role_changed",
      occurredAt,
      subjectType: "staff_user",
      subjectId,
      actorType: "staff",
      traceId: "0".repeat(31) + "1",
      idempotencyKey: `staff_user.role_changed:${subjectId}:${String(occurredAt.getTime())}`,
      payload: {
        person: { firstName: "x", lastName: "y" },
        fromLabel: "Support",
        toLabel: "Commercial",
      },
    },
  });
}

async function backfilled() {
  return ctx.prisma.activityEvent.findMany({
    where: { idempotencyKey: { endsWith: KEY_SUFFIX } },
    orderBy: { id: "asc" },
  });
}

async function createByRoute(email: string): Promise<string> {
  const response = await ctx
    .asSub("staff-e2e")
    .post("/admin/staff-users")
    .send({ firstName: "Cécile", lastName: "Martin", email, role: "commercial" })
    .expect(201);
  await ctx.drain();
  return jsonBody<CreatedStaffUserResponse>(response).id;
}

describe("la reprise — ce qui est écrit, et par qui", () => {
  it("la racine par le système, les autres par la racine, charges exactes", async () => {
    const root = await seedRoot();
    const quick = await seedSheet({
      firstName: "Léa",
      lastName: "Petit",
      email: "lea@lfc.test",
      role: "commercial",
      createdAt: at(30),
      invitedAt: at(30, 2 * SECOND),
    });
    const late = await seedSheet({
      firstName: "Paul",
      lastName: "Durand",
      email: "paul@lfc.test",
      role: "support",
      createdAt: at(20),
      invitedAt: at(10),
    });

    await runBackfill();

    const rows = await backfilled();
    const about = (id: string) => rows.filter((row) => row.subjectId === id);
    expect(about(root)).toEqual([
      expect.objectContaining({
        type: "staff_user.created",
        actorType: "system",
        actorId: null,
        actorName: null,
        actorRole: null,
        occurredAt: at(40),
      }),
    ]);
    expect(about(quick).map((row) => row.type)).toEqual([
      "staff_user.created",
      "staff_user.invited",
    ]);
    expect(about(quick)[1]).toMatchObject({
      actorType: "staff",
      actorId: null,
      actorName: "Admin La Folie Coffee",
      actorRole: "Administrateur",
      occurredAt: at(30, 2 * SECOND),
      idempotencyKey: `staff_user.invited:${quick}${KEY_SUFFIX}`,
      payload: {
        person: { firstName: "Léa", lastName: "Petit" },
        kind: "invitation",
        backfilled: true,
        source: SOURCE,
      },
    });
    expect(about(quick)[0]!.payload).toEqual({
      person: { firstName: "Léa", lastName: "Petit" },
      roleLabel: "Commercial",
      backfilled: true,
      source: SOURCE,
    });
    // Invitée dix jours après : c'est le DERNIER envoi, pas celui de la création.
    expect(about(late).map((row) => row.type)).toEqual(["staff_user.created"]);
    expect(rows.every((row) => row.traceId.match(/^[0-9a-f]{32}$/) !== null)).toBe(true);
  });

  /**
   * La route fige `invited_at` à l'instant de la REQUÊTE (`Clock`), avant
   * l'INSERT qui pose `created_at` : l'invitation de la création précède donc
   * la création de quelques millisecondes (29 ms mesurées le 2026-09-18). Une
   * fenêtre « entre 0 et 60 s après » n'en aurait repris aucune.
   */
  it("reprend une fiche créée par la route, son invitation comprise — les vrais horodatages", async () => {
    await seedRoot();
    const id = await createByRoute("cecile@lfc.test");
    await ctx.prisma.activityEvent.deleteMany({ where: { subjectId: id } });

    await runBackfill();

    const mine = (await backfilled()).filter((row) => row.subjectId === id);
    expect(mine.map((row) => row.type).sort()).toEqual([
      "staff_user.created",
      "staff_user.invited",
    ]);
    // Régression (2026-09-18) : datée de `invited_at` telle quelle, l'invitation
    // se rangeait AVANT la création, et l'écran les montrait à l'envers.
    const created = mine.find((row) => row.type === "staff_user.created")!;
    const invited = mine.find((row) => row.type === "staff_user.invited")!;
    expect(invited.occurredAt.getTime()).toBeGreaterThan(created.occurredAt.getTime());
    expect(invited.id > created.id).toBe(true);
  });

  it("ignore une fiche déjà journalisée, et un second passage n'ajoute rien", async () => {
    await seedRoot();
    const lived = await createByRoute("cecile@lfc.test");

    await runBackfill();
    const first = await ctx.prisma.activityEvent.count();
    await runBackfill();

    expect((await backfilled()).some((row) => row.subjectId === lived)).toBe(false);
    expect(await ctx.prisma.activityEvent.count({ where: { subjectId: lived } })).toBe(2);
    expect(await ctx.prisma.activityEvent.count()).toBe(first);
  });

  it("sans fiche racine, rien n'est repris — et rien n'échoue (D6)", async () => {
    await seedSheet({
      firstName: "Léa",
      lastName: "Petit",
      email: "lea@lfc.test",
      role: "commercial",
      createdAt: at(30),
      invitedAt: at(30, SECOND),
    });

    await expect(runBackfill()).resolves.toBe(0);
    expect(await backfilled()).toEqual([]);
  });
});

describe("la reprise — rangée à sa date", () => {
  async function seedTimeline(): Promise<void> {
    await seedRoot();
    const quick = await seedSheet({
      firstName: "Léa",
      lastName: "Petit",
      email: "lea@lfc.test",
      role: "commercial",
      createdAt: at(30),
      invitedAt: at(30, 2 * SECOND),
    });
    const late = await seedSheet({
      firstName: "Paul",
      lastName: "Durand",
      email: "paul@lfc.test",
      role: "support",
      createdAt: at(20),
    });
    await livedFact(quick, at(35));
    await livedFact(quick, at(25));
    await livedFact(late, at(15));
    await createByRoute("cecile@lfc.test");
    await runBackfill();
  }

  it("des ULID de 26 caractères Crockford majuscules, préfixés de l'instant exact", async () => {
    await seedTimeline();

    const rows = await backfilled();
    expect(rows.length).toBeGreaterThanOrEqual(4);
    for (const row of rows) {
      expect(row.id).toMatch(CROCKFORD_ULID);
      expect(decodeTime(row.id)).toBe(row.occurredAt.getTime());
    }
  });

  it("le tri par `id` est celui de `occurred_at`, faits vécus intercalés compris", async () => {
    await seedTimeline();

    const all = await ctx.prisma.activityEvent.findMany({ orderBy: { id: "asc" } });
    const times = all.map((row) => row.occurredAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    // Intercalés pour de bon : un vécu entre deux repris, et l'inverse.
    const kinds = all.map((row) => (row.idempotencyKey.endsWith(KEY_SUFFIX) ? "r" : "v")).join("");
    expect(kinds).toMatch(/r+v+r+v+/);
  });

  it("l'écran Journal les rend à leur place, page après page", async () => {
    await seedTimeline();
    // Le temps d'abord ; l'`id` ne départage que deux faits du même instant.
    const expected = (
      await ctx.prisma.activityEvent.findMany({ orderBy: [{ occurredAt: "desc" }, { id: "desc" }] })
    ).map((row) => row.id);

    const walked: ActivityEventView[] = [];
    let before: string | null = null;
    do {
      const query: Record<string, string> = { limit: "2", ...(before === null ? {} : { before }) };
      const response = await ctx.asSub("staff-e2e").get("/admin/activity").query(query).expect(200);
      const page = jsonBody<ActivityPageView>(response);
      walked.push(...page.events);
      before = page.nextBefore;
    } while (before !== null);

    expect(walked.map((event) => event.id)).toEqual(expected);
    const rootLine = walked.find((event) => event.actorType === "system");
    expect(rootLine).toMatchObject({
      type: "staff_user.created",
      actorName: null,
      module: "equipe",
    });
    expect(rootLine?.payload).toMatchObject({ backfilled: true, source: SOURCE });
  });
});
