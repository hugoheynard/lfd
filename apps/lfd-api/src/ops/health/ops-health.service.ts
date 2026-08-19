import { Injectable } from "@nestjs/common";
import type {
  EcosystemHealth,
  HealthReason,
  HealthStatus,
  NodeHealth,
  NodeReading,
  TrafficWindow,
} from "@lfd/ops-contract";

import { Clock } from "../../platform/time/clock.js";
import { Cached } from "../cached.js";
import { TrafficReader } from "../traffic/traffic-reader.port.js";
import { TOPOLOGY } from "../topology/topology.js";
import { Auth0ReadingsReader } from "./auth0-readings.reader.js";
import { DatabaseReadingsReader } from "./database-readings.reader.js";
import { MailReadingsReader } from "./mail-readings.reader.js";
import { deriveHealth, type NodeEvidence } from "./derive-health.js";
import { ProbeRunner } from "../probes/probe-runner.service.js";
import type { ProbeOutcome } from "../probes/probe.port.js";
import { gatewayReadings, moduleReadings } from "./readings.js";
import { StatusJournal } from "../journal/status-journal.port.js";

/** La fenêtre sur laquelle on juge la santé. Assez courte pour être « en ce moment ». */
const HEALTH_WINDOW_MINUTES = 5;

/**
 * Cadence maximale des appels vers l'extérieur — sondes tierces et Auth0.
 *
 * Trente secondes, alors que l'écran se rafraîchit toutes les quinze : c'est
 * délibéré. Le **trafic** change d'une seconde à l'autre et se relit à chaque
 * fois ; l'état d'un tiers, non — et surtout, rien de ce qu'on ferait d'une
 * information fraîche de quinze secondes plutôt que trente ne serait différent.
 * Payer le double d'appels pour ça serait acheter une précision qu'on n'utilise
 * pas, au prix d'un rate-limit qu'on subirait.
 */
const OUTBOUND_TTL_MS = 30_000;

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
  /** Ce qui sort de chez nous, mis en cache. Le reste — trafic, base — est à nous. */
  private readonly cachedProbes = new Cached(OUTBOUND_TTL_MS, () => this.probes.run());
  private readonly cachedAuth0 = new Cached(OUTBOUND_TTL_MS, () => this.auth0.read());

  /**
   * Le dernier état rendu, pour savoir **depuis quand** un statut tient.
   *
   * Il est **hydraté du journal** à la première lecture, puis tenu en mémoire.
   * Sans cette relecture, un redéploiement rajeunissait tous les incidents à
   * l'instant présent : « down depuis 6 h » redevenait « down depuis à
   * l'instant », c'est-à-dire un chiffre faux au moment précis où sa durée
   * était l'information.
   */
  private previous: ReadonlyMap<string, NodeHealth> = new Map();
  private hydrated = false;

  constructor(
    private readonly traffic: TrafficReader,
    private readonly database: DatabaseReadingsReader,
    private readonly auth0: Auth0ReadingsReader,
    private readonly mail: MailReadingsReader,
    private readonly probes: ProbeRunner,
    private readonly journal: StatusJournal,
    private readonly clock: Clock,
  ) {}

  async read(): Promise<EcosystemHealth> {
    const now = this.clock.now();
    await this.hydrate();
    const [report, databaseReadings, mailReadings, auth0Readings, probes] = await Promise.all([
      this.traffic.read(HEALTH_WINDOW_MINUTES),
      this.database.read(),
      this.mail.read(),
      this.cachedAuth0.read(now.getTime()),
      this.cachedProbes.read(now.getTime()),
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
    // La sonde dit que Resend RÉPOND ; ces relevés disent que nos e-mails
    // ARRIVENT. Ce n'est pas la même question, et c'est la seconde qui coûte
    // cher quand la réponse est non.
    evidence.set("resend", { readings: mailReadings });

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

    const nodes = deriveHealth(TOPOLOGY, evidence, now, this.previous);
    const changed = nodes.filter((node) => this.previous.get(node.node)?.status !== node.status);
    this.previous = new Map(nodes.map((node) => [node.node, node]));

    // On écrit ce qui a CHANGÉ, et on ne l'attend pas : le journal est un effet
    // de bord du diagnostic, pas son objet. Une base lente ne doit pas ralentir
    // l'écran qui sert justement à comprendre pourquoi elle est lente.
    void this.journal.record(
      changed.map((node) => ({
        node: node.node,
        status: node.status,
        reason: node.reason,
        detail: node.lastError?.message ?? "",
        at: now,
      })),
    );

    return { generatedAt: now.toISOString(), nodes };
  }

  /**
   * Relit le dernier état connu — **une fois**, à la première lecture.
   *
   * Au constructeur, ce serait une requête au démarrage pour un écran que
   * personne n'ouvrira peut-être jamais ; à chaque lecture, ce serait une
   * requête pour rien puisque la mémoire est déjà à jour.
   */
  private async hydrate(): Promise<void> {
    if (this.hydrated) {
      return;
    }
    this.hydrated = true;
    const latest = await this.journal.latest();
    this.previous = new Map(
      [...latest.entries()].map(([node, transition]) => [
        node,
        remembered(node, transition.status, transition.reason, transition.at),
      ]),
    );
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

/**
 * Un état antérieur reconstitué du journal — juste assez pour que la dérivation
 * sache si le statut a changé et depuis quand. Le reste (relevés, dépendances)
 * est recalculé à chaque lecture : le rejouer d'hier serait le rendre faux.
 */
function remembered(
  node: string,
  status: HealthStatus,
  reason: HealthReason,
  at: Date,
): NodeHealth {
  return {
    node,
    kind: "service",
    label: node,
    status,
    reason,
    since: at.toISOString(),
    lastHeartbeatAt: null,
    dependsOn: [],
    readings: [],
  };
}
