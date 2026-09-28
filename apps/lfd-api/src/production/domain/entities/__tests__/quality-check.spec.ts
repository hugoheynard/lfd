import {
  QualityCheckIncompleteError,
  QualityCheckNoteRequiredError,
  QualityCheckPhotoPositionError,
  QualityCheckTargetError,
  QualityCheckTooManyPhotosError,
} from "../../errors/quality-check-errors.js";
import { ServiceDay } from "../../value-objects/service-day.value-object.js";
import { QualityCheck, type RenderQualityCheck } from "../quality-check.js";

/**
 * Le contrôle qualité, sans Nest ni double : on rend un verdict, on assert —
 * refus compris. Aucune date n'est comparée à l'horloge ici.
 */

const AT = new Date();

function input(overrides: Partial<RenderQualityCheck> = {}): RenderQualityCheck {
  return {
    id: "01JQC0000000000000000000A1",
    serviceDay: ServiceDay.of("2026-10-01"),
    target: { kind: "line", sku: "VIE-001", quantitySeen: 96 },
    verdict: "ok",
    note: null,
    checkedBy: "staff_1",
    checkedAt: AT,
    photos: [],
    ...overrides,
  };
}

function photos(count: number): RenderQualityCheck["photos"] {
  return Array.from({ length: count }, (_, position) => photo(position));
}

function photo(position: number): RenderQualityCheck["photos"][number] {
  return {
    position,
    storageKey: `quality/pending/up_${position}`,
    uploadId: `up_${position}`,
    contentType: "image/jpeg",
    byteSize: 1024,
  };
}

describe("QualityCheck.render — ce qu'il accepte", () => {
  it("un OK sans note ni photo", () => {
    const check = QualityCheck.render(input());
    expect(check.verdict).toBe("ok");
    expect(check.note).toBeNull();
    expect(check.photos).toEqual([]);
    expect(check.target).toEqual({ kind: "line", sku: "VIE-001", quantitySeen: 96 });
  });

  it("une réserve et un blocage avec note, sans photo : la photo est facultative partout", () => {
    expect(QualityCheck.render(input({ verdict: "warning", note: "Dorure pâle" })).note).toBe(
      "Dorure pâle",
    );
    const blocking = QualityCheck.render(
      input({
        verdict: "blocking",
        note: "  Brûlés  ",
        target: { kind: "order", orderId: "ord_1" },
      }),
    );
    expect(blocking.isBlocking).toBe(true);
    expect(blocking.note).toBe("Brûlés");
  });

  it("six photos, rangées par position quel que soit l'ordre reçu", () => {
    const check = QualityCheck.render(input({ photos: [...photos(6)].reverse() }));
    expect(check.photos.map((photo) => photo.position)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("une note blanche sur un OK vaut absence de note", () => {
    expect(QualityCheck.render(input({ note: "   " })).note).toBeNull();
  });
});

describe("QualityCheck.render — ce qu'il refuse", () => {
  it.each(["warning", "blocking"] as const)("un verdict %s sans note", (verdict) => {
    expect(() => QualityCheck.render(input({ verdict, note: null }))).toThrow(
      QualityCheckNoteRequiredError,
    );
    expect(() => QualityCheck.render(input({ verdict, note: "  " }))).toThrow(
      QualityCheckNoteRequiredError,
    );
  });

  it("le message nomme la réserve en français, pas le nom de code", () => {
    expect(() => QualityCheck.render(input({ verdict: "warning", note: null }))).toThrow(
      /« Réserve »/u,
    );
  });

  it("plus de six photos", () => {
    expect(() => QualityCheck.render(input({ photos: photos(7) }))).toThrow(
      QualityCheckTooManyPhotosError,
    );
  });

  it("deux photos à la même position, ou une position négative", () => {
    const twice = [
      { ...photo(1), storageKey: "a" },
      { ...photo(1), storageKey: "b" },
    ];
    expect(() => QualityCheck.render(input({ photos: twice }))).toThrow(
      QualityCheckPhotoPositionError,
    );
    expect(() => QualityCheck.render(input({ photos: [{ ...photo(0), position: -1 }] }))).toThrow(
      QualityCheckPhotoPositionError,
    );
  });

  it("une photo sans dépôt, sans type ou d'un poids impossible (QC2)", () => {
    for (const broken of [
      { ...photo(0), uploadId: " " },
      { ...photo(0), contentType: "" },
      { ...photo(0), byteSize: 0 },
      { ...photo(0), byteSize: 1.5 },
    ]) {
      expect(() => QualityCheck.render(input({ photos: [broken] }))).toThrow(
        QualityCheckIncompleteError,
      );
    }
  });

  it("une photo sans emplacement, un contrôle sans id ou sans auteur", () => {
    expect(() =>
      QualityCheck.render(input({ photos: [{ ...photo(0), storageKey: " " }] })),
    ).toThrow(QualityCheckIncompleteError);
    expect(() => QualityCheck.render(input({ id: "" }))).toThrow(QualityCheckIncompleteError);
    expect(() => QualityCheck.render(input({ checkedBy: " " }))).toThrow(
      QualityCheckIncompleteError,
    );
  });

  it.each([
    ["une ligne sans produit", { kind: "line", quantitySeen: 3 }],
    ["une ligne sans quantité vue", { kind: "line", sku: "VIE-001" }],
    ["une quantité négative", { kind: "line", sku: "VIE-001", quantitySeen: -1 }],
    ["une quantité fractionnaire", { kind: "line", sku: "VIE-001", quantitySeen: 1.5 }],
    ["une ligne qui nomme une commande", { kind: "line", sku: "V", quantitySeen: 1, orderId: "o" }],
    ["une commande sans identifiant", { kind: "order", orderId: " " }],
    ["une commande qui nomme un produit", { kind: "order", orderId: "o", sku: "V" }],
    ["une commande avec quantité", { kind: "order", orderId: "o", quantitySeen: 4 }],
    ["un genre inconnu", { kind: "batch", sku: "V" }],
  ])("une cible incohérente : %s", (_, target) => {
    expect(() => QualityCheck.render(input({ target }))).toThrow(QualityCheckTargetError);
  });
});
