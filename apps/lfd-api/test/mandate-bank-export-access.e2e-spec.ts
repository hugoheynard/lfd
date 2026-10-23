/**
 * E2E de l'export des mandats — **le droit, le mur d'entité et le journal**
 *
 * Découpé de `mandate-bank-exports.e2e-spec.ts` le 2026-10-23 ; la scène
 * commune vit dans `mandate-bank-export-scene.ts`.
 */
import type { E2eContext } from "./e2e-harness.js";
import {
  ctx,
  DEBTOR_IBAN,
  entity,
  exportsOf,
  mandated,
  OTHER_ICS,
  prepare,
  staff,
  useMandateBankExportScene,
} from "./mandate-bank-export-scene.js";

useMandateBankExportScene();

describe("l'export des mandats pour la banque", () => {
  it("refuse le fichier et l'écriture avec la seule lecture comptable (403)", async () => {
    const entityId = await entity("552100554");
    await mandated(entityId, "Client");
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
    await asReader().post(exportsOf(entityId)).send({}).expect(403);
    await asReader()
      .post(`${exportsOf(entityId)}/${exportId}/imported`)
      .expect(403);
    await asReader()
      .post(`${exportsOf(entityId)}/${exportId}/abandoned`)
      .expect(403);
  });

  it("l'export d'une autre entité n'existe pas sous celle-ci (404)", async () => {
    const owner = await entity("552100554");
    const other = await entity("732829320", OTHER_ICS);
    await mandated(owner, "Client");
    const exportId = await prepare(owner);

    await staff()
      .get(`${exportsOf(other)}/${exportId}/file.csv`)
      .expect(404);
    await staff()
      .post(`${exportsOf(other)}/${exportId}/imported`)
      .expect(404);
    await staff()
      .post(`${exportsOf(other)}/${exportId}/abandoned`)
      .expect(404);
  });

  it("journalise chaque téléchargement (R8), sans jamais un IBAN", async () => {
    const entityId = await entity("552100554");
    await mandated(entityId, "Client");
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
      where: { type: { startsWith: "mandate_bank_export." } },
      orderBy: { occurredAt: "asc" },
    });
    expect(journal.map((row) => row.type).sort()).toEqual(
      [
        "mandate_bank_export.created",
        "mandate_bank_export.downloaded",
        "mandate_bank_export.downloaded",
        "mandate_bank_export.imported",
      ].sort(),
    );
    expect(JSON.stringify(journal)).not.toContain(DEBTOR_IBAN);
    expect(JSON.stringify(journal)).not.toContain(DEBTOR_IBAN.slice(4, 14));
    // Chaque fait cite l'export par son numéro court.
    for (const row of journal) {
      expect(row.payload).toMatchObject({ reference: "EXM-1" });
    }
  });
});
