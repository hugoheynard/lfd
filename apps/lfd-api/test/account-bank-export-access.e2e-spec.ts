/**
 * E2E de l'export des comptes destinataires — **le droit et le journal** des téléchargements.
 *
 * Découpé de `account-bank-exports.e2e-spec.ts` le 2026-10-23 ; la scène
 * commune vit dans `account-bank-export-scene.ts`.
 */
import type { E2eContext } from "./e2e-harness.js";
import {
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
  it("refuse le fichier et les gestes avec la seule lecture comptable (403)", async () => {
    const entityId = await entity();
    const { bankAccountId } = await debtor(entityId, "Client");
    const exportId = await prepare(entityId);
    const reader = await ctx.prisma.staffUser.create({
      data: {
        firstName: "Test",
        lastName: "lecture",
        email: "lecture@lfc.test",
        role: "communication",
        status: "active",
        auth0Id: "staff-lecture",
      },
    });
    await ctx.prisma.staffPermissionOverride.create({
      data: { staffUserId: reader.id, resource: "b2b_accounting", action: "read", effect: "allow" },
    });
    const asReader = (): ReturnType<E2eContext["asSub"]> => ctx.asSub("staff-lecture");

    await asReader().get(exportsOf(entityId)).expect(200);
    await asReader()
      .get(`${exportsOf(entityId)}/${exportId}/file.csv`)
      .expect(403);
    await asReader().post(exportsOf(entityId)).expect(403);
    await asReader()
      .post(`${exportsOf(entityId)}/${exportId}/imported`)
      .expect(403);
    await asReader()
      .post(`${exportsOf(entityId)}/${exportId}/abandoned`)
      .expect(403);
    await asReader()
      .post(`${exportsOf(entityId)}/known-accounts`)
      .send({ bankAccountId, reason: "entered_in_cenet" })
      .expect(403);
  });

  it("journalise chaque téléchargement, sans jamais un IBAN", async () => {
    const entityId = await entity();
    await debtor(entityId, "Client");
    const exportId = await prepare(entityId);
    for (let round = 0; round < 2; round += 1) {
      await staff()
        .get(`${exportsOf(entityId)}/${exportId}/file.csv`)
        .expect(200);
    }
    await staff()
      .post(`${exportsOf(entityId)}/${exportId}/imported`)
      .expect(204);

    const journal = await ctx.prisma.activityEvent.findMany({
      where: { type: { startsWith: "account_bank_export." } },
      orderBy: { occurredAt: "asc" },
    });
    expect(journal.map((row) => row.type).sort()).toEqual(
      [
        "account_bank_export.created",
        "account_bank_export.downloaded",
        "account_bank_export.downloaded",
        "account_bank_export.imported",
      ].sort(),
    );
    expect(JSON.stringify(journal)).not.toContain(DEBTOR_IBAN);
    expect(JSON.stringify(journal)).not.toContain(DEBTOR_IBAN.slice(4, 14));
  });
});
