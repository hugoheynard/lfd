/**
 * E2E de l'export des mandats — **la préparation** : ce qu'un export prend, le fichier
 * exact, le numéro EXM.
 *
 * Découpé de `mandate-bank-exports.e2e-spec.ts` le 2026-10-23 ; la scène
 * commune vit dans `mandate-bank-export-scene.ts`.
 */
import type { MandateBankExportsView } from "@lfd/contracts";
import { signatureDateCell } from "../src/b2b/accounting/domain/services/mandate-bank-export-values.js";
import { jsonBody } from "./e2e-harness.js";
import {
  ctx,
  DEBTOR_IBAN,
  entity,
  exportsOf,
  ICS,
  mandated,
  OTHER_ICS,
  prepare,
  SIGNED_AT,
  staff,
  useMandateBankExportScene,
} from "./mandate-bank-export-scene.js";

useMandateBankExportScene();

describe("l'export des mandats pour la banque", () => {
  it("exporte, rend le fichier exact, se marque importé, et n'est plus repris", async () => {
    const entityId = await entity("552100554");
    const rum = await mandated(entityId, "Café de l'Isère");

    const exportId = await prepare(entityId);
    const file = await staff()
      .get(`${exportsOf(entityId)}/${exportId}/file.csv`)
      .expect(200);

    expect(file.headers["cache-control"]).toBe("no-store");
    expect(file.headers["content-disposition"]).toMatch(/^attachment;/u);
    // Le numéro court EXM, figé à la préparation, et le nom explicite (2026-10-23).
    expect(file.headers["content-disposition"]).toMatch(
      /filename="?CENET-EXM-1-mandats-1-sur-1-1-mandat-\d{4}-\d{2}-\d{2}\.csv/u,
    );
    expect(file.text).toBe(
      `${rum};${ICS};Cafe de l'Isere;${DEBTOR_IBAN};BNPAFRPPXXX;${signatureDateCell(new Date(SIGNED_AT))};RECURRENT;B2B;;;O;N;;;;;;;\r\n`,
    );

    await staff()
      .post(`${exportsOf(entityId)}/${exportId}/imported`)
      .expect(204);
    await staff()
      .post(`${exportsOf(entityId)}/${exportId}/imported`)
      .expect(409);
    await staff().post(exportsOf(entityId)).send({}).expect(409);

    const card = jsonBody<MandateBankExportsView>(
      await staff().get(exportsOf(entityId)).expect(200),
    );
    expect(card).toMatchObject({ exportableCount: 1, toExportCount: 0, importedCount: 1 });
    expect(card.exports).toHaveLength(1);
    expect(card.exports[0]?.importedAt).not.toBeNull();
  });

  it("télécharger d'un clic : préparer puis tirer le fichier ; re-télécharger sert le même export", async () => {
    const entityId = await entity("552100554");
    await mandated(entityId, "Un clic");
    const exportId = await prepare(entityId);
    const first = await staff()
      .get(`${exportsOf(entityId)}/${exportId}/file.csv`)
      .expect(200);
    const again = await staff()
      .get(`${exportsOf(entityId)}/${exportId}/file.csv`)
      .expect(200);

    expect(again.text).toBe(first.text);
    const card = jsonBody<MandateBankExportsView>(
      await staff().get(exportsOf(entityId)).expect(200),
    );
    expect(card.exports).toHaveLength(1);
    expect(card.exports[0]?.id).toBe(exportId);
    expect(card.exports[0]?.lastDownloadedAt).not.toBeNull();
  });

  /**
   * Régression (2026-10-23) : « à exporter » comptait aussi le mandat d'un
   * export ouvert, que sa ligne disait « en export ».
   */
  it("un mandat d'un export ouvert est en attente de la banque, plus à exporter", async () => {
    const entityId = await entity("552100554");
    await mandated(entityId, "En vol");
    await prepare(entityId);
    await mandated(entityId, "Après coup");

    const card = jsonBody<MandateBankExportsView>(
      await staff().get(exportsOf(entityId)).expect(200),
    );
    expect(card).toMatchObject({ toExportCount: 1, inFlightCount: 1, importedCount: 0 });
    expect(card.mandates.filter((row) => row.standing.kind === "to_export")).toHaveLength(1);
  });

  /**
   * Hugo, 2026-10-23, aligné sur les comptes : un mandat d'un export ouvert
   * ne part pas dans un second — la banque rejetterait le second en entier.
   */
  it("deux préparations n'ont jamais un mandat commun ; tout en vol, la suivante est refusée (409)", async () => {
    const entityId = await entity("552100554");
    const first = await mandated(entityId, "Premier");
    const firstExport = await prepare(entityId);
    const second = await mandated(entityId, "Second");
    const secondExport = await prepare(entityId);

    const rumsOf = async (exportId: string): Promise<readonly string[]> => {
      const file = await staff()
        .get(`${exportsOf(entityId)}/${exportId}/file.csv`)
        .expect(200);
      return file.text
        .split("\r\n")
        .filter((row) => row !== "")
        .map((row) => row.split(";")[0] ?? "");
    };
    expect(await rumsOf(firstExport)).toEqual([first]);
    expect(await rumsOf(secondExport)).toEqual([second]);
    const refused = await staff().post(exportsOf(entityId)).send({}).expect(409);
    expect(refused.text).toContain("dans un export pas encore importé");
  });

  /** Hugo, 2026-10-23 : la banque rejette l'import entier si un mandat lui est connu. */
  it("refuse (400) l'option « tous » : elle n'existe plus", async () => {
    const entityId = await entity("552100554");
    await mandated(entityId, "Tous");
    await staff().post(exportsOf(entityId)).send({ all: true }).expect(400);
    await staff().post(exportsOf(entityId)).send({ all: false }).expect(400);
  });

  it("nomme un mandat sans BIC et ne l'exporte pas", async () => {
    const entityId = await entity("552100554");
    await mandated(entityId, "Sans Bic", true);
    const kept = await mandated(entityId, "Avec Bic");

    const card = jsonBody<MandateBankExportsView>(
      await staff().get(exportsOf(entityId)).expect(200),
    );
    expect(card.excluded).toEqual([
      expect.objectContaining({ debtorName: "Sans Bic", reason: "no_bic" }),
    ]);
    const exportId = await prepare(entityId);
    const file = await staff()
      .get(`${exportsOf(entityId)}/${exportId}/file.csv`)
      .expect(200);
    expect(file.text.split("\r\n")).toHaveLength(2);
    expect(file.text.startsWith(`${kept};`)).toBe(true);
  });

  it("le numéro EXM ne repart pas à zéro d'une entité à l'autre, et reste figé", async () => {
    const first = await entity("552100554");
    await mandated(first, "Client un");
    const second = await entity("732829320", OTHER_ICS);
    await mandated(second, "Client deux");

    await prepare(first);
    await prepare(second);

    const rows = await ctx.prisma.mandateBankExport.findMany({
      orderBy: { reference: "asc" },
      select: { legalEntityId: true, reference: true, partRank: true, partCount: true },
    });
    expect(rows).toEqual([
      { legalEntityId: first, reference: "EXM-1", partRank: 1, partCount: 1 },
      { legalEntityId: second, reference: "EXM-2", partRank: 1, partCount: 1 },
    ]);
  });
});
