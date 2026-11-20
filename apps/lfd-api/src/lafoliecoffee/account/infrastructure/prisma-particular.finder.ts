import { Injectable } from "@nestjs/common";

import { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ParticularFinder, type ParticularRecord } from "../domain/ports/particular-finder.js";
import type { ParticularSearchTerm } from "../domain/value-objects/particular-search-term.js";
import { PARTICULAR_WHERE, PHONE_KEY } from "./particular-sql.js";

interface ParticularRow {
  readonly id: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly email: string;
  readonly phone: string;
  readonly connectable: boolean;
}

/**
 * Adaptateur de la recherche des particuliers.
 *
 * En SQL écrit, pour deux raisons : la clé du téléphone se calcule en base, et
 * `strpos` cherche la saisie **comme texte**. Le `contains` insensible de
 * Prisma compile en `ILIKE` sans échapper `_` ni `%`, et `jean_dupont`
 * y trouvait `jeanXdupont` — l'adresse de quelqu'un d'autre.
 */
@Injectable()
export class PrismaParticularFinder extends ParticularFinder {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async search(term: ParticularSearchTerm, limit: number): Promise<readonly ParticularRecord[]> {
    const phoneMatch =
      term.phoneKey === null
        ? Prisma.sql`FALSE`
        : Prisma.sql`strpos(${PHONE_KEY}, ${term.phoneKey}) > 0`;
    const rows = await this.prisma.$queryRaw<readonly ParticularRow[]>`
      SELECT u.id, u.first_name, u.last_name, u.email, u.phone,
             (u.auth0_sub IS NOT NULL) AS connectable
      FROM public.users u
      WHERE ${PARTICULAR_WHERE}
        AND (
          strpos(lower(u.first_name), ${term.text}) > 0
          OR strpos(lower(u.last_name), ${term.text}) > 0
          OR strpos(lower(btrim(u.email)), ${term.text}) > 0
          OR ${phoneMatch}
        )
      ORDER BY lower(u.first_name), u.created_at, u.id
      LIMIT ${limit}
    `;
    return rows.map((row) => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      phone: row.phone,
      connectable: row.connectable,
    }));
  }
}
