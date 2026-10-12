/**
 * E2E des **courses de la refusion du bon** (plan
 * `documentation/order/plan-annulation-de-commande.md`, C3b.5, C3b.9) :
 * une passation qui engage le reliquat pendant l'annulation, et l'expiration
 * de nuit qui croise une refusion à la date limite.
 */
import { CommandBus } from "@nestjs/cqrs";

import { ExpireLoyaltyVouchersCommand } from "../src/b2b/loyalty/application/commands/expire-loyalty-vouchers.command.js";
import { LoyaltyVoucher } from "../src/b2b/loyalty/domain/entities/loyalty-voucher.js";
import { LoyaltyVoucherRepository } from "../src/b2b/loyalty/domain/ports/loyalty-voucher.repository.js";
import { OrderStatus } from "../src/platform/database/client/client.js";
import type { E2eContext } from "./e2e-harness.js";
import { cancelRequest, orderState, resetScene } from "./order-staff-cancel-scene.js";
import {
  bootVoucherScene,
  clock,
  convert,
  fidelity,
  place,
  placed,
  remainderOf,
  voucherRow,
} from "./order-staff-cancel-voucher-scene.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootVoucherScene();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await resetScene();
  clock.set(new Date());
});

/** O1 a laissé R1 ; on va annuler O1 pendant qu'une passation veut R1. */
async function remainderInPlay() {
  const user = await fidelity();
  const parent = await convert(user);
  const first = await placed(parent, 1);
  return { parent, first, r1: await remainderOf(parent) };
}

describe("passation qui engage le reliquat × annulation", () => {
  it("la passation passe d'abord : l'annulation est refusée et nomme la nouvelle commande", async () => {
    const { first, r1 } = await remainderInPlay();
    const second = await placed(r1, 1);

    const response = await cancelRequest(first.id);

    expect(response.status).toBe(409);
    expect(response.text).toContain(second.number);
    expect((await orderState(first.id)).status).toBe(OrderStatus.placed);
  });

  it("l'annulation passe d'abord : la passation est refusée, le client retrouve son bon", async () => {
    const { parent, first, r1 } = await remainderInPlay();

    await cancelRequest(first.id).expect(204);
    const response = await place(r1, 1);

    expect(response.status).toBe(409);
    expect(await voucherRow(r1)).toMatchObject({ status: "merged_back" });
    expect(await voucherRow(parent)).toMatchObject({ status: "available", valueCents: 500 });
  });

  it("lancées ensemble : le verrou du titulaire ne laisse jamais les deux réussir", async () => {
    const { first, r1 } = await remainderInPlay();

    const [cancelled, placing] = await Promise.all([cancelRequest(first.id), place(r1, 1)]);

    expect([cancelled.status, placing.status].sort()).toEqual(
      cancelled.status === 204 ? [204, 409] : [201, 409],
    );
    const child = await voucherRow(r1);
    if (cancelled.status === 204) {
      expect(child.status).toBe("merged_back");
    } else {
      expect(child.status).toBe("reserved");
      expect((await orderState(first.id)).status).toBe(OrderStatus.placed);
    }
  });
});

describe("expiration de nuit × refusion à la date limite", () => {
  /**
   * Régression (C3b.1, 3) : l'expiration chargeait hors transaction et
   * sauvait sans condition. Un reliquat listé « échu », refondu juste avant sa
   * date limite par une annulation, était réécrit `expired` par-dessus.
   */
  it("un reliquat refondu entre la liste et l'écriture n'est pas réécrit `expired`", async () => {
    const { first, r1 } = await remainderInPlay();
    const { expiresAt } = await voucherRow(r1);
    const repository = ctx.app.get(LoyaltyVoucherRepository);
    const listing = repository.loadDueForExpiry.bind(repository);
    repository.loadDueForExpiry = async (now: Date, limit: number) => {
      const due: readonly LoyaltyVoucher[] = await listing(now, limit);
      repository.loadDueForExpiry = listing;
      // L'annulation se glisse une milliseconde avant la date limite.
      clock.set(new Date(expiresAt.getTime() - 1));
      await cancelRequest(first.id).expect(204);
      clock.set(expiresAt);
      return due;
    };
    clock.set(expiresAt);

    await ctx.app.get(CommandBus).execute(new ExpireLoyaltyVouchersCommand());

    expect(await voucherRow(r1)).toMatchObject({ status: "merged_back" });
  });
});
