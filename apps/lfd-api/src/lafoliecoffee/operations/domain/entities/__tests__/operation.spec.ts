import {
  OperationAwaitingMigrationError,
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
    image: { url: "https://media.test/buche.webp" },
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
  return {
    ...noel(),
    showsOrderUntilTime: true,
    skus: [],
    hidden: false,
    archivedAt: null,
    lastWrite: null,
    ...over,
  };
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
    expect(prepare({ image: { url: " " } })).toThrow(InvalidOperationImageError);
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
    operation.reschedule(
      { schedule: { ...noel().schedule, pickupUntil: "2026-12-31" }, showsOrderUntilTime: true },
      LATER,
    );

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
        {
          schedule: { ...noel().schedule, pickupFrom: "2026-12-25", pickupUntil: "2026-12-20" },
          showsOrderUntilTime: false,
        },
        LATER,
      ),
    ).toThrow();
    expect(operation.snapshot().schedule.pickupFrom.value).toBe("2026-12-20");
    expect(operation.snapshot().showsOrderUntilTime).toBe(true);
    expect(operation.snapshot().lastWrite).toEqual(PREPARED);
  });

  /** Hugo, 2026-10-16 : « Commandez avant le… » dit l'heure, sauf si on l'éteint. */
  it("affiche l'heure de clôture dès la préparation, et l'éteint avec le calendrier", () => {
    const operation = Operation.prepare(noel(), PREPARED);
    expect(operation.snapshot().showsOrderUntilTime).toBe(true);

    operation.reschedule({ schedule: noel().schedule, showsOrderUntilTime: false }, LATER);

    expect(operation.snapshot()).toMatchObject({ showsOrderUntilTime: false, lastWrite: LATER });
    const reread = Operation.reconstitute(
      received({ showsOrderUntilTime: false, lastWrite: LATER }),
    );
    expect(reread.snapshot().showsOrderUntilTime).toBe(false);
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
      () => operation.reschedule({ schedule: noel().schedule, showsOrderUntilTime: false }, again),
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

describe("l'image suit la médiathèque", () => {
  const A = "https://media.test/buche.webp";
  const B = "https://media.test/buche-retouchee.webp";
  const MEDIA: WriteStamp = { by: "staff_media", at: new Date("2026-10-03T09:00:00.000Z") };

  function showingA(): Operation {
    return Operation.prepare(noel({ image: { url: A, focal: { x: 0.3, y: 0.6 } } }), PREPARED);
  }

  /**
   * Lot 3 (« Après le lot 2 ») : suivre un remplacement n'est pas une édition —
   * la médiathèque le trace, l'opération ne s'en signe pas.
   */
  it("un remplacement change l'adresse, recentre le point, et ne signe pas", () => {
    const operation = showingA();

    expect(operation.followImageReplacement(A, B)).toBe(true);

    expect(operation.snapshot()).toMatchObject({
      image: { url: B, focal: null },
      lastWrite: PREPARED,
    });
  });

  it("un remplacement d'une AUTRE image ne touche rien", () => {
    const operation = showingA();

    expect(operation.followImageReplacement(B, A)).toBe(false);
    expect(operation.snapshot()).toMatchObject({ image: { url: A }, lastWrite: PREPARED });
  });

  it("un nouveau point focal suit, sans changer l'auteur de la dernière écriture", () => {
    const operation = showingA();

    expect(operation.refocusImage(A, { x: 0.9, y: 0.1 })).toBe(true);
    expect(operation.refocusImage(A, { x: 0.9, y: 0.1 })).toBe(false);
    expect(operation.refocusImage(B, null)).toBe(false);

    expect(operation.snapshot()).toMatchObject({
      image: { url: A, focal: { x: 0.9, y: 0.1 } },
      lastWrite: PREPARED,
    });
  });

  /**
   * Lot 3 (« Après le lot 2 », Hugo 2026-10-16) : l'image d'une archivée reste
   * protégée, et son historique ne doit pas pointer vers une adresse disparue.
   * Le remplacement la suit ; une édition et un recadrage, non.
   */
  it("une opération archivée suit un remplacement, et refuse toujours d'être éditée", () => {
    const operation = showingA();
    operation.archive(LATER);

    expect(operation.followImageReplacement(A, B)).toBe(true);
    expect(operation.snapshot()).toMatchObject({ image: { url: B }, lastWrite: LATER });
    expect(() => operation.refocusImage(B, null)).toThrow(OperationArchivedError);
    expect(() => operation.edit({ name: { fr: "Noël" }, lede: null, image: null }, MEDIA)).toThrow(
      OperationArchivedError,
    );
  });
});

/**
 * Une copie reçue de l'ancien référentiel, jamais reprise au commerce : la
 * reprise est partie en X4 (`documentation/catalogue/catalogue-synchronise.md` §6),
 * la garde reste — écrire la copie la ferait passer pour une opération du commerce.
 */
describe("une copie reçue du référentiel", () => {
  it("ne s'écrit pas", () => {
    const copy = Operation.reconstitute(received());

    expect(() => copy.select(["BUC-001"], LATER)).toThrow(OperationAwaitingMigrationError);
    expect(() => copy.archive(LATER)).toThrow(OperationAwaitingMigrationError);
    expect(copy.snapshot().lastWrite).toBeNull();
  });
});
