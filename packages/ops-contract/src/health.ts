import type { HeartbeatMetrics } from "./heartbeat.js";
import type { HealthStatus, NodeKind } from "./node.js";

/**
 * Ce que OPS **rend** pour un nœud — agrégé, jamais poussé tel quel. Le `status`
 * est **dérivé** (heartbeat récent vs périmé, seuils, propagation d'une dépendance
 * `down`), pas la copie brute du dernier heartbeat.
 */
export interface NodeHealth {
  readonly node: string;
  readonly kind: NodeKind;
  readonly label: string;
  readonly status: HealthStatus;
  /** Depuis quand ce `status` tient (ISO). */
  readonly since: string;
  /** Dernier heartbeat reçu, ou `null` si le nœud n'a jamais parlé. */
  readonly lastHeartbeatAt: string | null;
  readonly dependsOn: readonly string[];
  readonly metrics?: HeartbeatMetrics;
  readonly lastError?: { readonly at: string; readonly message: string };
}

/**
 * L'état de tout l'écosystème à un instant — le « board » que l'app OPS rend en
 * schéma live. `generatedAt` = l'instant du snapshot (utile pour repérer un flux
 * figé côté UI).
 */
export interface EcosystemHealth {
  readonly generatedAt: string;
  readonly nodes: readonly NodeHealth[];
}
