import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { VitrineSweepLease } from "../domain/ports/vitrine-sweep.lease.js";

/** Le nom de l'unique balayage bailé aujourd'hui. */
const SWEEP = "sweep";

/**
 * Le bail par UNE écriture conditionnée : deux balayages simultanés ne
 * franchissent pas tous deux le `WHERE` — Postgres sérialise les deux
 * `INSERT … ON CONFLICT` sur la même clé, et le second relit `claimed_until`
 * à jour. La ligne naît au premier balayage : rien à semer.
 */
@Injectable()
export class PrismaVitrineSweepLease extends VitrineSweepLease {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async claim(token: string, until: Date, wallNow: Date): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ name: string }[]>`
      INSERT INTO "public"."vitrine_sweep_leases" ("name", "claim_token", "claimed_until")
      VALUES (${SWEEP}, ${token}, ${until}::timestamptz)
      ON CONFLICT ("name") DO UPDATE
        SET "claim_token" = EXCLUDED."claim_token", "claimed_until" = EXCLUDED."claimed_until"
        WHERE "vitrine_sweep_leases"."claimed_until" IS NULL
           OR "vitrine_sweep_leases"."claimed_until" < ${wallNow}::timestamptz
      RETURNING "name"`;
    return rows.length === 1;
  }

  async release(token: string): Promise<void> {
    await this.prisma.vitrineSweepLease.updateMany({
      where: { name: SWEEP, claimToken: token },
      data: { claimToken: null, claimedUntil: null },
    });
  }
}
