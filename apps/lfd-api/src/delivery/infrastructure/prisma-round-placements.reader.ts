import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  RoundPlacementsReader,
  type RoundPlacement,
  type RoundPlacements,
} from "../channels/handover/index.js";
import { roundPaperTitle } from "../domain/services/round-paper.js";

/** Un arrêt de tournée lu pour sa place. */
interface PlacedStopRow {
  readonly orderId: string;
  readonly position: number;
  readonly closedAt: Date | null;
  readonly createdAt: Date;
  readonly round: { readonly id: string; readonly vehicleName: string; readonly passage: number };
}

/**
 * **Adaptateur Prisma de la place des commandes dans leurs tournées.** Il ne
 * lit que les tables de la livraison, et n'écrit rien. Deux questions, jamais
 * N + 1.
 *
 * Un arrêt retiré n'est plus une place. Un arrêt CLOS (livré ou raté) en
 * reste une : la commande a bien roulé dans cette tournée. Quand une commande
 * en a plusieurs (rapportée puis replacée), l'arrêt vivant gagne, sinon le
 * plus récent.
 */
@Injectable()
export class PrismaRoundPlacementsReader extends RoundPlacementsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async placementsOf(day: string, orderIds: readonly string[]): Promise<RoundPlacements> {
    const [roundCount, stops] = await Promise.all([
      this.prisma.deliveryRound.count({ where: { serviceDay: day } }),
      orderIds.length === 0
        ? Promise.resolve([])
        : this.prisma.deliveryRoundStop.findMany({
            where: { orderId: { in: [...orderIds] }, removedAt: null },
            select: {
              orderId: true,
              position: true,
              closedAt: true,
              createdAt: true,
              round: { select: { id: true, vehicleName: true, passage: true } },
            },
          }),
    ]);
    return { roundCount, byOrder: placementsByOrder(stops) };
  }
}

/** La place retenue par commande : l'arrêt vivant, sinon le plus récent. */
export function placementsByOrder(
  stops: readonly PlacedStopRow[],
): ReadonlyMap<string, RoundPlacement> {
  const chosen = new Map<string, PlacedStopRow>();
  for (const stop of stops) {
    const current = chosen.get(stop.orderId);
    if (current === undefined || prefers(stop, current)) {
      chosen.set(stop.orderId, stop);
    }
  }
  const placements = new Map<string, RoundPlacement>();
  for (const [orderId, stop] of chosen) {
    placements.set(orderId, {
      roundId: stop.round.id,
      label: roundPaperTitle(stop.round),
      position: stop.position,
    });
  }
  return placements;
}

function prefers(candidate: PlacedStopRow, current: PlacedStopRow): boolean {
  const candidateLive = candidate.closedAt === null;
  const currentLive = current.closedAt === null;
  if (candidateLive !== currentLive) {
    return candidateLive;
  }
  return candidate.createdAt.getTime() > current.createdAt.getTime();
}
