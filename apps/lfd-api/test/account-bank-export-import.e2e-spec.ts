/**
 * E2E de l'export des comptes destinataires — **le marquage importé** : jamais sans téléchargement,
 * et « saisi dans CENET » hors export.
 *
 * Découpé de `account-bank-exports.e2e-spec.ts` le 2026-10-23 ; la scène
 * commune vit dans `account-bank-export-scene.ts`.
 */
import {
  card,
  ctx,
  debtor,
  DEBTOR_IBAN,
  entity,
  exportsOf,
  prepare,
  staff,
  useAccountBankExportScene,
} from "./account-bank-export-scene.js";

useAccountBankExportScene();

describe("l'export des comptes destinataires pour la banque", () => {
  it("refuse (409) de marquer importé un export jamais téléchargé, puis l'accepte après", async () => {
    const entityId = await entity();
    await debtor(entityId, "Jamais tiré");
    const exportId = await prepare(entityId);

    const refused = await staff()
      .post(`${exportsOf(entityId)}/${exportId}/imported`)
      .expect(409);
    expect(JSON.stringify(refused.body)).toContain("jamais été téléchargé");
    expect((await card(entityId)).exports[0]?.importedAt).toBeNull();

    await staff()
      .get(`${exportsOf(entityId)}/${exportId}/file.csv`)
      .expect(200);
    await staff()
      .post(`${exportsOf(entityId)}/${exportId}/imported`)
      .expect(204);
  });

  it("« saisi dans CENET » retire le compte de l'export, une seule fois, et le dit", async () => {
    const entityId = await entity();
    const { bankAccountId } = await debtor(entityId, "Saisi à la main");

    await staff()
      .post(`${exportsOf(entityId)}/known-accounts`)
      .send({ bankAccountId })
      .expect(400);
    await staff()
      .post(`${exportsOf(entityId)}/known-accounts`)
      .send({ bankAccountId, reason: "entered_in_cenet" })
      .expect(204);
    await staff()
      .post(`${exportsOf(entityId)}/known-accounts`)
      .send({ bankAccountId, reason: "reported_by_bank" })
      .expect(409);
    await staff().post(exportsOf(entityId)).expect(409);

    const view = await card(entityId);
    expect(view).toMatchObject({ toExport: [], knownCount: 1 });
    expect(view.accounts).toHaveLength(1);
    expect(view.accounts[0]).toMatchObject({
      bankAccountId,
      companyName: "Saisi à la main",
      ibanCountry: "FR",
      ibanLast4: DEBTOR_IBAN.slice(-4),
      bic: "BNPAFRPPXXX",
      standing: { kind: "declared", reason: "entered_in_cenet" },
    });
    const stored = await ctx.prisma.knownBankAccount.findMany({ select: { reason: true } });
    expect(stored).toEqual([{ reason: "entered_in_cenet" }]);
    const journal = await ctx.prisma.activityEvent.findMany({
      where: { type: "account_bank_export.account_known_declared" },
      select: { payload: true },
    });
    expect(journal).toHaveLength(1);
    expect(journal[0]?.payload).toMatchObject({ reason: "entered_in_cenet" });
  });
});
