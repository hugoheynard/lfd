/**
 * E2E du **journal d'événements** — sur un vrai Postgres (schéma `growth`).
 *
 * Ce que seul le vrai SQL prouve : l'écriture dans `growth.activity_events`
 * (schéma dédié), l'**idempotence** par `idempotency_key` (@unique → une émission
 * rejouée n'ajoute rien), et la dérivation du contexte. Hors requête HTTP, le
 * recorder retombe sur l'acteur `system` + une trace neuve — c'est ce qu'on
 * vérifie ici (les émetteurs réels, en requête, porteront customer/staff).
 */
import { ActivityRecorder } from "../src/b2b/growth/domain/ports/activity-recorder.js";
import { ActorNamer } from "../src/b2b/growth/domain/ports/actor-namer.js";
import { PrismaActivityRecorder } from "../src/b2b/growth/infrastructure/prisma-activity-recorder.js";
import { PrismaService } from "../src/platform/database/prisma.service.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { IdGenerator } from "../src/platform/id/id-generator.js";
import { JournalFactCheck } from "../src/platform/journal/journal-fact-check.js";
import { Clock } from "../src/platform/time/clock.js";
import type { RecordActivityInput } from "../src/b2b/growth/domain/activity-event.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";

let ctx: E2eContext;
let recorder: ActivityRecorder;

