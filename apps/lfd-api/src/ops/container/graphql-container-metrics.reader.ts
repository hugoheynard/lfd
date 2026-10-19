import { Injectable, Logger } from "@nestjs/common";

import type { ContainerMetricsConfig } from "../../platform/config/app-config.js";
import { AppConfig } from "../../platform/config/app-config.js";
import { ContainerMetricsUnavailableError } from "./container-metrics-errors.js";
import {
  CONTAINER_METRICS_QUERY,
  isPermissionMessage,
  parseContainerMetrics,
} from "./container-metrics-query.js";
import {
  ContainerMetricsReader,
  type ContainerMetricsResult,
} from "./container-metrics-reader.port.js";
import { CONTAINER_METRICS_SETTINGS } from "./unconfigured-container-metrics.reader.js";

/** L'API GraphQL d'analytics de Cloudflare — la même pour tous les datasets. */
const GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";

/** La permission que le jeton doit porter, nommée telle qu'on la coche chez Cloudflare. */
const REQUIRED_PERMISSION = "Account Analytics: Read";

/**
 * Le vrai lecteur : il interroge l'API GraphQL d'analytics. **Transport et rien
 * d'autre** — la requête et la lecture de la réponse sont dans
 * `container-metrics-query.ts`, pures et testées.
 *
 * Même compte et même jeton que le lecteur d'Analytics Engine
 * (`CLOUDFLARE_ANALYTICS_TOKEN`) : un seul secret à tourner. Si ce jeton n'a pas
 * le droit de lire les métriques de containers, la réponse le dit et la case
 * le répète — on ne suppose pas qu'il l'a.
 */
@Injectable()
export class GraphqlContainerMetricsReader extends ContainerMetricsReader {
  private readonly logger = new Logger(GraphqlContainerMetricsReader.name);

  constructor(private readonly config: AppConfig) {
    super();
  }

  async read(from: Date, to: Date): Promise<ContainerMetricsResult> {
    const settings = this.config.containerMetricsConfig();
    if (settings === null) {
      return { kind: "not-configured", setting: CONTAINER_METRICS_SETTINGS };
    }
    const payload = await this.post(settings, from, to);
    const parsed = parseContainerMetrics(payload);
    if (parsed.kind === "samples") {
      return parsed;
    }
    // Les messages GraphQL nomment le compte et le dataset : pour nous, au
    // journal ; jamais dans la réponse.
    this.logger.error(`GraphQL Cloudflare a refusé la lecture : ${parsed.messages.join(" | ")}`);
    if (parsed.messages.some(isPermissionMessage)) {
      throw forbidden();
    }
    throw new ContainerMetricsUnavailableError(
      "unavailable",
      "Cloudflare a refusé la requête des métriques du container (détail au journal de l'API).",
    );
  }

  private async post(settings: ContainerMetricsConfig, from: Date, to: Date): Promise<unknown> {
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: CONTAINER_METRICS_QUERY,
        variables: {
          accountTag: settings.accountId,
          applicationId: settings.applicationId,
          from: from.toISOString(),
          to: to.toISOString(),
        },
      }),
    }).catch((cause: unknown) => {
      throw new ContainerMetricsUnavailableError(
        "unavailable",
        "L'API d'analytics de Cloudflare est injoignable.",
        cause,
      );
    });
    if (response.status === 401 || response.status === 403) {
      throw forbidden();
    }
    if (!response.ok) {
      this.logger.error(
        `GraphQL Cloudflare a répondu ${response.status} : ${await response.text()}`,
      );
      throw new ContainerMetricsUnavailableError(
        "unavailable",
        `L'API d'analytics de Cloudflare a répondu ${response.status}.`,
      );
    }
    return response.json().catch((cause: unknown) => {
      throw new ContainerMetricsUnavailableError(
        "unavailable",
        "Réponse illisible de Cloudflare.",
        cause,
      );
    });
  }
}

function forbidden(): ContainerMetricsUnavailableError {
  return new ContainerMetricsUnavailableError(
    "forbidden",
    `Le jeton CLOUDFLARE_ANALYTICS_TOKEN ne peut pas lire les métriques du container : ajoutez-lui la permission « ${REQUIRED_PERMISSION} » chez Cloudflare.`,
  );
}
