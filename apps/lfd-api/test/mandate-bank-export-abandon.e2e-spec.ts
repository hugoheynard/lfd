/**
 * E2E de l'export des mandats — **l'abandon** et le mandat révoqué depuis l'export.
 *
 * Découpé de `mandate-bank-exports.e2e-spec.ts` le 2026-10-23 ; la scène
 * commune vit dans `mandate-bank-export-scene.ts`.
 */
import type { MandateBankExportsView } from "@lfd/contracts";
import { daysAgo, jsonBody } from "./e2e-harness.js";
import {
  ctx,
  entity,
  exportsOf,
  mandated,
  prepare,
  staff,
  useMandateBankExportScene,
} from "./mandate-bank-export-scene.js";

useMandateBankExportScene();

describe("l'export des mandats pour la banque", () => {
  it("abandonné, un export se clôt : ni fichier ni import, et ses mandats repartent", async () => {
    const entityId = await entity("552100554");
    await mandated(entityId, "Client");
    const rejected = await prepare(entityId);

    await staff()
      .post(`${exportsOf(entityId)}/${rejected}/abandoned`)
      .expect(204);
    await staff()
      .post(`${exportsOf(entityId)}/${rejected}/abandoned`)
      .expect(409);
    await staff()
      .post(`${exportsOf(entityId)}/${rejected}/imported`)
      .expect(409);
    await staff()
      .get(`${exportsOf(entityId)}/${rejected}/file.csv`)
      .expect(409);

    const card = jsonBody<MandateBankExportsView>(
      await staff().get(exportsOf(entityId)).expect(200),
    );
    expect(card).toMatchObject({ toExportCount: 1, importedCount: 0 });
    expect(card.exports[0]).toMatchObject({ id: rejected, importedAt: null });
    expect(card.exports[0]?.abandonedAt).not.toBeNull();

    const second = await prepare(entityId);
    await staff()
      .get(`${exportsOf(entityId)}/${second}/file.csv`)
      .expect(200);
    await staff()
      .post(`${exportsOf(entityId)}/${second}/imported`)
      .expect(204);
    await staff()
      .post(`${exportsOf(entityId)}/${second}/abandoned`)
      .expect(409);
  });

  it("refuse (409) le fichier d'un mandat révoqué depuis l'export", async () => {
    const entityId = await entity("552100554");
    const rum = await mandated(entityId, "Client");
    const exportId = await prepare(entityId);
    await ctx.prisma.paymentMandate.updateMany({
      where: { reference: rum },
      data: { status: "revoked", revokedAt: new Date(daysAgo(0)) },
    });

    const refused = await staff()
      .get(`${exportsOf(entityId)}/${exportId}/file.csv`)
      .expect(409);
    expect(refused.text).toContain(rum);
  });
});
