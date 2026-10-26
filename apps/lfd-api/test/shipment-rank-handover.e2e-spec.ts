/**
 * Le rang de l'envoi en base, au retrait (plan
 * `documentation/commandes/plan-e7-reliquat-bati.md`, choix 5, 12 et 14, lot
 * L3d) : l'attestation, la garde passée au livreur et les pièces d'une remise
 * à la porte se tiennent par envoi `(commande, rang)`.
 *
 * Ce que seul le vrai Postgres prouve : que les clés recréées par la migration
 * laissent coexister deux lignes d'une commande, une par rang, refusent un
 * second envoi de même rang, et gardent la référence unique sur toute la
 * table. Chaque ligne passe par le port qui l'écrit, jamais par un INSERT.
 */
import { HandoverProof } from "../src/handover/domain/entities/handover-proof.js";
import { OrderHandover } from "../src/handover/domain/entities/order-handover.js";
import { HandoverProofEraser } from "../src/handover/domain/ports/handover-proof.eraser.js";
import { HandoverProofRepository } from "../src/handover/domain/ports/handover-proof.repository.js";
import { OrderDepartureRepository } from "../src/handover/domain/ports/order-departure.repository.js";
import { OrderHandoverRepository } from "../src/handover/domain/ports/order-handover.repository.js";
import { ShipmentRef } from "../src/production/channels/handover/index.js";
import { bootstrapE2e, daysAgo, type E2eContext } from "./e2e-harness.js";

const ORDER = "ord_rank";
const FIRST = ShipmentRef.firstOf(ORDER);
const REMAINDER = ShipmentRef.of(ORDER, 2);
const HANDED_OVER = new Date(daysAgo(1));
const DEPARTED = new Date(daysAgo(2));
const BROUGHT_BACK = new Date(daysAgo(1));

function attestation(rank: number, reference: string): OrderHandover {
  return OrderHandover.rehydrate(ORDER, reference, HANDED_OVER, "stf_ines", "scan", rank);
}

function proof(rank: number): HandoverProof {
  return HandoverProof.attach({
    orderId: ORDER,
    rank,
    receiverName: "Mme Durand",
    photoKey: `handover/proofs/${ORDER}-${String(rank)}/photo`,
    signatureKey: null,
    signedSlipKey: null,
    recordedBy: "stf_paul",
    recordedAt: HANDED_OVER,
  });
}

describe("Le rang de l'envoi en base — le retrait (L3d)", () => {
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

  it("order_handover : deux rangs, deux attestations ; un même rang ou une même référence, refusés", async () => {
    const handovers = ctx.app.get(OrderHandoverRepository);

    expect(await handovers.attest(attestation(1, "ORD-0042"))).toBe(true);
    expect(await handovers.attest(attestation(2, "ORD-0042-2"))).toBe(true);
    expect(await handovers.attest(attestation(2, "ORD-0042-2b"))).toBe(false);
    expect(await handovers.attest(attestation(3, "ORD-0042"))).toBe(false);

    const rows = await ctx.prisma.orderHandover.findMany({
      where: { orderId: ORDER },
      orderBy: { rank: "asc" },
      select: { rank: true, reference: true },
    });
    expect(rows).toEqual([
      { rank: 1, reference: "ORD-0042" },
      { rank: 2, reference: "ORD-0042-2" },
    ]);
    // La lecture « par commande » reste celle de la commande : le rang 1.
    expect((await handovers.findByOrderId(ORDER))?.reference).toBe("ORD-0042");
  });

  it("order_departure : deux rangs, deux lignes ; le retour de l'un ne ramène pas l'autre", async () => {
    const departures = ctx.app.get(OrderDepartureRepository);

    await departures.recordDeparted([FIRST, REMAINDER], DEPARTED);
    await departures.recordReturned([REMAINDER], BROUGHT_BACK);

    const rows = await ctx.prisma.orderDeparture.findMany({
      where: { orderId: ORDER },
      orderBy: { rank: "asc" },
    });
    expect(rows).toEqual([
      { orderId: ORDER, rank: 1, departedAt: DEPARTED, returnedAt: null },
      { orderId: ORDER, rank: 2, departedAt: DEPARTED, returnedAt: BROUGHT_BACK },
    ]);
  });

  it("order_handover_proof : deux rangs, deux preuves ; effacer l'une laisse l'autre", async () => {
    const proofs = ctx.app.get(HandoverProofRepository);
    await proofs.record(proof(1));
    await proofs.record(proof(2));

    await expect(proofs.record(proof(2))).rejects.toThrow();
    expect((await proofs.findByOrderId(ORDER))?.state.rank).toBe(1);

    expect(await ctx.app.get(HandoverProofEraser).erase(ORDER, 2)).toBe(true);
    const left = await ctx.prisma.orderHandoverProof.findMany({
      where: { orderId: ORDER },
      select: { rank: true },
    });
    expect(left).toEqual([{ rank: 1 }]);
  });
});
