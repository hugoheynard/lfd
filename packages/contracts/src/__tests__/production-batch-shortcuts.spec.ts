import {
  createBatchShortcutPayloadSchema,
  updateBatchShortcutPayloadSchema,
} from "../production-batch-shortcuts.js";

/** La FORME des payloads des raccourcis du fournil ; le domaine juge le reste. */
describe("les payloads des raccourcis du fournil", () => {
  it("accepte un ajout, SKU rogné", () => {
    expect(
      createBatchShortcutPayloadSchema.parse({ sku: " VIE-001 ", label: "1 plaque", pieces: 24 }),
    ).toEqual({ sku: "VIE-001", label: "1 plaque", pieces: 24 });
  });

  it("refuse des pièces non entières, un SKU vide et une clé inconnue", () => {
    expect(
      createBatchShortcutPayloadSchema.safeParse({ sku: "VIE-001", label: "x", pieces: 2.5 })
        .success,
    ).toBe(false);
    expect(
      createBatchShortcutPayloadSchema.safeParse({ sku: " ", label: "x", pieces: 2 }).success,
    ).toBe(false);
    expect(
      updateBatchShortcutPayloadSchema.safeParse({ label: "x", pieces: 2, sku: "VIE-001" }).success,
    ).toBe(false);
  });

  it("laisse au domaine le nom vide et les pièces nulles", () => {
    expect(updateBatchShortcutPayloadSchema.safeParse({ label: "", pieces: 0 }).success).toBe(true);
  });
});
