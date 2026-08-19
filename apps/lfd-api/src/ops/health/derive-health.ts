import { errorRate, isSilent } from "@lfd/ops-contract";
import type {
  HealthReason,
  HealthStatus,
  NodeHealth,
  NodeManifest,
  NodeReading,
  TrafficWindow,
} from "@lfd/ops-contract";

/**
 * **La dérivation du statut** — le cœur de la carte, et le seul endroit où
 * l'on décide ce que « ça va » veut dire. Pur, donc testable, donc discutable.
 *
 * Trois principes, dans cet ordre :
 *
 * 1. **La preuve l'emporte sur la déclaration.** Ce que la gateway a vu
 *    passer bat ce qu'un nœud dit de lui-même. Un `up` auto-déclaré démenti par
 *    les erreurs mesurées est un `degraded` — c'est la discipline adversariale
 *    du §10, appliquée ici.
 * 2. **Le silence n'est pas la mort.** Un nœud muet SANS trafic est `unknown`,
 *    jamais `down`. On ne conclut à la mort que sur une preuve : la gateway
 *    n'a pas obtenu de réponse.
 * 3. **On ne dégrade pas pour un silence qu'on n'attendait pas.** Un nœud sans
 *    émetteur de battement (`expectsHeartbeat` absent) ne vire pas à l'orange
 *    parce qu'il se tait. Une carte durablement orange enseigne à ignorer sa
 *    couleur.
 */

/** Au-delà, un battement est **périmé** : le nœud ne dit plus rien de récent. */
export const HEARTBEAT_TTL_MS = 90_000;

/**
 * Part d'erreurs serveur à partir de laquelle un nœud qui répond est **dégradé**.
 * 2 % : assez haut pour qu'un incident isolé ne fasse pas clignoter la carte,
 * assez bas pour qu'une vraie dérive se voie avant qu'on la subisse.
 */
export const DEGRADED_ERROR_RATE = 0.02;

export interface NodeEvidence {
  /** Ce que la gateway a vu, ou `undefined` si ce nœud n'est pas observé. */
  readonly traffic?: TrafficWindow;
  /** Dernier battement reçu, `null` si le nœud n'a jamais parlé. */
  readonly lastHeartbeatAt?: string | null;
  /** Ce que CE nœud sait dire de son activité — cf. `readings.ts`. */
  readonly readings?: readonly NodeReading[];
  /** Ce qu'une sonde a constaté du dehors — cf. `probes/`. */
  readonly probe?: { readonly verdict: "up" | "down" | "unknown"; readonly detail?: string };
}

/** Statut et raison, indissociables : rendre l'un sans l'autre serait un verdict. */
interface Verdict {
  readonly status: HealthStatus;
  readonly reason: HealthReason;
}

/** Vrai si le battement est **récent** au regard du TTL. */
function heartbeatIsFresh(lastHeartbeatAt: string | null | undefined, now: Date): boolean {
  if (typeof lastHeartbeatAt !== "string") {
    return false;
  }
  const at = Date.parse(lastHeartbeatAt);
  return Number.isFinite(at) && now.getTime() - at <= HEARTBEAT_TTL_MS;
}

