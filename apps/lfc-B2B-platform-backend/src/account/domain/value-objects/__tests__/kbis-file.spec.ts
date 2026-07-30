import { InvalidKbisFileError } from "../../errors/account-errors.js";
import { KbisFile, KBIS_MAX_BYTES } from "../kbis-file.js";

/** Un PDF minimal valide : l'en-tête magique suffit à la reconnaissance. */
function pdf(extra = "contenu"): Buffer {
  return Buffer.from(`%PDF-1.4\n${extra}`, "latin1");
}

describe("KbisFile", () => {
  it("accepte un PDF et dérive le content-type de son contenu", () => {
    const file = KbisFile.create("  extrait-kbis.pdf ", pdf());

    expect(file.fileName).toBe("extrait-kbis.pdf");
    expect(file.contentType).toBe("application/pdf");
    expect(file.size).toBeGreaterThan(0);
  });

  it("refuse un fichier qui n'est pas un PDF, même bien nommé", () => {
    // La vérité vient des octets, pas du nom ni du content-type annoncé : un
    // exécutable renommé `.pdf` ne doit pas passer.
    expect(() => KbisFile.create("virus.pdf", Buffer.from("MZ\x90\x00", "latin1"))).toThrow(
      InvalidKbisFileError,
    );
  });

  it("refuse un fichier vide ou sans nom", () => {
    expect(() => KbisFile.create("kbis.pdf", Buffer.alloc(0))).toThrow(/vide/u);
    expect(() => KbisFile.create("   ", pdf())).toThrow(/nom de fichier/u);
  });

  it("refuse un fichier trop volumineux", () => {
    const tooBig = Buffer.concat([pdf(), Buffer.alloc(KBIS_MAX_BYTES)]);
    expect(() => KbisFile.create("gros.pdf", tooBig)).toThrow(/taille maximale/u);
  });
});
