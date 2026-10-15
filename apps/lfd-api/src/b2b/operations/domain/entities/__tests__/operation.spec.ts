import {
  InvalidOperationAudienceError,
  InvalidOperationImageError,
  InvalidOperationKeyError,
  InvalidOperationTextError,
  OperationArchivedError,
} from "../../errors/operation-errors.js";
import {
  Operation,
  type OperationRecord,
  type PrepareOperation,
  type WriteStamp,
} from "../operation.js";

/** Noël 2026. Les dates ne sont comparées qu'entre elles, jamais à l'horloge. */
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

const PREPARED: WriteStamp = { by: "staff_colette", at: new Date("2026-10-01T09:00:00.000Z") };
const LATER: WriteStamp = { by: "staff_marc", at: new Date("2026-10-02T09:00:00.000Z") };

/** Une ligne telle que le push du référentiel l'a écrite : jamais écrite au commerce. */
function received(over: Partial<OperationRecord> = {}): OperationRecord {
  return { ...noel(), skus: [], hidden: false, archivedAt: null, lastWrite: null, ...over };
}

describe("Operation.prepare", () => {
  it("naît sans article, visible, non archivée, signée, sa clé nettoyée", () => {
    const snapshot = Operation.prepare(noel({ key: " noel-2026 " }), PREPARED).snapshot();

    expect(snapshot).toMatchObject({
      key: "noel-2026",
      skus: [],
      hidden: false,
      archivedAt: null,
      lastWrite: PREPARED,
    });
    expect(snapshot.name).toEqual({ fr: "Noël 2026", en: "Christmas 2026" });
  });

  it("refuse une clé mal formée, un nom sans français, une clientèle inconnue, une image sans adresse", () => {
    const prepare = (over: Partial<PrepareOperation>) => () =>
      Operation.prepare(noel(over), PREPARED);

    expect(prepare({ key: "Noël" })).toThrow(InvalidOperationKeyError);
    expect(prepare({ name: { fr: "  " } })).toThrow(InvalidOperationTextError);
    expect(prepare({ audience: "tous" })).toThrow(InvalidOperationAudienceError);
    expect(prepare({ image: { url: " ", alt: "" } })).toThrow(InvalidOperationImageError);
  });

  it("refuse des dates qui se contredisent (D2)", () => {
    const inverted = { ...noel().schedule, pickupFrom: "2026-12-25", pickupUntil: "2026-12-20" };

    expect(() => Operation.prepare(noel({ schedule: inverted }), PREPARED)).toThrow(
      /premier jour de retrait/u,
    );
  });
});

describe("Operation — ce qui change, et qui l'a écrit", () => {
  it("se compose, se redate, change de clientèle et de textes, signé du dernier geste", () => {
    const operation = Operation.prepare(noel(), PREPARED);

    operation.select(["BUC-001", "GAL-002"], PREPARED);
    operation.changeAudience("pro", PREPARED);
    operation.edit({ name: { fr: "Noël" }, lede: null, image: null }, PREPARED);
    operation.reschedule({ ...noel().schedule, pickupUntil: "2026-12-31" }, LATER);

    expect(operation.snapshot()).toMatchObject({
      skus: ["BUC-001", "GAL-002"],
      audience: "pro",
      name: { fr: "Noël" },
      lede: null,
      image: null,
      lastWrite: LATER,
    });
    expect(operation.snapshot().schedule.pickupUntil.value).toBe("2026-12-31");
  });

  it("ne bouge pas — ni la date, ni l'auteur — quand un redatage est refusé", () => {
    const operation = Operation.prepare(noel(), PREPARED);

    expect(() =>
      operation.reschedule(
        { ...noel().schedule, pickupFrom: "2026-12-25", pickupUntil: "2026-12-20" },
        LATER,
      ),
    ).toThrow();
    expect(operation.snapshot().schedule.pickupFrom.value).toBe("2026-12-20");
    expect(operation.snapshot().lastWrite).toEqual(PREPARED);
  });

  /** Ce que `isHidden` de la surcharge portait : réversible, et sans toucher à l'archivage. */
  it("se masque et s'affiche, et dit quand rien n'a changé", () => {
    const operation = Operation.prepare(noel(), PREPARED);

    expect(operation.setHidden(false, LATER)).toBe(false);
    expect(operation.snapshot().lastWrite).toEqual(PREPARED);
    expect(operation.setHidden(true, LATER)).toBe(true);
    expect(operation.snapshot()).toMatchObject({ hidden: true, archivedAt: null });
    expect(operation.setHidden(false, LATER)).toBe(true);
    expect(operation.snapshot().hidden).toBe(false);
  });

  /** Une opération archivée garde sa clé pour toujours — et rien d'autre ne bouge non plus (D9). */
  it("refuse toute modification une fois archivée, archivage et masquage compris", () => {
    const operation = Operation.prepare(noel(), PREPARED);
    operation.archive(LATER);

    expect(operation.isArchived).toBe(true);
    expect(operation.snapshot().archivedAt).toBe(LATER.at);
    const again: WriteStamp = { by: "staff_x", at: new Date("2026-11-01T09:00:00.000Z") };
    for (const gesture of [
      () => operation.select(["BUC-001"], again),
      () => operation.changeAudience("pro", again),
      () => operation.edit({ name: { fr: "Noël" }, lede: null, image: null }, again),
      () => operation.reschedule(noel().schedule, again),
      () => operation.setHidden(true, again),
      () => operation.archive(again),
    ]) {
      expect(gesture).toThrow(OperationArchivedError);
    }
    expect(operation.snapshot()).toMatchObject({ archivedAt: LATER.at, lastWrite: LATER });
  });
});

describe("Operation.reconstitute", () => {
  it("relit une opération reçue du référentiel, jamais écrite au commerce", () => {
    const snapshot = Operation.reconstitute(received({ skus: ["BUC-001"] })).snapshot();

    expect(snapshot).toMatchObject({ key: "noel-2026", skus: ["BUC-001"], lastWrite: null });
  });

  /** `withdrawn_at` est l'archivage au commerce : une opération retirée par un envoi ne se modifie plus. */
  it("tient pour archivée une opération retirée", () => {
    const withdrawn = Operation.reconstitute(received({ archivedAt: PREPARED.at }));

    expect(() => withdrawn.setHidden(true, LATER)).toThrow(OperationArchivedError);
  });

  it("revérifie ses invariants à la relecture d'une ligne", () => {
    expect(() => Operation.reconstitute(received({ skus: ["BUC-001", "BUC-001"] }))).toThrow(
      /deux fois/u,
    );
    expect(() => Operation.reconstitute(received({ audience: "none" }))).toThrow(
      InvalidOperationAudienceError,
    );
  });
});
