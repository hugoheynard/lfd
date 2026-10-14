import { DeclareTransferBinsCommand } from "../../delivery/application/commands/declare-transfer-bins.command.js";
import { LoadDeliveryBinCommand } from "../../delivery/application/commands/load-delivery-bin.command.js";
import { BIN_M } from "./delivery-bins.seed.js";
import { asStaff, SEED_STAFF_SUB, type SeedContext } from "./order-placing.seed.js";

/** Un bac M par transfert : les sacs du Village y tiennent (deux commandes au plus). */
const TRANSFER_BINS = 1;

/**
 * **Les bacs des transferts placés, déclarés puis chargés** (2026-10-14) —
 * comme au poste de chargement (lot T3) : les sacs des commandes du site vont
 * dans un bac qui appartient au TRANSFERT, et « Partir » exige qu'il soit
 * chargé. Sans eux, la tournée qui porte le transfert du Village refuserait
 * de partir, et la journée ne serait pas « prête ».
 *
 * Ne vise que les transferts PRÉVUS (ni partis, ni reçus) qui ont un arrêt
 * vivant dans une tournée du jour ; un transfert qui a déjà ses bacs n'en
 * reçoit pas d'autres.
 *
 * @returns le nombre de bacs de transfert chargés.
 */
export async function loadTransferBins(
  context: SeedContext,
  day: { readonly forDay: string; readonly at: Date },
): Promise<number> {
  const binType = await context.prisma.deliveryBinType.findFirst({
    where: { name: BIN_M },
    select: { id: true },
  });
  if (binType === null) {
    throw new Error(
      `Type de bac « ${BIN_M} » absent : semer les types de bacs avant le chargement.`,
    );
  }
  const stops = await context.prisma.deliveryRoundStop.findMany({
    where: {
      serviceDay: day.forDay,
      removedAt: null,
      transfer: { departedAt: null, receivedAt: null, bins: { none: {} } },
    },
    select: {
      roundId: true,
      transferId: true,
      transfer: { select: { items: { where: { detachedAt: null }, select: { id: true } } } },
    },
  });
  let loaded = 0;
  for (const stop of stops) {
    if (stop.transferId === null || stop.transfer === null) continue;
    const transferId = stop.transferId;
    const innerBags = stop.transfer.items.length;
    const binIds = await asStaff(day.at, () =>
      context.commands.execute<DeclareTransferBinsCommand, readonly string[]>(
        new DeclareTransferBinsCommand(transferId, binType.id, TRANSFER_BINS, innerBags),
      ),
    );
    for (const binId of binIds) {
      await asStaff(day.at, () =>
        context.commands.execute(
          new LoadDeliveryBinCommand(stop.roundId, { binId }, SEED_STAFF_SUB),
        ),
      );
      loaded += 1;
    }
  }
  return loaded;
}
