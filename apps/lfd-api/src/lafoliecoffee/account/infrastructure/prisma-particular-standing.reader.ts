import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  ParticularStandingReader,
  type ParticularStanding,
} from "../domain/ports/particular-standing.reader.js";

interface StandingRow {
  readonly disabled: boolean;
  readonly attached: boolean;
}

/**
 * Adaptateur de {@link ParticularStandingReader} : une ligne de `users` et
 * l'existence d'une adhésion, en une requête. La même condition que
 * `PARTICULAR_WHERE`, décomposée pour nommer le refus.
 */
@Injectable()
export class PrismaParticularStandingReader extends ParticularStandingReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async standingOf(userId: string): Promise<ParticularStanding> {
    const rows = await this.prisma.$queryRaw<readonly StandingRow[]>`
      SELECT (u.status = 'disabled') AS disabled,
             EXISTS (SELECT 1 FROM public.memberships m WHERE m.user_id = u.id) AS attached
      FROM public.users u
      WHERE u.id = ${userId}
    `;
    const row = rows[0];
    if (row === undefined) {
      return "unknown";
    }
    if (row.disabled) {
      return "disabled";
    }
    return row.attached ? "company_member" : "particular";
  }
}
