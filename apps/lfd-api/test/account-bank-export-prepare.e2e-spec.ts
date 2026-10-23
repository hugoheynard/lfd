/**
 * E2E de l'export des comptes destinataires — **la préparation** : ce qu'un export prend, ce qu'il laisse,
 * son plafond et son abandon.
 *
 * Découpé de `account-bank-exports.e2e-spec.ts` le 2026-10-23 ; la scène
 * commune vit dans `account-bank-export-scene.ts`.
 */
import {
  card,
  debtor,
  DEBTOR_IBAN,
  entity,
  exportsOf,
  frenchIban,
  OTHER_IBAN,
  prepare,
  staff,
  useAccountBankExportScene,
} from "./account-bank-export-scene.js";

useAccountBankExportScene();

describe("l'export des comptes destinataires pour la banque", () => {
  it("exporte le fichier exact, se marque importé, puis plus rien à exporter", async () => {
    const entityId = await entity();
    await debtor(entityId, "Café de l'Isère");

    const exportId = await prepare(entityId);
    expect((await card(entityId)).exports[0]?.lastDownloadedAt).toBeNull();
    const file = await staff()
      .get(`${exportsOf(entityId)}/${exportId}/file.csv`)
      .expect(200);
    expect((await card(entityId)).exports[0]?.lastDownloadedAt).toEqual(expect.any(String));

    expect(file.headers["cache-control"]).toBe("no-store");
    expect(file.headers["content-type"]).toMatch(/^text\/csv; charset=iso-8859-1/u);
    expect(file.headers["content-disposition"]).toMatch(/^attachment;/u);
    // C : le SIREN que la fabrique de société a tiré (9 chiffres).
    expect(file.text).toMatch(
      /^I;Cafe de l'Isere titulaire;\d{9};1 rue du Test;;73000 Chambery;;FR;FR;76;30004000031234567890143;BNPAFRPPXXX;;;;\r\n$/u,
    );

    expect(await card(entityId)).toMatchObject({ toExport: [], inFlightCount: 1 });
    await staff()
      .post(`${exportsOf(entityId)}/${exportId}/imported`)
      .expect(204);
    await staff()
      .post(`${exportsOf(entityId)}/${exportId}/imported`)
      .expect(409);
    await staff().post(exportsOf(entityId)).expect(409);
    const imported = await card(entityId);
    expect(imported).toMatchObject({ toExport: [], inFlightCount: 0, knownCount: 1 });
    expect(imported.accounts[0]?.standing).toMatchObject({ kind: "imported" });
  });

  it("sert l'enseigne à côté de la raison sociale, sans toucher au fichier", async () => {
    const entityId = await entity();
    await debtor(entityId, "SAS Les Tommeuses", DEBTOR_IBAN, false, "Fromagerie Tom");
    await debtor(entityId, "Sans enseigne", OTHER_IBAN);

    const view = await card(entityId);
    expect(view.accounts.map((row) => [row.companyName, row.tradeName])).toEqual([
      ["SAS Les Tommeuses", "Fromagerie Tom"],
      ["Sans enseigne", null],
    ]);
    const exportId = await prepare(entityId);
    const file = await staff()
      .get(`${exportsOf(entityId)}/${exportId}/file.csv`)
      .expect(200);
    expect(file.text).toContain("I;SAS Les Tommeuses titulaire;");
    expect(file.text).not.toContain("Fromagerie Tom");
  });

  it("n'exporte que les nouveaux : un second export ne reprend pas les comptes en vol", async () => {
    const entityId = await entity();
    await debtor(entityId, "Premier");
    await prepare(entityId);
    await debtor(entityId, "Second", OTHER_IBAN);

    const second = await prepare(entityId);
    const file = await staff()
      .get(`${exportsOf(entityId)}/${second}/file.csv`)
      .expect(200);
    expect(file.text.split("\r\n")).toEqual([expect.stringContaining("I;Second titulaire;"), ""]);
  });

  it("abandonné, un export rend ses comptes et ne se télécharge plus", async () => {
    const entityId = await entity();
    await debtor(entityId, "Client");
    const exportId = await prepare(entityId);
    await staff()
      .post(`${exportsOf(entityId)}/${exportId}/abandoned`)
      .expect(204);

    await staff()
      .get(`${exportsOf(entityId)}/${exportId}/file.csv`)
      .expect(409);
    expect((await card(entityId)).toExport).toHaveLength(1);
  });

  it("prend 200 comptes au plus par fichier ; le 201ᵉ attend l'export suivant", async () => {
    const entityId = await entity();
    for (let index = 0; index < 201; index += 1) {
      await debtor(entityId, `Client ${String(index)}`, frenchIban(index));
    }
    expect((await card(entityId)).toExport).toHaveLength(201);

    const first = await prepare(entityId);
    const file = await staff()
      .get(`${exportsOf(entityId)}/${first}/file.csv`)
      .expect(200);
    expect(file.text.split("\r\n")).toHaveLength(201);
    expect(await card(entityId)).toMatchObject({ inFlightCount: 200 });
    expect((await card(entityId)).toExport).toHaveLength(1);
    // Le numéro court et le rang dans la série, figés à la préparation (2026-10-23).
    expect((await card(entityId)).exports[0]).toMatchObject({
      reference: "EXC-1",
      part: { rank: 1, count: 2 },
    });
    expect(file.headers["content-disposition"]).toMatch(
      /filename="?CENET-EXC-1-comptes-1-sur-2-200-comptes-\d{4}-\d{2}-\d{2}\.csv/u,
    );

    await staff()
      .post(`${exportsOf(entityId)}/${first}/imported`)
      .expect(204);
    const second = await prepare(entityId);
    const last = await staff()
      .get(`${exportsOf(entityId)}/${second}/file.csv`)
      .expect(200);
    expect(last.headers["content-disposition"]).toMatch(
      /filename="?CENET-EXC-2-comptes-2-sur-2-1-compte-\d{4}-\d{2}-\d{2}\.csv/u,
    );
  });

  it("nomme un compte sans BIC et ne l'exporte pas", async () => {
    const entityId = await entity();
    await debtor(entityId, "Sans Bic", OTHER_IBAN, true);
    await debtor(entityId, "Avec Bic");

    const view = await card(entityId);
    expect(view.excluded).toEqual([
      expect.objectContaining({ companyName: "Sans Bic", reason: "no_bic" }),
    ]);
    const exportId = await prepare(entityId);
    const file = await staff()
      .get(`${exportsOf(entityId)}/${exportId}/file.csv`)
      .expect(200);
    expect(file.text.split("\r\n")).toHaveLength(2);
    expect(file.text).not.toContain("Sans Bic");
  });

  it("télécharger d'un clic : préparer puis tirer le fichier ; re-télécharger sert le même export", async () => {
    const entityId = await entity();
    await debtor(entityId, "Un clic");
    const exportId = await prepare(entityId);
    const first = await staff()
      .get(`${exportsOf(entityId)}/${exportId}/file.csv`)
      .expect(200);
    const again = await staff()
      .get(`${exportsOf(entityId)}/${exportId}/file.csv`)
      .expect(200);

    expect(again.text).toBe(first.text);
    // Un nom FIGÉ par export : le re-téléchargement redonne le même.
    expect(again.headers["content-disposition"]).toBe(first.headers["content-disposition"]);
    const view = await card(entityId);
    expect(view.exports).toHaveLength(1);
    expect(view.exports[0]?.id).toBe(exportId);
    expect(view.exports[0]?.lastDownloadedAt).not.toBeNull();
  });
});
