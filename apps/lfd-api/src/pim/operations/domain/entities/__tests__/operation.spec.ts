import { InvalidLocalizedTextError } from "../../../../catalogue/shared/domain/value-objects/localized-text.js";
import {
  InvalidOperationAudienceError,
  InvalidOperationImageError,
  InvalidOperationKeyError,
  OperationArchivedError,
} from "../../errors/operation-errors.js";
import { Operation, type PrepareOperation } from "../operation.js";

/** Noël 2026. Les dates ne sont comparées qu'entre elles. */
function noel(over: Partial<PrepareOperation> = {}): PrepareOperation {
  return {
    key: "noel-2026",
    name: { fr: "Noël 2026", en: "Christmas 2026" },
    lede: { fr: "Les bûches sont là." },
    image: { url: "https://media.test/buche.webp", alt: "Une bûche" },
    schedule: {
      announceFrom: new Date("2026-10-31T23:00:00.000Z"),
      orderFrom: new Date("2026-11-14T23:00:00.000Z"),
      orderUntil: new Date("2026-12-21T11:00:00.000Z"),
      pickupFrom: "2026-12-20",
      pickupUntil: "2026-12-24",
    },
    audience: "both",
    ...over,
  };
}

describe("Operation.prepare", () => {
  it("naît sans article, non archivée, sa clé nettoyée", () => {
    const snapshot = Operation.prepare(noel({ key: " noel-2026 " })).snapshot();

    expect(snapshot).toMatchObject({ key: "noel-2026", skus: [], archivedAt: null });
    expect(snapshot.name).toEqual({ fr: "Noël 2026", en: "Christmas 2026" });
  });

  it("refuse une clé mal formée, un nom sans français, une clientèle inconnue, une image sans adresse", () => {
    expect(() => Operation.prepare(noel({ key: "Noël" }))).toThrow(InvalidOperationKeyError);
    expect(() => Operation.prepare(noel({ name: { fr: "  " } }))).toThrow(
      InvalidLocalizedTextError,
    );
    expect(() => Operation.prepare(noel({ audience: "tous" }))).toThrow(
      InvalidOperationAudienceError,
    );
    expect(() => Operation.prepare(noel({ image: { url: " ", alt: "" } }))).toThrow(
      InvalidOperationImageError,
    );
  });

  it("accepte ni accroche ni image", () => {
    const snapshot = Operation.prepare(noel({ lede: null, image: null })).snapshot();

    expect(snapshot.lede).toBeNull();
    expect(snapshot.image).toBeNull();
  });
});

describe("Operation — ce qui change, et ce qui ne change plus", () => {
  it("se compose, se redate, change de clientèle et de textes", () => {
    const operation = Operation.prepare(noel());

    operation.select(["BUC-001", "GAL-002"]);
    operation.changeAudience("pro");
    operation.edit({ name: { fr: "Noël" }, lede: null, image: null });
    operation.reschedule({ ...noel().schedule, pickupUntil: "2026-12-31" });

    expect(operation.snapshot()).toMatchObject({
      skus: ["BUC-001", "GAL-002"],
      audience: "pro",
      name: { fr: "Noël" },
      lede: null,
      image: null,
    });
    expect(operation.snapshot().schedule.pickupUntil.value).toBe("2026-12-31");
  });

  it("ne bouge pas quand un redatage est refusé", () => {
    const operation = Operation.prepare(noel());

    expect(() =>
      operation.reschedule({
        ...noel().schedule,
        pickupFrom: "2026-12-25",
        pickupUntil: "2026-12-20",
      }),
    ).toThrow();
    expect(operation.snapshot().schedule.pickupFrom.value).toBe("2026-12-20");
  });

  /** Une opération archivée garde sa clé pour toujours — et rien d'autre ne bouge non plus (D9). */
  it("refuse toute modification une fois archivée, archivage compris", () => {
    const operation = Operation.prepare(noel());
    const archivedAt = new Date("2027-01-05T09:00:00.000Z");
    operation.archive(archivedAt);

    expect(operation.isArchived).toBe(true);
    expect(operation.snapshot().archivedAt).toBe(archivedAt);
    for (const gesture of [
      () => operation.select(["BUC-001"]),
      () => operation.changeAudience("pro"),
      () => operation.edit({ name: { fr: "Noël" }, lede: null, image: null }),
      () => operation.reschedule(noel().schedule),
      () => operation.archive(new Date("2027-02-01T09:00:00.000Z")),
    ]) {
      expect(gesture).toThrow(OperationArchivedError);
    }
    expect(operation.snapshot().archivedAt).toBe(archivedAt);
  });

  it("revérifie ses invariants à la relecture d'une ligne", () => {
    const record = { ...noel(), skus: ["BUC-001", "BUC-001"], archivedAt: null };

    expect(() => Operation.reconstitute(record)).toThrow(/deux fois/u);
    expect(Operation.reconstitute({ ...record, skus: ["BUC-001"] }).snapshot().skus).toEqual([
      "BUC-001",
    ]);
  });
});
