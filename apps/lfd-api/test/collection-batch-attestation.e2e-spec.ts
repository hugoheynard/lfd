/**
 * E2E du lot de prélèvement — **ses attestations** (plan
 * `plan-page-procedure-de-prelevement.md` § 1.2, § 3.3, P3) : contrôle CSV
 * relu, remise signée sur CENET, comptes rendus PSR lus. Ce que seuls le
 * vrai SQL et la vraie chaîne d'accès prouvent : le registre en ajout seul,
 * la dernière ligne qui fait foi relue par la procédure, le mur des droits.
 */
import type { CollectionProcedureView } from "@lfd/contracts";
import { jsonBody } from "./e2e-harness.js";
import {
  BASE,
  client,
  collectingEntity,
  constitute,
  ctx,
  mandated,
  orderOf,
  staff,
  useCollectionBatchScene,
} from "./collection-batch-scene.js";

useCollectionBatchScene();

const attestationsOf = (batchId: string): string => `${BASE}/batches/${batchId}/attestations`;

async function procedure(entityId: string): Promise<CollectionProcedureView> {
  return jsonBody<CollectionProcedureView>(
    await staff()
      .get(`/admin/accounting/collection-procedure?legalEntityId=${entityId}`)
      .expect(200),
  );
}

/** Un lot préparé par les vrais gestes ; `deposit` le télécharge puis le dit déposé. */
async function lot(
  deposit: boolean,
): Promise<{ readonly entity: string; readonly batchId: string }> {
  const entity = await collectingEntity();
  const port = await client("Boulangerie du Port");
  await mandated(entity, port);
  await orderOf(port);
  const [batchId = ""] = await constitute(entity);
  if (deposit) {
    await staff().get(`${BASE}/batches/${batchId}/file.xml`).expect(200);
    await staff().post(`${BASE}/batches/${batchId}/deposit`).expect(204);
  }
  return { entity, batchId };
}

describe("les attestations du lot (P3)", () => {
  it("la remise signée fait passer l'onglet 3 à « fait » ; retirée, il attend de nouveau", async () => {
    const { entity, batchId } = await lot(true);
    expect((await procedure(entity)).file).toMatchObject({
      state: "waiting",
      reason: "signature_to_attest",
    });

    await staff().post(attestationsOf(batchId)).send({ kind: "remittance_signed" }).expect(201);
    const signed = await procedure(entity);
    expect(signed.file).toMatchObject({ state: "done", reason: "deposited" });
    expect(signed.followed?.attestations.remittance_signed).not.toBeNull();
    await staff().post(attestationsOf(batchId)).send({ kind: "remittance_signed" }).expect(409);

    await staff()
      .post(`${attestationsOf(batchId)}/withdrawn`)
      .send({ kind: "remittance_signed", note: "   " })
      .expect(400);
    await staff()
      .post(`${attestationsOf(batchId)}/withdrawn`)
      .send({ kind: "remittance_signed", note: "cochée sur le mauvais lot" })
      .expect(201);

    const withdrawn = await procedure(entity);
    expect(withdrawn.file.reason).toBe("signature_to_attest");
    expect(withdrawn.followed?.attestations.remittance_signed).toBeNull();
    expect(
      (
        await ctx.prisma.collectionBatchAttestation.findMany({ orderBy: { attestedAt: "asc" } })
      ).map((row) => [row.kind, row.withdrawn, row.note]),
    ).toEqual([
      ["remittance_signed", false, null],
      ["remittance_signed", true, "cochée sur le mauvais lot"],
    ]);
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: { startsWith: "collection_batch_attestation." } },
      orderBy: { occurredAt: "asc" },
    });
    expect(facts.map((fact) => [fact.type, fact.subjectId])).toEqual([
      ["collection_batch_attestation.attested", entity],
      ["collection_batch_attestation.withdrawn", entity],
    ]);
  });

  it("avant le dépôt : le contrôle CSV relu se coche, la signature est refusée (409)", async () => {
    const { batchId } = await lot(false);

    await staff().post(attestationsOf(batchId)).send({ kind: "audit_reviewed" }).expect(201);
    const refused = await staff()
      .post(attestationsOf(batchId))
      .send({ kind: "remittance_signed" })
      .expect(409);
    expect(refused.text).toContain("J'ai déposé le fichier dans CENET");
  });

  it("une attestation ne ferme aucun geste : un lot jamais relu se dépose", async () => {
    const { batchId } = await lot(true);

    expect(await ctx.prisma.collectionBatchAttestation.count()).toBe(0);
    expect(
      (await ctx.prisma.collectionBatch.findUniqueOrThrow({ where: { id: batchId } })).status,
    ).toBe("deposited");
  });

  /** Ce que seule la base prouve : le registre refuse qu'on modifie ou efface une ligne. */
  it("la base refuse de modifier ou d'effacer une attestation", async () => {
    const { batchId } = await lot(false);
    await staff().post(attestationsOf(batchId)).send({ kind: "audit_reviewed" }).expect(201);

    await expect(ctx.prisma.collectionBatchAttestation.deleteMany({})).rejects.toThrow(
      /append_only/u,
    );
    await expect(
      ctx.prisma.collectionBatchAttestation.updateMany({ data: { withdrawn: true, note: "x" } }),
    ).rejects.toThrow(/append_only/u);
  });

  it("refuse une sorte inconnue (400) et un lot inconnu (404)", async () => {
    const { batchId } = await lot(false);

    await staff().post(attestationsOf(batchId)).send({ kind: "csv_reviewed" }).expect(400);
    await staff().post(attestationsOf("lot_inconnu")).send({ kind: "psr_read" }).expect(404);
  });

  it("refuse l'attestation et le retrait à la seule lecture comptable (403)", async () => {
    const { batchId } = await lot(false);
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
      .post(attestationsOf(batchId))
      .send({ kind: "audit_reviewed" })
      .expect(403);
    await ctx
      .asSub("staff-lecture")
      .post(`${attestationsOf(batchId)}/withdrawn`)
      .send({ kind: "audit_reviewed", note: "x" })
      .expect(403);
    expect(await ctx.prisma.collectionBatchAttestation.count()).toBe(0);
  });
});
