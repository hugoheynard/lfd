/**
 * E2E de l'export des mandats — **le dépôt et le compte rendu CENET**
 *
 * Découpé de `mandate-bank-exports.e2e-spec.ts` le 2026-10-23 ; la scène
 * commune vit dans `mandate-bank-export-scene.ts`.
 */
import type { MandateBankExportsView } from "@lfd/contracts";
import { jsonBody } from "./e2e-harness.js";
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
  /** Hugo, 2026-10-23 : la banque ne peut pas avoir importé un fichier que personne n'a tiré. */
  it("refuse (409) de marquer déposé un export jamais téléchargé, puis l'accepte après", async () => {
    const entityId = await entity("552100554");
    await mandated(entityId, "Jamais tiré");
    const exportId = await prepare(entityId);

    const refused = await staff()
      .post(`${exportsOf(entityId)}/${exportId}/imported`)
      .expect(409);
    expect(JSON.stringify(refused.body)).toContain("jamais été téléchargé");
    await staff()
      .get(`${exportsOf(entityId)}/${exportId}/file.csv`)
      .expect(200);
    await staff()
      .post(`${exportsOf(entityId)}/${exportId}/imported`)
      .expect(204);
  });

  it("le compte rendu CENET : rien avant le dépôt ; après, « signalé » reste importé, « rejeté » repart", async () => {
    const entityId = await entity("552100554");
    await mandated(entityId, "Connu");
    await mandated(entityId, "Rejeté");
    const exportId = await prepare(entityId);
    await staff()
      .get(`${exportsOf(entityId)}/${exportId}/file.csv`)
      .expect(200);
    const read = async () =>
      jsonBody<MandateBankExportsView>(await staff().get(exportsOf(entityId)).expect(200));
    const before = await read();
    const [known, rejected] = before.mandates.map((row) => row.mandateId);
    const line = (mandateId: string | undefined) =>
      `${exportsOf(entityId)}/${exportId}/mandates/${mandateId ?? "?"}`;
    expect(before.mandates[0]?.standing).toEqual({ kind: "in_flight", exportId, downloaded: true });

    const early = await staff()
      .post(`${line(known)}/reported-known`)
      .expect(409);
    expect(JSON.stringify(early.body)).toContain("Disponible après le dépôt dans CENET");

    await staff()
      .post(`${exportsOf(entityId)}/${exportId}/imported`)
      .expect(204);
    await staff()
      .post(`${line(known)}/reported-known`)
      .expect(204);
    await staff()
      .post(`${line(rejected)}/rejected`)
      .send({ reason: "" })
      .expect(400);
    await staff()
      .post(`${line(rejected)}/rejected`)
      .send({ reason: "RUM en double" })
      .expect(204);
    await staff()
      .post(`${line(rejected)}/reported-known`)
      .expect(409);

    const after = await read();
    expect(after).toMatchObject({ toExportCount: 1, importedCount: 1 });
    expect(after.mandates.map((row) => row.standing.kind)).toEqual([
      "reported_by_bank",
      "to_export",
    ]);
    const next = await prepare(entityId);
    const lines = await ctx.prisma.mandateBankExportLine.findMany({ where: { exportId: next } });
    expect(lines.map((row) => row.mandateId)).toEqual([rejected]);
    const journal = await ctx.prisma.activityEvent.findMany({
      where: { type: "mandate_bank_export.mandate_rejected" },
      select: { payload: true },
    });
    expect(journal[0]?.payload).toMatchObject({ rejectionReason: "RUM en double" });
  });
});