beforeAll(async () => {
  ctx = await bootstrapE2e();
  recorder = ctx.app.get(ActivityRecorder);
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** Une charge conforme au catalogue des faits : le journal est strict sous le harnais. */
const PLACED = { orderId: "order_1", orderNumber: "CMD-0001", companyId: null, totalCents: 4200 };

function input(overrides: Partial<RecordActivityInput> = {}): RecordActivityInput {
  return {
    type: "order.placed",
    subjectType: "user",
    subjectId: "user_1",
    idempotencyKey: "order.placed:order_1",
    payload: PLACED,
    ...overrides,
  };
}

describe("journal activity_events (e2e SQL)", () => {
  it("append une ligne dans growth.activity_events avec le contexte dérivé", async () => {
    await recorder.record(input());

    const rows = await ctx.prisma.activityEvent.findMany();
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row!.type).toBe("order.placed");
    expect(row!.subjectType).toBe("user");
    expect(row!.subjectId).toBe("user_1");
    expect(row!.actorType).toBe("system"); // hors requête HTTP → fallback
    expect(row!.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(row!.schemaVersion).toBe(1);
    expect(row!.establishmentId).toBeNull();
    expect(row!.payload).toEqual(PLACED);
    expect(row!.id).toHaveLength(26); // ULID
    expect(row!.recordedAt).toBeInstanceOf(Date);
  });

  it("est idempotent : deux émissions de même idempotencyKey → une seule ligne", async () => {
    await recorder.record(input());
    await recorder.record(input());
    expect(await ctx.prisma.activityEvent.count()).toBe(1);
  });

  it("journalise des faits distincts sous des clés différentes", async () => {
    await recorder.record(input({ idempotencyKey: "k1" }));
    await recorder.record(input({ idempotencyKey: "k2", subjectId: "user_2" }));
    expect(await ctx.prisma.activityEvent.count()).toBe(2);
  });

  /**
   * Régression : le doublon était attrapé APRÈS l'échec de l'`INSERT` (P2002
   * avalé). Hors transaction, c'est inoffensif ; DANS une `UnitOfWork`, l'échec
   * met la transaction Postgres en état d'échec — toute requête suivante est
   * refusée et le commit devient un rollback. Le geste que le `catch` devait
   * épargner était annulé (TODO du doublon, corrigé le 2026-09-18).
   */
  it("un fait rejoué DANS une transaction n'annule pas le geste qui suit", async () => {
    const uow = ctx.app.get(UnitOfWork);

    await uow.run(async () => {
      await recorder.recordOrFail(input());
      await recorder.recordOrFail(input()); // le même fait, la même clé
      // L'écriture métier qui suit : refusée si la transaction a avorté.
      await recorder.recordOrFail(input({ idempotencyKey: "apres-le-doublon" }));
    });

    const keys = (await ctx.prisma.activityEvent.findMany()).map((row) => row.idempotencyKey);
    expect(keys.sort()).toEqual(["apres-le-doublon", "order.placed:order_1"]);
  });

  /**
   * Le mode strict des harnais (D2 du plan des phrases du journal) : un fait
   * que le catalogue refuse lève AVANT d'écrire — sur les deux garanties,
   * best-effort compris, sans quoi un test ne verrait jamais l'écart. Le type
   * inconnu ne compile pas ; le type retiré, si, et c'est lui qu'on éprouve.
   */
  it("en mode strict, refuse un type retiré et n'écrit rien", async () => {
    const retired = input({
      type: "company.kbis_uploaded_by_staff",
      subjectType: "company",
      payload: { fileName: "kbis.pdf" },
    });

    await expect(recorder.recordOrFail(retired)).rejects.toThrow(/retiré/);
    await expect(recorder.record(retired)).rejects.toThrow(/kbis_uploaded_by_staff/);
    expect(await ctx.prisma.activityEvent.count()).toBe(0);
  });

  it("en mode strict, refuse une charge qui ne suit pas son schéma, en nommant la clé", async () => {
    await expect(
      recorder.recordOrFail(input({ payload: { ...PLACED, totalCents: "42 €" } })),
    ).rejects.toThrow(/totalCents/);
    expect(await ctx.prisma.activityEvent.count()).toBe(0);
  });

  it("porte l'establishmentId quand il est fourni (identity resolution future)", async () => {
    await recorder.record(input({ establishmentId: "estab_9" }));
    const [row] = await ctx.prisma.activityEvent.findMany();
    expect(row!.establishmentId).toBe("estab_9");
  });
});

/**
 * Le journal **indulgent** — le mode de la production (D2 du plan
 * `documentation/journalisation/plan-phrases-du-journal.md`, Hugo, 2026-09-19 :
 * « en production, un fait mal décrit s'écrit quand même, avec une erreur au
 * journal applicatif ; jamais un geste bloqué »).
 *
 * Le harnais est strict ; on monte donc ici le VRAI adaptateur sur les vraies
 * dépendances de l'application, avec la vérification indulgente dont les
 * signalements sont gardés. Ce que seul le vrai Postgres prouve : le fait est
 * ÉCRIT, et le geste qui l'englobe dans une transaction tient.
 */
describe("journal activity_events — indulgent, comme en production", () => {
  const reported: string[] = [];

  function lenientRecorder(): ActivityRecorder {
    return new PrismaActivityRecorder(
      ctx.app.get(PrismaService),
      ctx.app.get(Clock),
      ctx.app.get(IdGenerator),
      ctx.app.get(ActorNamer),
      new JournalFactCheck(false, (message) => reported.push(message)),
    );
  }

  beforeEach(() => {
    reported.length = 0;
  });

  it("écrit une charge non conforme, et signale l'écart en nommant la clé", async () => {
    await lenientRecorder().recordOrFail(input({ payload: { totalCents: 4200 } }));

    const rows = await ctx.prisma.activityEvent.findMany();
    expect(rows.map((row) => [row.type, row.payload])).toEqual([
      ["order.placed", { totalCents: 4200 }],
    ]);
    expect(reported).toEqual([expect.stringMatching(/order\.placed.*orderId/)]);
  });

  it("n'annule pas le geste qui l'englobe : la transaction tient, fait retiré compris", async () => {
    const recorder = lenientRecorder();

    await ctx.app.get(UnitOfWork).run(async () => {
      await recorder.recordOrFail(
        input({
          type: "company.kbis_uploaded_by_staff",
          subjectType: "company",
          idempotencyKey: "retire",
          payload: { fileName: "kbis.pdf" },
        }),
      );
      await recorder.recordOrFail(input({ idempotencyKey: "le-geste-qui-suit" }));
    });

    const keys = (await ctx.prisma.activityEvent.findMany()).map((row) => row.idempotencyKey);
    expect(keys.sort()).toEqual(["le-geste-qui-suit", "retire"]);
    expect(reported).toEqual([expect.stringMatching(/retiré/)]);
  });

  it("ne signale rien pour un fait conforme", async () => {
    await lenientRecorder().record(input());

    expect(await ctx.prisma.activityEvent.count()).toBe(1);
    expect(reported).toEqual([]);
  });
});
