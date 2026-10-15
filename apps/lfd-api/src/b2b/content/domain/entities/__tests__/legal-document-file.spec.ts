import { LegalDocumentFileAlreadySupersededError } from "../../errors/legal-document-file-errors.js";
import { LegalDocumentFile, type LegalDocumentFileDeposit } from "../legal-document-file.js";

// Les dates ne sont comparées qu'entre elles et au nom de fichier qu'elles
// produisent — jamais à l'horloge (CLAUDE.md §5, l'exception étroite).
const DEPOSIT: LegalDocumentFileDeposit = {
  id: "ldf_01",
  document: "salesTermsPro",
  sha256: "a".repeat(64),
  sizeBytes: 1200,
  uploadedAt: new Date("2026-10-12T08:30:00.000Z"),
  uploadedByStaffId: "staff_1",
};

describe("LegalDocumentFile", () => {
  it("range un dépôt sous une clé dérivée de son id, jamais du nom déposé", () => {
    const file = LegalDocumentFile.deposit(DEPOSIT);

    expect(file.storageKey).toBe("legal/sales-terms-pro/ldf_01.pdf");
    expect(file.supersededAt).toBeNull();
  });

  it("deux dépôts n'ont jamais la même clé : aucun ne peut écraser l'autre", () => {
    const first = LegalDocumentFile.deposit(DEPOSIT);
    const second = LegalDocumentFile.deposit({ ...DEPOSIT, id: "ldf_02" });

    expect(first.storageKey).not.toBe(second.storageKey);
  });

  it("se remplace une fois, et refuse de l'être une seconde", () => {
    const file = LegalDocumentFile.deposit(DEPOSIT);
    const at = new Date("2026-10-13T09:00:00.000Z");

    file.supersede(at, "CGV pro");

    expect(file.supersededAt).toEqual(at);
    expect(() => file.supersede(new Date("2026-10-14T09:00:00.000Z"), "CGV pro")).toThrow(
      LegalDocumentFileAlreadySupersededError,
    );
    expect(file.supersededAt).toEqual(at);
  });

  it("nomme le téléchargement par texte et par jour de Paris", () => {
    expect(LegalDocumentFile.deposit(DEPOSIT).downloadFileName()).toBe(
      "cgv-professionnels-2026-10-12.pdf",
    );
    // 23 h 30 UTC un 12 octobre est déjà le 13 à Paris : c'est ce jour-là
    // qu'un client français lit.
    const late = LegalDocumentFile.deposit({
      ...DEPOSIT,
      document: "salesTerms",
      uploadedAt: new Date("2026-10-12T23:30:00.000Z"),
    });
    expect(late.downloadFileName()).toBe("cgv-particuliers-2026-10-13.pdf");
  });
});
