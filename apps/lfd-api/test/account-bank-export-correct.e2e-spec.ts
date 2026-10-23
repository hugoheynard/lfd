/**
 * E2E de l'export des comptes destinataires — **le retour de la banque** : signalé, rejeté,
 * et la raison refusée en base.
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
  /** Hugo, 2026-10-23 : le compte rendu d'import n'existe qu'après le dépôt dans CENET. */
  it("« signalé par la banque » : refusé avant le dépôt, posé sur la ligne après", async () => {
    const entityId = await entity();
    const { bankAccountId } = await debtor(entityId, "Déjà chez la banque");
    const lineOf = (exportId: string) =>
      `${exportsOf(entityId)}/${exportId}/accounts/${bankAccountId}`;
    const exportId = await prepare(entityId);
    await staff()
      .get(`${exportsOf(entityId)}/${exportId}/file.csv`)
      .expect(200);

    const early = await staff()
      .post(`${lineOf(exportId)}/reported-known`)
      .expect(409);
    expect(JSON.stringify(early.body)).toContain("Disponible après le dépôt dans CENET");
    const free = await staff()
      .post(`${exportsOf(entityId)}/known-accounts`)
      .send({ bankAccountId, reason: "reported_by_bank" })
      .expect(409);
    expect(JSON.stringify(free.body)).toContain("qu'après le dépôt du fichier dans CENET");

    await staff()
      .post(`${exportsOf(entityId)}/${exportId}/imported`)
      .expect(204);
    expect((await card(entityId)).accounts[0]?.standing).toMatchObject({
      kind: "imported",
      exportId,
      correctable: true,
    });
    await staff()
      .post(`${lineOf(exportId)}/reported-known`)
      .expect(204);
    await staff()
      .post(`${lineOf(exportId)}/rejected`)
      .send({ reason: "trop tard" })
      .expect(409);

    const view = await card(entityId);
    expect(view).toMatchObject({ toExport: [], knownCount: 1 });
    expect(view.accounts[0]?.standing).toMatchObject({
      kind: "declared",
      reason: "reported_by_bank",
    });
    await staff().post(exportsOf(entityId)).expect(409);
    const journal = await ctx.prisma.activityEvent.findMany({
      where: { type: "account_bank_export.account_reported_known" },
      select: { payload: true },
    });
    expect(journal).toHaveLength(1);
    expect(JSON.stringify(journal)).not.toContain(DEBTOR_IBAN);
  });

  it("« rejeté par la banque » après le dépôt : le compte redevient à exporter, et l'export suivant le reprend", async () => {
    const entityId = await entity();
    const { bankAccountId } = await debtor(entityId, "Ligne en erreur");
    const exportId = await prepare(entityId);
    await staff()
      .get(`${exportsOf(entityId)}/${exportId}/file.csv`)
      .expect(200);
    await staff()
      .post(`${exportsOf(entityId)}/${exportId}/imported`)
      .expect(204);
    const line = `${exportsOf(entityId)}/${exportId}/accounts/${bankAccountId}/rejected`;

    await staff().post(line).send({ reason: "   " }).expect(400);
    await staff().post(line).send({ reason: "BIC refusé par CENET" }).expect(204);

    const view = await card(entityId);
    expect(view.accounts[0]?.standing).toEqual({ kind: "to_export" });
    expect(view.toExport).toHaveLength(1);
    const next = await prepare(entityId);
    expect(next).not.toBe(exportId);
    const journal = await ctx.prisma.activityEvent.findMany({
      where: { type: "account_bank_export.account_rejected" },
      select: { payload: true },
    });
    expect(journal[0]?.payload).toMatchObject({ rejectionReason: "BIC refusé par CENET" });
    await expect(
      ctx.prisma
        .$executeRaw`UPDATE "public"."account_bank_export_line" SET "rejection_reason" = NULL WHERE "export_id" = ${exportId}`,
    ).rejects.toThrow(/account_bank_export_line_rejection_reason/u);
  });

  it("refuse en base une raison inconnue (CHECK)", async () => {
    const entityId = await entity();
    const { bankAccountId } = await debtor(entityId, "Client");
    await staff()
      .post(`${exportsOf(entityId)}/known-accounts`)
      .send({ bankAccountId, reason: "entered_in_cenet" })
      .expect(204);
    await expect(
      ctx.prisma
        .$executeRaw`UPDATE "public"."known_bank_account" SET "reason" = 'other' WHERE "bank_account_id" = ${bankAccountId}`,
    ).rejects.toThrow(/known_bank_account_reason_known/u);
  });
});
