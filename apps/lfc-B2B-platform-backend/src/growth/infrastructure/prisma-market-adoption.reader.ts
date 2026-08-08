import { Injectable } from "@nestjs/common";
import type { MarketAdoptionView } from "@lfd/contracts";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { Clock } from "../../infra/time/clock.js";
import { weekStarts } from "../domain/growth-stats.js";
import { computeAdoption, penetrationTrend } from "../domain/market-adoption.js";
import { MarketAdoptionReader } from "../domain/ports/market-adoption.reader.js";
import { MarketConfigStore } from "../domain/ports/market-config.store.js";

const WINDOW_WEEKS = 13;
const WINDOW_MS = WINDOW_WEEKS * 7 * 24 * 60 * 60 * 1000;

/** Une adresse réduite à ce qui décide la zone d'une société. */
interface AddressRow {
  codePostal: string;
  ville: string;
  kind: "facturation" | "livraison";
  isDefault: boolean;
}

/**
 * Adaptateur Prisma de l'adoption : rattache les sociétés **activées** à leur zone
 * (code postal de l'adresse de facturation, sinon défaut/première), les compte par
 * zone (total + part antérieure au début de la fenêtre), puis délègue le calcul de
 * pénétration à `computeAdoption` (pur). Fenêtre alignée sur le dashboard (13 sem.).
 */
@Injectable()
export class PrismaMarketAdoptionReader extends MarketAdoptionReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: MarketConfigStore,
    private readonly clock: Clock,
  ) {
    super();
  }

  async load(): Promise<MarketAdoptionView> {
    const now = this.clock.now();
    const start = new Date(now.getTime() - WINDOW_MS);
    const config = await this.store.load();
    const targeted = new Set(config.zones.map((z) => z.codePostal));

    const companies = await this.prisma.company.findMany({
      where: { status: "active", activatedAt: { not: null } },
      select: {
        activatedAt: true,
        addresses: { select: { codePostal: true, ville: true, kind: true, isDefault: true } },
      },
    });

    const activated = new Map<string, { ville: string; total: number; beforeStart: number }>();
    const activationDates: Date[] = [];
    for (const company of companies) {
      const address = pickAddress(company.addresses);
      if (address === null || !targeted.has(address.codePostal)) {
        continue;
      }
      const zone = activated.get(address.codePostal) ?? {
        ville: address.ville,
        total: 0,
        beforeStart: 0,
      };
      zone.total += 1;
      if (company.activatedAt !== null) {
        activationDates.push(company.activatedAt);
        if (company.activatedAt < start) {
          zone.beforeStart += 1;
        }
      }
      activated.set(address.codePostal, zone);
    }

    const zones = config.zones.map((z) => ({
      codePostal: z.codePostal,
      addressable: z.addressable,
    }));
    const totalAddressable = zones.reduce((sum, z) => sum + z.addressable, 0);
    const trend = penetrationTrend(weekStarts(now, WINDOW_WEEKS), activationDates, totalAddressable);
    return computeAdoption(zones, activated, trend, now);
  }
}

/** Adresse représentative d'une société : facturation, sinon défaut, sinon première. */
function pickAddress(addresses: readonly AddressRow[]): AddressRow | null {
  return (
    addresses.find((a) => a.kind === "facturation") ??
    addresses.find((a) => a.isDefault) ??
    addresses[0] ??
    null
  );
}
