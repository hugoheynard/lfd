import { PRODUCT_AUDIENCE_EVENTS, type ProductAudienceCounterView } from "@lfd/contracts";
import { Injectable, Logger } from "@nestjs/common";

import { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { AudienceIncrement } from "../domain/audience-event-batch.js";
import { AudienceCounterReader } from "../domain/ports/audience-counter.reader.js";
import { AudienceCounterWriter } from "../domain/ports/audience-counter.writer.js";

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
      (row) => Prisma.sql`(${day}::date, ${row.sku}, ${row.event}, ${row.placement}, ${row.count})`,
    );
    try {
      await this.prisma.$executeRaw`
        INSERT INTO "growth"."product_audience_counters" ("day", "sku", "event", "placement", "count")
        VALUES ${Prisma.join(rows)}
        ON CONFLICT ("day", "sku", "event", "placement")
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
      SELECT to_char("day", 'YYYY-MM-DD') AS "day", "sku", "event", "placement", "count"
      FROM "growth"."product_audience_counters"
      WHERE "day" BETWEEN ${from}::date AND ${to}::date
      ORDER BY "day", "sku", "event", "placement"`;
    return rows.flatMap((row) => {
      // Le CHECK en base tient l'énumération ; une valeur inconnue ne se rend pas.
      const event = PRODUCT_AUDIENCE_EVENTS.find((known) => known === row.event);
      return event === undefined ? [] : [{ ...row, event }];
    });
  }
}
