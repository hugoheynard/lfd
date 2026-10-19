import { Injectable, Logger } from "@nestjs/common";
import type { ContainerUsage, ContainerUsageGap } from "@lfd/ops-contract";

import { Cached } from "../cached.js";
import { ContainerMetricsUnavailableError } from "./container-metrics-errors.js";
import {
  ContainerMetricsReader,
  type ContainerMetricsResult,
} from "./container-metrics-reader.port.js";
import { API_INSTANCE, containerUsageOf } from "./container-usage.js";

/** Le CPU et la mémoire, ou pourquoi on ne les a pas. Jamais les deux. */
export interface ContainerUsageReport {
  readonly usage: ContainerUsage | null;
  readonly gap: ContainerUsageGap | null;
}

/**
 * Une lecture par trente secondes au plus, comme les autres appels sortants de
 * la carte : Cloudflare ne remonte qu'à la minute, relire plus souvent
 * n'apporterait rien qu'un risque de limitation.
 */
const CONTAINER_TTL_MS = 30_000;

/**
 * Orchestre la lecture : fenêtre, cache, calcul, et la conversion de **tout**
 * échec en une raison lisible. Une carte de santé ne tombe pas avec ce qu'elle
 * observe — ni en 500, ni en case vide sans explication.
 */
@Injectable()
export class ContainerUsageService {
  private readonly logger = new Logger(ContainerUsageService.name);
  /**
   * La fenêtre de la DERNIÈRE demande : le cache la lit au moment où il
   * produit. Une valeur réutilisée a moins de trente secondes, en deçà de la
   * granularité de Cloudflare (la minute).
   */
  private range: { readonly from: Date; readonly to: Date } | null = null;
  private readonly cache = new Cached<ContainerMetricsResult>(CONTAINER_TTL_MS, () =>
    this.range === null
      ? Promise.resolve({ kind: "samples", samples: [] })
      : this.reader.read(this.range.from, this.range.to),
  );

  constructor(private readonly reader: ContainerMetricsReader) {}

  async read(now: Date, windowMinutes: number): Promise<ContainerUsageReport> {
    try {
      this.range = { from: new Date(now.getTime() - windowMinutes * 60_000), to: now };
      const result = await this.cache.read(now.getTime());
      if (result.kind === "not-configured") {
        return gap("not-configured", `Lecture non configurée : posez ${result.setting}.`);
      }
      const usage = containerUsageOf(result.samples, API_INSTANCE, now, windowMinutes);
      return usage === null
        ? gap(
            "no-samples",
            `Cloudflare n'a remonté aucune minute complète sur les ${windowMinutes} dernières minutes.`,
          )
        : { usage, gap: null };
    } catch (error) {
      this.logger.warn("Métriques du container indisponibles", error);
      if (error instanceof ContainerMetricsUnavailableError) {
        return gap(error.failure, error.message);
      }
      return gap(
        "unavailable",
        "Lecture des métriques du container impossible (détail au journal).",
      );
    }
  }
}

function gap(reason: ContainerUsageGap["reason"], detail: string): ContainerUsageReport {
  return { usage: null, gap: { reason, detail } };
}
