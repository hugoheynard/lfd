import { knownAccountFingerprintsOf } from "../account-bank-export-selection.js";

const IMPORTED = new Date("2026-10-01T08:00:00.000Z");
const DOWNLOADED = new Date("2026-10-02T08:00:00.000Z");

describe("knownAccountFingerprintsOf — ce que la banque a, ou va avoir", () => {
  it("une ligne d'un export importé rend son compte connu", () => {
    const result = knownAccountFingerprintsOf(
      [{ accountFingerprint: "f1", importedAt: IMPORTED, lastDownloadedAt: DOWNLOADED }],
      [],
    );
    expect([...result.known]).toEqual(["f1"]);
    expect(result.inFlight.size).toBe(0);
    expect(result.inDownloadedExport.size).toBe(0);
  });

  it("une ligne d'un export non importé est en vol ; téléchargé, elle l'est aussi", () => {
    const result = knownAccountFingerprintsOf(
      [
        { accountFingerprint: "f1", importedAt: null, lastDownloadedAt: null },
        { accountFingerprint: "f2", importedAt: null, lastDownloadedAt: DOWNLOADED },
      ],
      [],
    );
    expect([...result.inFlight]).toEqual(["f1", "f2"]);
    expect([...result.inDownloadedExport]).toEqual(["f2"]);
    expect(result.known.size).toBe(0);
  });

  it("un compte déclaré « déjà connu » l'est sans export", () => {
    const result = knownAccountFingerprintsOf([], ["f9"]);
    expect([...result.known]).toEqual(["f9"]);
  });
});
