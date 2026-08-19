import { Injectable } from "@nestjs/common";
import type { EcosystemHealth, TrafficWindow } from "@lfd/ops-contract";

import { Clock } from "../../platform/time/clock.js";
import { TrafficReader } from "../traffic/traffic-reader.port.js";
import { TOPOLOGY } from "../topology/topology.js";
import { deriveHealth, type NodeEvidence } from "./derive-health.js";

/** La fenêtre sur laquelle on juge la santé. Assez courte pour être « en ce moment ». */
const HEALTH_WINDOW_MINUTES = 5;

/**
 * Assemble la carte : la topologie **déclarée**, plus ce qu'on sait de chaque
 * nœud, plus la dérivation.
 *
 * Elle ne sait rien juger elle-même — tout le jugement est dans
 * `deriveHealth`, pur et testé. Ici il n'y a que de la collecte, et c'est
 * volontaire : le jour où les sondes et les battements arriveront (J6), ils
 * s'ajouteront à la carte des preuves sans toucher aux règles.
 */
@Injectable()
export class OpsHealthService {
  constructor(
    private readonly traffic: TrafficReader,
    private readonly clock: Clock,
  ) {}

  async read(): Promise<EcosystemHealth> {
    const now = this.clock.now();
    const report = await this.traffic.read(HEALTH_WINDOW_MINUTES);
    const evidence = new Map<string, NodeEvidence>(
      report.windows.map((window: TrafficWindow) => [window.node, { traffic: window }]),
    );

    return {
      generatedAt: now.toISOString(),
      nodes: deriveHealth(TOPOLOGY, evidence, now),
    };
  }
}
