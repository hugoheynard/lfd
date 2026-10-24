/**
 * E2E de l'export des comptes destinataires — **la course** : deux préparations
 * simultanées pour la même entité ne prennent jamais le même compte
 * (`prerequis-export-ribs.md` § 8, verrou par entité et sorte d'export).
 *
 * Constaté le 2026-10-24 (deux passages, cinq préparations) : sans
 * `lock.acquire` dans le handler, ce test est rouge —
 * plusieurs préparations répondent 201 et figent les mêmes comptes sous
 * plusieurs numéros EXC, ce que la banque rejetterait à l'import du second fichier.
 */
import {
  ctx,
  debtor,
  entity,
  exportsOf,
  OTHER_IBAN,
  staff,
  useAccountBankExportScene,
} from "./account-bank-export-scene.js";

/** Le nombre de préparations lancées ensemble. */
const RACERS = 5;

useAccountBankExportScene();

describe("des préparations simultanées d'un export des comptes", () => {
  it("les suivantes ne reprennent aucun compte de la première : elles sont refusées faute de reste", async () => {
    const entityId = await entity();
    await debtor(entityId, "Premier");
    await debtor(entityId, "Second", OTHER_IBAN);

    // Cinq à la fois : à deux, l'entrelacement n'est pas garanti à chaque passage.
    const responses = await Promise.all(
      Array.from({ length: RACERS }, () => staff().post(exportsOf(entityId))),
    );

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409, 409, 409, 409]);
    const lines = await ctx.prisma.accountBankExportLine.findMany({
      select: { exportId: true, bankAccountId: true },
    });
    expect(new Set(lines.map((line) => line.exportId)).size).toBe(1);
    expect(new Set(lines.map((line) => line.bankAccountId)).size).toBe(2);
    expect(lines).toHaveLength(2);
  });
});