/** Le verdict d'un nœud, à partir de ce qu'on sait de lui — et de rien d'autre. */
function verdictFor(node: NodeManifest, evidence: NodeEvidence, now: Date): Verdict {
  const { traffic } = evidence;
  const fresh = heartbeatIsFresh(evidence.lastHeartbeatAt, now);

  // La seule preuve de mort : la gateway n'a pas obtenu de réponse. Un `5xx`
  // rendu par le backend ne compte PAS — il a répondu, mal.
  if (traffic !== undefined && traffic.gatewayFaults > 0) {
    return { status: "down", reason: "gateway-fault" };
  }
  // Une SONDE est une observation directe, et elle prime : sur un tiers, c'est
  // même la seule qu'on ait. Le verdict `down` qui arrive ici est déjà confirmé
  // (échecs consécutifs) — la temporisation appartient au lanceur, pas à la
  // règle, sinon la règle ne serait plus pure.
  // Un front est **servi** ou **cassé au déploiement** — jamais « en marche » :
  // sa sonde constate le shell et son point d'entrée, pas le démarrage de
  // l'application. Deux raisons distinctes pour ne pas laisser croire l'inverse.
  const isFront = node.kind === "frontend";
  if (evidence.probe?.verdict === "down") {
    return { status: "down", reason: isFront ? "deploy-broken" : "probe-failed" };
  }
  if (evidence.probe?.verdict === "up") {
    return { status: "up", reason: isFront ? "deploy-ok" : "probe-ok" };
  }
  if (traffic !== undefined && !isSilent(traffic)) {
    if (errorRate(traffic) >= DEGRADED_ERROR_RATE) {
      return { status: "degraded", reason: "error-rate" };
    }
    // Il sert, mais il ne rapporte plus : la moitié observable va bien, la
    // moitié déclarative est cassée. Dégradé — et seulement si on l'attendait.
    if (node.expectsHeartbeat === true && !fresh) {
      return { status: "degraded", reason: "heartbeat-stale" };
    }
    return { status: "up", reason: "traffic-healthy" };
  }
  if (fresh) {
    return { status: "up", reason: "heartbeat-fresh" };
  }
  if (node.expectsHeartbeat === true) {
    // Attendu et muet, sans trafic : oisif ou mort, on NE SAIT PAS. C'est
    // l'invariant du §10, et c'est ce qui interdit de crier au loup la nuit.
    return { status: "unknown", reason: "heartbeat-stale" };
  }
  return { status: "unknown", reason: "no-evidence" };
}

/**
 * L'état de tous les nœuds. Les statuts sont calculés d'abord, **puis** les
 * dépendances tombées sont annotées : le rouge ne se propage pas, il se
 * désigne. Propager peindrait toute la carte à partir d'un incident et cacherait
 * la cause — l'inverse exact de ce qu'on lui demande.
 */
export function deriveHealth(
  topology: readonly NodeManifest[],
  evidence: ReadonlyMap<string, NodeEvidence>,
  now: Date,
  previous: ReadonlyMap<string, NodeHealth> = new Map(),
): readonly NodeHealth[] {
  const since = now.toISOString();
  const verdicts = new Map<string, Verdict>(
    topology.map((node) => [node.id, verdictFor(node, evidence.get(node.id) ?? {}, now)]),
  );

  return topology.map((node) => {
    const verdict = verdicts.get(node.id) ?? { status: "unknown", reason: "no-evidence" };
    const fallen = node.dependsOn.find((id) => verdicts.get(id)?.status === "down");
    const observed = evidence.get(node.id);
    // Ce que la sonde a CONSTATÉ, remonté tel quel quand le nœud est tombé.
    // « Injoignable » et « point d'entrée main-a1b2.js : 404 » appellent deux
    // gestes différents, et un statut seul ne les distingue pas — c'est le
    // détail, pas la couleur, qui dit par où commencer.
    const probeDetail = observed?.probe?.detail;
    const lastError =
      verdict.status === "down" && probeDetail !== undefined
        ? { lastError: { at: since, message: probeDetail } }
        : {};
    return {
      node: node.id,
      kind: node.kind,
      label: node.label,
      status: verdict.status,
      reason: verdict.reason,
      // `since` date le CHANGEMENT, pas la lecture. Tant que le statut tient,
      // on reconduit l'instant où il a été constaté pour la première fois :
      // sans ça le champ annonce une durée et rend toujours « maintenant », ce
      // qui est le seul cas où mieux vaut ne rien afficher.
      since: sinceOf(previous.get(node.id), verdict.status, since),
      lastHeartbeatAt: observed?.lastHeartbeatAt ?? null,
      dependsOn: node.dependsOn,
      readings: observed?.readings ?? [],
      ...lastError,
      ...(fallen === undefined ? {} : { dependencyDown: fallen }),
    };
  });
}

/** L'instant où ce statut a commencé : celui d'avant s'il tient, sinon maintenant. */
function sinceOf(previous: NodeHealth | undefined, status: HealthStatus, now: string): string {
  return previous !== undefined && previous.status === status ? previous.since : now;
}
