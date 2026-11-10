import {
  PRODUCT_AUDIENCE_EVENTS,
  PRODUCT_AUDIENCE_SOURCES,
  type ProductAudienceCounterView,
  type ProductAudienceSource,
} from "@lfd/contracts";
import { Injectable, Logger } from "@nestjs/common";

import { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { AudienceIncrement } from "../domain/audience-event-batch.js";
import { AudienceCounterReader } from "../domain/ports/audience-counter.reader.js";
import { AudienceCounterWriter } from "../domain/ports/audience-counter.writer.js";
import { ComputedSuggestionCounterReader } from "../domain/ports/computed-suggestion-counter.reader.js";
import { StaffSuggestionCounterReader } from "../domain/ports/staff-suggestion-counter.reader.js";

/**
 * L'écrivain des compteurs : **une** instruction pour tout le lot.
 *
 * `INSERT … ON CONFLICT DO UPDATE SET count = count + EXCLUDED.count` : deux
 * lots concurrents sur la même clé s'attendent sur la ligne et s'ajoutent, rien
 * ne se perd. Le lot arrive déjà totalisé (`AudienceEventBatch`) : une clé n'y
 * figure qu'une fois, ce que Postgres exige d'un `ON CONFLICT`.
 */
@Injectable()
export class PrismaAudienceCounterWriter extends AudienceCounterWriter {
  private readonly logger = new Logger(PrismaAudienceCounterWriter.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async add(day: string, increments: readonly AudienceIncrement[]): Promise<void> {
    if (increments.length === 0) {
      return;
    }
    const rows = increments.map(
      (row) =>
        Prisma.sql`(${day}::date, ${row.sku}, ${row.event}, ${row.placement}, ${row.source}, ${row.count})`,
    );
    try {
      await this.prisma.$executeRaw`
        INSERT INTO "growth"."product_audience_counters" ("day", "sku", "event", "placement", "source", "count")
        VALUES ${Prisma.join(rows)}
        ON CONFLICT ("day", "sku", "event", "placement", "source")
        DO UPDATE SET "count" = "product_audience_counters"."count" + EXCLUDED."count"`;
    } catch (error) {
      // Best-effort : une mesure perdue ne fait pas échouer la boutique.
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`compteurs d'audience non écrits (${increments.length} lignes) : ${reason}`);
    }
  }
}

interface CounterRow {
  readonly day: string;
  readonly sku: string;
  readonly event: string;
  readonly placement: string;
  readonly source: string;
  readonly count: number;
}

/** Le lecteur des compteurs, par jour puis SKU. */
@Injectable()
export class PrismaAudienceCounterReader extends AudienceCounterReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async between(from: string, to: string): Promise<readonly ProductAudienceCounterView[]> {
    const rows = await this.prisma.$queryRaw<CounterRow[]>`
      SELECT to_char("day", 'YYYY-MM-DD') AS "day", "sku", "event", "placement", "source", "count"
      FROM "growth"."product_audience_counters"
      WHERE "day" BETWEEN ${from}::date AND ${to}::date
      ORDER BY "day", "sku", "event", "placement", "source"`;
    return rows.flatMap(toView);
  }
}

/** La source des gestes sur une suggestion décidée (`suggestions-du-staff.md` §8.1). */
const STAFF_SOURCE: ProductAudienceSource = "staff";

/**
 * Le lecteur des compteurs des suggestions DÉCIDÉES : la source `staff`
 * filtrée dans le `WHERE`, pas en mémoire (RS6).
 */
@Injectable()
export class PrismaStaffSuggestionCounterReader extends StaffSuggestionCounterReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  between(from: string, to: string): Promise<readonly ProductAudienceCounterView[]> {
    return countersOfSource(this.prisma, from, to, STAFF_SOURCE);
  }
}

/** La source des gestes sur une suggestion calculée (`suggestions-calculees.md`). */
const DATA_SOURCE: ProductAudienceSource = "data";

/**
 * Le lecteur des compteurs des suggestions CALCULÉES : la source `data`
 * filtrée dans le `WHERE` (RS6, attribution partagée avec le staff).
 */
@Injectable()
export class PrismaComputedSuggestionCounterReader extends ComputedSuggestionCounterReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  between(from: string, to: string): Promise<readonly ProductAudienceCounterView[]> {
    return countersOfSource(this.prisma, from, to, DATA_SOURCE);
  }
}

async function countersOfSource(
  prisma: PrismaService,
  from: string,
  to: string,
  source: ProductAudienceSource,
): Promise<readonly ProductAudienceCounterView[]> {
  const rows = await prisma.$queryRaw<CounterRow[]>`
    SELECT to_char("day", 'YYYY-MM-DD') AS "day", "sku", "event", "placement", "source", "count"
    FROM "growth"."product_audience_counters"
    WHERE "day" BETWEEN ${from}::date AND ${to}::date AND "source" = ${source}
    ORDER BY "day", "sku", "event", "placement"`;
  return rows.flatMap(toView);
}

/** Les CHECK en base tiennent les énumérations ; une valeur inconnue ne se rend pas. */
function toView(row: CounterRow): ProductAudienceCounterView[] {
  const event = PRODUCT_AUDIENCE_EVENTS.find((known) => known === row.event);
  const source = PRODUCT_AUDIENCE_SOURCES.find((known) => known === row.source);
  return event === undefined || source === undefined ? [] : [{ ...row, event, source }];
}
