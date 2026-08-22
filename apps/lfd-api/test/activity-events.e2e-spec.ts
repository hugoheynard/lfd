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

function input(overrides: Partial<RecordActivityInput> = {}): RecordActivityInput {
  return {
    type: "order.placed",
    subjectType: "user",
    subjectId: "user_1",
    idempotencyKey: "order.placed:order_1",
    payload: { totalCents: 4200 },
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
    expect(row!.payload).toEqual({ totalCents: 4200 });
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

  it("porte l'establishmentId quand il est fourni (identity resolution future)", async () => {
    await recorder.record(input({ establishmentId: "estab_9" }));
    const [row] = await ctx.prisma.activityEvent.findMany();
    expect(row!.establishmentId).toBe("estab_9");
  });
});
