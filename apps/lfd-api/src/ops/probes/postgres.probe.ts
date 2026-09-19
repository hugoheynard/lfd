import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { NodeProbe, PROBE_TIMEOUT_MS, type ProbeOutcome } from "./probe.port.js";

/**
 * **La base B2B** — par un `SELECT 1`.
 *
 * C'est la sonde qui répond à ce que `GET /health` ne dit pas : la liveness
 * signale que le processus a booté, pas que la base répond ENCORE. Depuis le
 * 2026-08-21, le démarrage lit `_prisma_migrations` avant d'écouter
 * (`database.module.ts`, vérifié le 2026-09-19) : une base injoignable au boot
 * empêche donc de booter. Mais une base qui le devient ensuite — un pooler
 * saturé ou muet — ne se manifeste qu'à la prochaine vraie requête, c'est-à-dire
 * chez un client, pas sur un écran. C'est l'écart entre « vert » et « marche »,
 * et cette sonde le comble.
 *
 * Son délai ({@link PROBE_TIMEOUT_MS}) est plus court que le délai d'acquisition
 * du pool `pg` (5 s, `prisma.service.ts`, vérifié le 2026-09-19) : derrière le
 * pooler, un pool plein se lit ici « trop lente » avant de se lire
 * « indisponible » chez le client.
 */
@Injectable()
export class PostgresB2bProbe extends NodeProbe {
  readonly id = "postgres-b2b";

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async check(): Promise<ProbeOutcome> {
    const startedAt = Date.now();
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) =>
          setTimeout(() => {
            reject(new Error("délai dépassé"));
          }, PROBE_TIMEOUT_MS),
        ),
      ]);
      return { verdict: "up", latencyMs: Date.now() - startedAt };
    } catch {
      // On ne relaie pas le message : il porte l'hôte et parfois l'utilisateur
      // de la chaîne de connexion.
      return {
        verdict: "down",
        latencyMs: Date.now() - startedAt,
        detail: "injoignable ou trop lente",
      };
    }
  }
}
