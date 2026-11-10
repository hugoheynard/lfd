import { photoCardRevision } from "../photo-revision.js";

/**
 * **La révision d'une clé de photo.** Déplacée de la procédure de livraison
 * (`deliveryStepPhotoRevision`) au socle le 2026-09-15 : les notes du
 * commercial la lisent de la même façon.
 */
describe("photoCardRevision", () => {
  it("lit la révision d'une clé d'étape de livraison, à l'identique d'avant", () => {
    expect(photoCardRevision("companies/c1/delivery-procedures/a1/01STEP-01REV")).toBe("01REV");
  });

  it("lit la même révision sur la photo d'une note et sur sa vignette", () => {
    expect(photoCardRevision("companies/c1/client-notes/01NOTE-01REV")).toBe("01REV");
    expect(photoCardRevision("companies/c1/client-notes/thumbs/01NOTE-01REV")).toBe("01REV");
  });
});
