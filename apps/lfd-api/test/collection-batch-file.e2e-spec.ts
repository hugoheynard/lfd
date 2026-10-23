/**
 * E2E du lot de prélèvement figé — **le fichier** : mêmes octets à chaque
 * téléchargement, et réservé au droit d'écriture (A16).
 *
 * Découpé de `collection-batches.e2e-spec.ts` le 2026-10-23 ; scène commune
 * dans `collection-batch-scene.ts`.
 */
import {
  BASE,
  client,
  collectingEntity,
  constitute,
  ctx,
  mandated,
  messageIdOf,
  orderOf,
  staff,
  useCollectionBatchScene,
} from "./collection-batch-scene.js";

useCollectionBatchScene();

describe("le lot figé", () => {
  /**
   * Régression : le fichier, qui porte les IBAN en clair, se téléchargeait
   * avec la seule lecture comptable (A16, resserré le 2026-10-09).
   */
  it("refuse le fichier du lot à la seule lecture comptable (403)", async () => {
    const entity = await collectingEntity();
    const port = await client("Boulangerie du Phare");
    await mandated(entity, port);
    await orderOf(port);
    const [batchId] = await constitute(entity);
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

    await ctx
      .asSub("staff-lecture")
      .get(`${BASE}/batches/${batchId ?? ""}/audit.csv`)
      .expect(200);
    await ctx
      .asSub("staff-lecture")
      .get(`${BASE}/batches/${batchId ?? ""}/file.xml`)
      .expect(403);
    await staff()
      .get(`${BASE}/batches/${batchId ?? ""}/file.xml`)
      .expect(200);
  });

  it("rend deux fois les MÊMES octets, sous les identifiants du lot", async () => {
    const entity = await collectingEntity();
    const port = await client("Boulangerie du Port");
    await mandated(entity, port);
    await orderOf(port);

    const [batchId] = await constitute(entity);
    const first = await staff()
      .get(`${BASE}/batches/${batchId ?? ""}/file.xml`)
      .expect(200);
    const second = await staff()
      .get(`${BASE}/batches/${batchId ?? ""}/file.xml`)
      .expect(200);

    expect(second.text).toBe(first.text);
    expect(messageIdOf(first.text)).toBe(batchId);
    expect(first.text).toContain(`<EndToEndId>${batchId ?? ""}-0001</EndToEndId>`);
    expect(first.headers["content-disposition"]).not.toContain("BROUILLON");
    // Le nom dit la procédure (PRL-AAMMJJ-rythmes), le schéma, l'échéance et le nombre de débits.
    expect(first.headers["content-disposition"]).toMatch(
      /filename="?CENET-PRL-\d{6}-[BHM]+-(CORE|B2B)(-echeance-\d{4}-\d{2}-\d{2})?-1-debit\.xml/u,
    );
    expect(second.headers["content-disposition"]).toBe(first.headers["content-disposition"]);
    const csv = await staff()
      .get(`${BASE}/batches/${batchId ?? ""}/audit.csv`)
      .expect(200);
    expect(csv.text).toContain("CMD-LOT-");
  });
});
