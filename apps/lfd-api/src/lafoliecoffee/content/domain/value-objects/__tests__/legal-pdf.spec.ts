import { InvalidLegalPdfError } from "../../errors/legal-document-file-errors.js";
import { LEGAL_PDF_MAX_BYTES, LegalPdf } from "../legal-pdf.js";

const pdf = (body = "contenu"): Buffer => Buffer.from(`%PDF-1.7\n${body}`, "latin1");

describe("LegalPdf", () => {
  it("accepte des octets qui commencent par %PDF-", () => {
    const bytes = pdf();

    expect(LegalPdf.create(bytes).size).toBe(bytes.length);
  });

  /**
   * C3′ : `ScannedDocument` admet JPEG, PNG et HEIC. Le document juridique
   * des CGV, non — une photo n'est pas une version de référence.
   */
  it.each([
    ["un JPEG", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])],
    ["un PNG", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ["du texte étiqueté PDF", Buffer.from("PDF-1.7 mais sans le pour-cent", "latin1")],
  ])("refuse %s", (_label, bytes) => {
    expect(() => LegalPdf.create(bytes)).toThrow(InvalidLegalPdfError);
  });

  it("refuse un fichier vide", () => {
    expect(() => LegalPdf.create(Buffer.alloc(0))).toThrow(/vide/);
  });

  it("refuse un PDF de plus de 10 Mo, et accepte la borne exacte", () => {
    const atLimit = Buffer.concat([pdf(), Buffer.alloc(LEGAL_PDF_MAX_BYTES - pdf().length)]);

    expect(LegalPdf.create(atLimit).size).toBe(LEGAL_PDF_MAX_BYTES);
    expect(() => LegalPdf.create(Buffer.concat([atLimit, Buffer.alloc(1)]))).toThrow(/10 Mo/);
  });
});
