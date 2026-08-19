import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { NodeProbe, PROBE_TIMEOUT_MS, type ProbeOutcome } from "./probe.port.js";

/**
 * **La base B2B** — par un `SELECT 1`.
 *
 * C'est la sonde qui répond à ce que `GET /health` ne dit pas : la liveness
 * signale que le processus a booté, or **une connexion Prisma est paresseuse**.
 * Une base injoignable, ou une chaîne de connexion mal formée, ne se manifeste
 * qu'à la première vraie requête — c'est-à-dire chez un client, pas sur un
 * écran. C'est le seul écart connu entre « vert » et « marche », et cette sonde
 * le comble.
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
