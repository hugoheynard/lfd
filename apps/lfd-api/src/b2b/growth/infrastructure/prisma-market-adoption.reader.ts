import { Injectable } from "@nestjs/common";
import type { MarketAdoptionView } from "@lfd/contracts";

import type { AddressKind } from "../../../platform/database/client/client.js";

import { isBilling } from "../../account/infrastructure/address-kind-transition.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
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
  kind: AddressKind;
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
      where: { status: { in: ["active", "terminated"] } },
      select: {
        status: true,
        activatedAt: true,
        addresses: { select: { codePostal: true, ville: true, kind: true, isDefault: true } },
      },
    });

    const activated = new Map<
      string,
      { ville: string; total: number; beforeStart: number; lost: number }
    >();
    const activationDates: Date[] = [];
    const datesByZone = new Map<string, Date[]>();
    for (const company of companies) {
      const address = pickAddress(company.addresses);
      if (address === null || !targeted.has(address.codePostal)) {
        continue;
      }
      const zone = activated.get(address.codePostal) ?? {
        ville: address.ville,
        total: 0,
        beforeStart: 0,
        lost: 0,
      };
      if (company.status === "terminated") {
        // Une résiliée est une perte : comptée à part, jamais dans les activées.
        zone.lost += 1;
        activated.set(address.codePostal, zone);
        continue;
      }
      // Une société n'entre dans l'adoption que si elle porte une DATE d'activation.
      // Avant, la barre comptait toute société `active` (même sans `activatedAt`)
      // alors que la trajectoire n'en comptait que les datées : la barre et la courbe
      // d'une même zone ne disaient pas la même chose. Même dénominateur des deux côtés.
      if (company.activatedAt !== null) {
        zone.total += 1;
        activationDates.push(company.activatedAt);
        (datesByZone.get(address.codePostal) ?? setZone(datesByZone, address.codePostal)).push(
          company.activatedAt,
        );
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
    const window = weekStarts(now, WINDOW_WEEKS);
    const trend = penetrationTrend(window, activationDates, totalAddressable);
    const zoneTrends = config.zones.map((z) => ({
      codePostal: z.codePostal,
      ville: activated.get(z.codePostal)?.ville ?? "",
      points: penetrationTrend(window, datesByZone.get(z.codePostal) ?? [], z.addressable),
    }));
    return computeAdoption(zones, activated, trend, zoneTrends, now);
  }
}

/** Crée (et mémorise) la liste de dates d'une zone encore absente de la map. */
function setZone(map: Map<string, Date[]>, codePostal: string): Date[] {
  const list: Date[] = [];
  map.set(codePostal, list);
  return list;
}

/** Adresse représentative d'une société : facturation, sinon défaut, sinon première. */
function pickAddress(addresses: readonly AddressRow[]): AddressRow | null {
  return (
    addresses.find((a) => isBilling(a.kind)) ??
    addresses.find((a) => a.isDefault) ??
    addresses[0] ??
    null
  );
}
