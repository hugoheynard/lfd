/**
 * E2E **la purge et l'effacement des pièces de remise**
 * (`documentation/livraisons/a-la-porte.md`, « Les pièces de remise :
 * conservées sans limite, purgeables », 2026-10-01).
 *
 * Ce que seule cette suite prouve : la coupure se compare au VRAI
 * `recorded_at` en base, la ligne part avec ses images du stockage de test, le
 * fait s'écrit au vrai journal (sa charge confrontée au catalogue). Aucune route : les commandes
 * passent par le bus, comme le fera un appel planifié.
 */
import { CommandBus } from "@nestjs/cqrs";

import { EraseHandoverProofsCommand } from "../src/handover/application/commands/erase-handover-proofs.command.js";
import { PurgeHandoverProofsOlderThanCommand } from "../src/handover/application/commands/purge-handover-proofs-older-than.command.js";
import { HandoverProof } from "../src/handover/domain/entities/handover-proof.js";
import { HandoverProofRepository } from "../src/handover/domain/ports/handover-proof.repository.js";
import { ProductionDocumentStore } from "../src/platform/storage/production-document-store.js";
import { bootstrapE2e, daysAgo, type E2eContext } from "./e2e-harness.js";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const RETENTION_DAYS = 90;
const EXPIRED = daysAgo(RETENTION_DAYS + 30);
const KEPT = daysAgo(RETENTION_DAYS - 30);

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** Une pièce gravée par sa factory, ses images rangées au stockage de test. */
async function proofTakenAt(orderId: string, recordedAt: string, signed: boolean) {
  const store = ctx.app.get(ProductionDocumentStore);
  const photoKey = await store.save(`handover/proofs/${orderId}/photo`, {
    bytes: JPEG,
    contentType: "image/jpeg",
  });
  const signatureKey = signed
    ? await store.save(`handover/proofs/${orderId}/signature`, {
        bytes: JPEG,
        contentType: "image/jpeg",
      })
    : null;
  const proof = HandoverProof.attach({
    orderId,
    receiverName: "Mme Durand",
    photoKey,
    signatureKey,
    recordedBy: "stf_livreur",
    recordedAt: new Date(recordedAt),
  });
  await ctx.app.get(HandoverProofRepository).record(proof);
  return proof;
}

async function imagesLeft(proof: HandoverProof): Promise<number> {
  const store = ctx.app.get(ProductionDocumentStore);
  const found = await Promise.all(proof.imageKeys().map((key) => store.readIfPresent(key)));
  return found.filter((bytes) => bytes !== null).length;
}

function erasedFacts(orderId: string) {
  return ctx.prisma.activityEvent.findMany({
    where: { subjectId: orderId, type: "order_handover_proof.erased" },
  });
}

describe("PurgeHandoverProofsOlderThan", () => {
  it("efface ce qui a dépassé la durée — ligne et images — et garde le reste", async () => {
    const old = await proofTakenAt("ord_old", EXPIRED, true);
    const recent = await proofTakenAt("ord_recent", KEPT, true);

    await ctx.app.get(CommandBus).execute(new PurgeHandoverProofsOlderThanCommand(RETENTION_DAYS));

    expect(await ctx.prisma.orderHandoverProof.count({ where: { orderId: "ord_old" } })).toBe(0);
    expect(await imagesLeft(old)).toBe(0);
    expect(await ctx.prisma.orderHandoverProof.count({ where: { orderId: "ord_recent" } })).toBe(1);
    expect(await imagesLeft(recent)).toBe(2);

    const facts = await erasedFacts("ord_old");
    expect(facts).toHaveLength(1);
    expect(facts[0]?.payload).toEqual({ recordedAt: EXPIRED, signed: true, cause: "retention" });
    expect(await erasedFacts("ord_recent")).toHaveLength(0);
  });

  it("rejouée, elle n'efface rien de plus et n'écrit aucun fait de plus", async () => {
    await proofTakenAt("ord_old", EXPIRED, false);
    const bus = ctx.app.get(CommandBus);

    await bus.execute(new PurgeHandoverProofsOlderThanCommand(RETENTION_DAYS));
    await bus.execute(new PurgeHandoverProofsOlderThanCommand(RETENTION_DAYS));

    expect(await erasedFacts("ord_old")).toHaveLength(1);
  });
});

describe("EraseHandoverProofs", () => {
  it("efface les pièces d'une seule commande, récentes comprises", async () => {
    const mine = await proofTakenAt("ord_mine", KEPT, true);
    const other = await proofTakenAt("ord_other", KEPT, false);

    await ctx.app.get(CommandBus).execute(new EraseHandoverProofsCommand("ord_mine"));

    expect(await ctx.prisma.orderHandoverProof.count({ where: { orderId: "ord_mine" } })).toBe(0);
    expect(await imagesLeft(mine)).toBe(0);
    expect(await imagesLeft(other)).toBe(1);
    const facts = await erasedFacts("ord_mine");
    expect(facts[0]?.payload).toMatchObject({ cause: "request", signed: true });
    expect(JSON.stringify(facts[0]?.payload)).not.toContain("Durand");
  });
});
