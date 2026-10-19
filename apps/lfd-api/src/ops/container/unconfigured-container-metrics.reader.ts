import { Injectable } from "@nestjs/common";

import {
  ContainerMetricsReader,
  type ContainerMetricsResult,
} from "./container-metrics-reader.port.js";

/** Les variables à poser, telles que l'exploitant les copiera. */
export const CONTAINER_METRICS_SETTINGS =
  "CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_ANALYTICS_TOKEN / CLOUDFLARE_API_CONTAINER_APPLICATION_ID";

/**
 * Le lecteur quand rien n'est configuré. Contrairement au trafic, **pas de
 * répétition** : un CPU inventé serait exactement la confusion que ce chiffre
 * vient lever. Il rend l'aveu, et la variable à poser.
 */
@Injectable()
export class UnconfiguredContainerMetricsReader extends ContainerMetricsReader {
  read(): Promise<ContainerMetricsResult> {
    return Promise.resolve({ kind: "not-configured", setting: CONTAINER_METRICS_SETTINGS });
  }
}
