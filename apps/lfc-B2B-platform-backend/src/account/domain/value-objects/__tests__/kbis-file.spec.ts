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

describe("KbisFile — la photo comme secours", () => {
  it("accepte une photo JPEG et le dit dans son content-type", () => {
    // Le commercial est chez son client, l'extrait est sur le comptoir et le
    // scanner au bureau. Refuser l'image, c'est repartir sans la pièce.
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from("photo")]);

    const file = KbisFile.create("kbis.jpg", jpeg);

    expect(file.contentType).toBe("image/jpeg");
  });

  it("accepte un PNG", () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from("capture"),
    ]);

    expect(KbisFile.create("kbis.png", png).contentType).toBe("image/png");
  });

  it("accepte un HEIC — ce que rend un iPhone sans conversion", () => {
    const heic = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x18]),
      Buffer.from("ftypheic"),
      Buffer.from("suite"),
    ]);

    expect(KbisFile.create("IMG_0042.HEIC", heic).contentType).toBe("image/heic");
  });

  it("refuse toujours ce qui n'est ni PDF ni image, quel que soit le nom", () => {
    // La vérité vient des octets : une photo n'ouvre pas la porte à n'importe
    // quel fichier renommé.
    expect(() => KbisFile.create("kbis.jpg", Buffer.from("GIF89a", "latin1"))).toThrow(
      InvalidKbisFileError,
    );
  });
});
