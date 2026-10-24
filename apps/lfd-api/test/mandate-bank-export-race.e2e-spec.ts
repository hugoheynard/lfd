/**
 * E2E de l'export des mandats — **la course** : des préparations simultanées
 * pour la même entité ne prennent jamais le même mandat
 * (`prerequis-export-mandats.md`, verrou par entité et sorte d'export).
 *
 * Constaté le 2026-10-24 (deux passages, cinq préparations) : sans
 * `lock.acquire` dans le handler, ce test est rouge —
 * plusieurs préparations répondent 201 et figent les mêmes mandats sous
 * plusieurs numéros EXM, ce que la banque rejetterait à l'import du second fichier.
 */
import {
  ctx,
  entity,
  exportsOf,
  mandated,
  staff,
  useMandateBankExportScene,
} from "./mandate-bank-export-scene.js";

/** Le nombre de préparations lancées ensemble. */
const RACERS = 5;

useMandateBankExportScene();

describe("des préparations simultanées d'un export des mandats", () => {
  it("les suivantes ne reprennent aucun mandat de la première : elles sont refusées faute de reste", async () => {
    const entityId = await entity("552100554");
    await mandated(entityId, "Premier");
    await mandated(entityId, "Second");

    // Cinq à la fois : à deux, l'entrelacement n'est pas garanti à chaque passage.
    const responses = await Promise.all(
      Array.from({ length: RACERS }, () => staff().post(exportsOf(entityId)).send({})),
    );

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409, 409, 409, 409]);
    const lines = await ctx.prisma.mandateBankExportLine.findMany({
      select: { exportId: true, mandateId: true },
    });
    expect(new Set(lines.map((line) => line.exportId)).size).toBe(1);
    expect(new Set(lines.map((line) => line.mandateId)).size).toBe(2);
    expect(lines).toHaveLength(2);
  });
});
