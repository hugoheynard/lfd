import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { departureViewOf } from "../application/departure-view.js";
import { DepartureCandidatesReader } from "../channels/commerce/departure-candidates.reader.js";
import { DepartureSiteReader } from "../channels/commerce/departure-site.reader.js";
import { DEPARTURE_KEY } from "./departure.key.js";

/**
 * Le départ résolu par la MÊME règle que l'écran (`departureViewOf`) : le
 * choix enregistré, sinon le défaut, parmi les candidats que le commerce sert
 * — les sites qui livrent. Une seule règle, deux lecteurs : l'écran et le
 * refus du commerce ne peuvent pas diverger.
 */
@Injectable()
export class ResolvedDepartureSiteReader extends DepartureSiteReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly candidates: DepartureCandidatesReader,
  ) {
    super();
  }

  async currentSiteId(): Promise<string | null> {
    // Séquentiel, pas `Promise.all` : appelé sous une unité de travail, les deux
    // lectures partageraient le client de la transaction, que `pg` file en
    // silence (DeprecationWarning, retiré de pg@9) — cf. le blocage e2e du 2026-10-26.
    const row = await this.prisma.deliveryDeparture.findUnique({
      where: { key: DEPARTURE_KEY },
      select: { pickupAddressId: true },
    });
    const candidates = await this.candidates.list();
    return departureViewOf(row?.pickupAddressId ?? null, candidates).point?.pickupAddressId ?? null;
  }
}
