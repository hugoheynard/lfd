import { Injectable } from "@nestjs/common";
import type { EcosystemHealth, NodeReading, TrafficWindow } from "@lfd/ops-contract";

import { Clock } from "../../platform/time/clock.js";
import { TrafficReader } from "../traffic/traffic-reader.port.js";
import { TOPOLOGY } from "../topology/topology.js";
import { Auth0ReadingsReader } from "./auth0-readings.reader.js";
import { DatabaseReadingsReader } from "./database-readings.reader.js";
import { deriveHealth, type NodeEvidence } from "./derive-health.js";
import { ProbeRunner } from "../probes/probe-runner.service.js";
import type { ProbeOutcome } from "../probes/probe.port.js";
import { gatewayReadings, moduleReadings } from "./readings.js";

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
    private readonly database: DatabaseReadingsReader,
    private readonly auth0: Auth0ReadingsReader,
    private readonly probes: ProbeRunner,
    private readonly clock: Clock,
  ) {}

  async read(): Promise<EcosystemHealth> {
    const now = this.clock.now();
    const [report, databaseReadings, auth0Readings, probes] = await Promise.all([
      this.traffic.read(HEALTH_WINDOW_MINUTES),
      this.database.read(),
      this.auth0.read(),
      this.probes.run(),
    ]);

    const evidence = new Map<string, NodeEvidence>(
      // Chaque service porte SA charge par module : c'est ce qui transforme
      // « l'API peine » en « l'API peine sur le référentiel ».
      report.windows.map((window: TrafficWindow) => [
        window.node,
        { traffic: window, readings: moduleReadings(window) },
      ]),
    );

    // La gateway ne se mesure pas elle-même : elle est ce qui mesure. Son relevé
    // est donc la somme de ce qu'elle a routé — le débit, pas un total, parce
    // qu'un total dépend de la fenêtre et ne se compare pas d'un écran à l'autre.
    evidence.set("gateway", { readings: gatewayReadings(report.windows) });
    evidence.set("postgres-b2b", { readings: databaseReadings });
    evidence.set("auth0", { readings: auth0Readings });

    // Les sondes s'ajoutent SANS écraser ce qu'on savait déjà : un nœud peut
    // être à la fois sondé et observé par la gateway, et les deux angles se
    // croisent au moment de la dérivation — pas avant.
    for (const [node, outcome] of probes) {
      const known = evidence.get(node);
      evidence.set(node, {
        ...known,
        // La latence de la sonde était mesurée et jetée. C'est pourtant le seul
        // chiffre qu'un tiers nous donne sans rien demander à personne — et sur
        // les nœuds qui n'ont que ça, c'est la différence entre une carte qu'on
        // lit et une carte qu'on regarde. Ajoutée en DERNIER : elle complète les
        // relevés propres au nœud, elle ne les chasse pas.
        readings: [...(known?.readings ?? []), ...latencyReading(outcome)],
        probe: {
          verdict: outcome.verdict,
          ...(outcome.detail === undefined ? {} : { detail: outcome.detail }),
        },
      });
    }

    return {
      generatedAt: now.toISOString(),
      nodes: deriveHealth(TOPOLOGY, evidence, now),
    };
  }
}

/**
 * La latence d'une sonde, et seulement quand elle a **abouti**.
 *
 * Sur un échec, la « latence » est le délai d'attente : afficher 2500 ms
 * ferait passer un service injoignable pour un service lent — deux diagnostics,
 * deux gestes. Sur un `unknown` (non configuré), il n'y a rien eu à mesurer.
 */
function latencyReading(outcome: ProbeOutcome): readonly NodeReading[] {
  if (outcome.verdict !== "up") {
    return [];
  }
  return [
    {
      label: "Réponse",
      value: outcome.latencyMs,
      unit: "ms",
      hint: "Aller-retour de la sonde depuis l'API, réseau compris.",
    },
  ];
}
