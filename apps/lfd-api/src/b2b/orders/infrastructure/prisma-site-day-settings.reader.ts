import { type Weekday, weekdayOfDate } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  dayToDate,
  weekdayOfColumn,
} from "../../pickup-addresses/infrastructure/public-pickup-schedule-rows.js";
import { gpsOf, openingOf } from "../../sites/infrastructure/site-row.js";
import {
  type SiteDaySettings,
  SiteDaySettingsReader,
} from "../domain/ports/site-day-settings.reader.js";

/**
 * Adaptateur Prisma des réglages d'un site pour un jour — trois lectures,
 * parties ensemble : les sites (archivés compris), leurs règles de créneaux
 * publics, leurs fermetures qui couvrent le jour. La réduction au jour de
 * semaine se fait ici, par la même lecture de colonne que l'horaire public
 * (`weekdayOfColumn`) : deux règles du calendrier divergeraient.
 */
@Injectable()
export class PrismaSiteDaySettingsReader extends SiteDaySettingsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async forDay(
    day: string,
    siteIds: readonly string[],
  ): Promise<ReadonlyMap<string, SiteDaySettings>> {
    if (siteIds.length === 0) {
      return new Map();
    }
    const ids = [...siteIds];
    const date = dayToDate(day);
    const [sites, rules, closures] = await Promise.all([
      this.prisma.site.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          label: true,
          supply: true,
          transferMode: true,
          counterSetupMinutes: true,
          gps: true,
          opening: true,
        },
      }),
      this.prisma.publicPickupSlotRule.findMany({
        where: { pickupAddressId: { in: ids } },
        select: {
          pickupAddressId: true,
          weekday: true,
          startTime: true,
          endTime: true,
          slotMinutes: true,
        },
      }),
      this.prisma.publicPickupClosure.findMany({
        where: { pickupAddressId: { in: ids }, fromDay: { lte: date }, toDay: { gte: date } },
        select: { pickupAddressId: true, startTime: true, endTime: true },
      }),
    ]);
    const weekday = weekdayOfDate(day);
    return new Map(
      sites.map((site) => [
        site.id,
        {
          label: site.label,
          supply: site.supply,
          transferMode: site.transferMode,
          counterSetupMinutes: site.counterSetupMinutes,
          gps: gpsOf(site.gps),
          proPickup: openingOf(site.opening).proPickup,
          publicRules: rulesOfDay(rules, site.id, weekday),
          publicClosures: closures
            .filter((closure) => closure.pickupAddressId === site.id)
            .map((closure) => ({ start: closure.startTime, end: closure.endTime })),
        },
      ]),
    );
  }
}

interface RuleRow {
  readonly pickupAddressId: string;
  readonly weekday: string | null;
  readonly startTime: string;
  readonly endTime: string;
  readonly slotMinutes: number;
}

/** Les règles d'un site qui visent ce jour de semaine ; `weekday` nul = tous les jours. */
function rulesOfDay(
  rules: readonly RuleRow[],
  siteId: string,
  weekday: Weekday,
): SiteDaySettings["publicRules"] {
  return rules
    .filter((rule) => rule.pickupAddressId === siteId)
    .filter((rule) => {
      const ruleDay = weekdayOfColumn(rule.weekday);
      return ruleDay === null || ruleDay === weekday;
    })
    .map((rule) => ({ start: rule.startTime, end: rule.endTime, slotMinutes: rule.slotMinutes }));
}
