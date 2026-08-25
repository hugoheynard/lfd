import { Injectable } from "@nestjs/common";
import type { MarketSectorsView } from "@lfd/contracts";

import type { AddressKind } from "../../../platform/database/client/client.js";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import {
  computeSectorMovements,
  type SectorCounts,
  type SectorZoneConfig,
} from "../domain/market-sectors.js";
import { MarketConfigStore } from "../domain/ports/market-config.store.js";
import { MarketSectorsReader } from "../domain/ports/market-sectors.reader.js";

/** Une adresse réduite à ce qui décide la zone d'une société. */
interface AddressRow {
  codePostal: string;
  ville: string;
  kind: AddressKind;
  isDefault: boolean;
}

/**
 * Adaptateur Prisma du **mix clients par secteur** : rattache chaque société
 * active/résiliée à sa zone (adresse de facturation, sinon défaut/première) et à son
 * `nafCode`, compte actives/résiliées par (zone × NAF), puis délègue l'assemblage
 * avec le pool par NAF (config marché) à `computeSectorMovements` (pur).
 */
@Injectable()
export class PrismaMarketSectorsReader extends MarketSectorsReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: MarketConfigStore,
    private readonly clock: Clock,
  ) {
    super();
  }

  async load(): Promise<MarketSectorsView> {
    const config = await this.store.load();
    const targeted = new Set(config.zones.map((z) => z.codePostal));
    const companies = await this.prisma.company.findMany({
      where: { status: { in: ["active", "terminated"] } },
      select: {
        status: true,
        nafCode: true,
        addresses: { select: { codePostal: true, ville: true, kind: true, isDefault: true } },
      },
    });

    const counts = new Map<string, Map<string, SectorCounts>>();
    const villeByZone = new Map<string, string>();
    for (const company of companies) {
      const address = pickAddress(company.addresses);
      if (address === null || !targeted.has(address.codePostal) || company.nafCode === "") {
        continue;
      }
      villeByZone.set(address.codePostal, address.ville);
      const byNaf = counts.get(address.codePostal) ?? new Map<string, SectorCounts>();
      const c = byNaf.get(company.nafCode) ?? { active: 0, terminated: 0 };
      if (company.status === "terminated") {
        c.terminated += 1;
      } else {
        c.active += 1;
      }
      byNaf.set(company.nafCode, c);
      counts.set(address.codePostal, byNaf);
    }

    const nafLabels = new Map(config.nafCodes.map((n) => [n.code, n.label]));
    const zones: SectorZoneConfig[] = config.zones.map((z) => ({
      codePostal: z.codePostal,
      ville: villeByZone.get(z.codePostal) ?? "",
      pools: new Map(z.perNaf.map((p) => [p.code, p.count])),
    }));
    return computeSectorMovements(zones, nafLabels, counts, this.clock.now());
  }
}

/** Adresse représentative d'une société : facturation, sinon défaut, sinon première. */
function pickAddress(addresses: readonly AddressRow[]): AddressRow | null {
  return (
    addresses.find((a) => a.kind === "billing") ??
    addresses.find((a) => a.isDefault) ??
    addresses[0] ??
    null
  );
}
