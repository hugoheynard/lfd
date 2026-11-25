import { EVENT_FUNCTION_SHEET_MAX_BYTES } from "@lfd/contracts";

import {
  FunctionSheetNotPdfError,
  FunctionSheetTooLargeError,
  MissingFunctionSheetFileError,
} from "../../errors/event-errors.js";
import { FUNCTION_SHEET_MAX_BYTES, FunctionSheetPdf } from "../function-sheet-pdf.js";

const PDF = Buffer.from("%PDF-1.4\n...", "latin1");
/** Les premiers octets d'un `.xlsx` : une archive zip. */
const XLSX = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);

function upload(
  bytes: Buffer | null,
  declaredContentType = "application/pdf",
  fileName = "fiche.pdf",
) {
  return FunctionSheetPdf.create({ bytes, fileName, declaredContentType });
}

describe("FunctionSheetPdf", () => {
  it("reconnaît un PDF annoncé et signé", () => {
    const sheet = upload(PDF);
    expect(sheet).toMatchObject({
      fileName: "fiche.pdf",
      sizeBytes: PDF.length,
      contentType: "application/pdf",
    });
  });

  it("refuse l'absence de fichier", () => {
    expect(() => upload(null)).toThrow(MissingFunctionSheetFileError);
    expect(() => upload(Buffer.alloc(0))).toThrow(MissingFunctionSheetFileError);
  });

  it("🔴 refuse un Excel, et le message dit d'exporter en PDF depuis Excel", () => {
    expect(() =>
      upload(
        XLSX,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "fiche.xlsx",
      ),
    ).toThrow(/Exportez la fiche en PDF depuis Excel/u);
  });

  it("refuse des octets qui ne sont pas un PDF, même annoncés comme tel", () => {
    expect(() => upload(XLSX, "application/pdf", "fiche.pdf")).toThrow(FunctionSheetNotPdfError);
  });

  it("refuse un PDF annoncé sous un autre type", () => {
    expect(() => upload(PDF, "application/octet-stream")).toThrow(FunctionSheetNotPdfError);
  });

  it("refuse un fichier au-delà de la borne", () => {
    const big = Buffer.concat([PDF, Buffer.alloc(FUNCTION_SHEET_MAX_BYTES)]);
    expect(() => upload(big)).toThrow(FunctionSheetTooLargeError);
  });

  it("garde un nom par défaut quand le dépôt n'en annonce pas", () => {
    expect(upload(PDF, "application/pdf", "  ").fileName).toBe("fiche-de-fonction.pdf");
  });

  it("borne du domaine et borne du contrat sont la même", () => {
    expect(EVENT_FUNCTION_SHEET_MAX_BYTES).toBe(FUNCTION_SHEET_MAX_BYTES);
  });
});
