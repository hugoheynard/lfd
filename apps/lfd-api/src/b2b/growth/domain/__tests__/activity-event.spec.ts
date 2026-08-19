import {
  buildActivityEventRow,
  type RecordActivityInput,
  type ResolvedActivityContext,
} from "../activity-event.js";

const CONTEXT: ResolvedActivityContext = {
  id: "01J000000000000000000EVENT",
  now: new Date("2026-08-07T10:00:00.000Z"),
  traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
  actorType: "customer",
};

const MINIMAL: RecordActivityInput = {
  type: "order.placed",
  subjectType: "user",
  subjectId: "user_1",
  idempotencyKey: "order.placed:order_1",
  payload: { totalCents: 4200 },
};

/**
 * Le builder pur : dérive une ligne de journal de l'entrée + du contexte résolu.
 * Il fixe les défauts et recopie le contexte — testé sans I/O.
 */
describe("buildActivityEventRow", () => {
  it("recopie l'identité et le contexte dérivés", () => {
    const row = buildActivityEventRow(MINIMAL, CONTEXT);
    expect(row.id).toBe(CONTEXT.id);
    expect(row.traceId).toBe(CONTEXT.traceId);
    expect(row.actorType).toBe("customer");
    expect(row.type).toBe("order.placed");
    expect(row.subjectType).toBe("user");
    expect(row.subjectId).toBe("user_1");
    expect(row.idempotencyKey).toBe("order.placed:order_1");
    expect(row.payload).toEqual({ totalCents: 4200 });
  });

  it("applique les défauts : occurredAt=now, schemaVersion=1, establishmentId=null", () => {
    const row = buildActivityEventRow(MINIMAL, CONTEXT);
    expect(row.occurredAt).toBe(CONTEXT.now);
    expect(row.schemaVersion).toBe(1);
    expect(row.establishmentId).toBeNull();
  });

  it("respecte un occurredAt explicite (événement tardif/rejoué)", () => {
    const occurredAt = new Date("2026-08-01T09:00:00.000Z");
    const row = buildActivityEventRow({ ...MINIMAL, occurredAt }, CONTEXT);
    expect(row.occurredAt).toBe(occurredAt);
  });

  it("respecte un establishmentId et une schemaVersion explicites", () => {
    const row = buildActivityEventRow(
      { ...MINIMAL, establishmentId: "estab_9", schemaVersion: 3 },
      CONTEXT,
    );
    expect(row.establishmentId).toBe("estab_9");
    expect(row.schemaVersion).toBe(3);
  });
});
