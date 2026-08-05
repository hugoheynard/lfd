import type { Heartbeat, HeartbeatMetrics } from "./heartbeat.js";
import type { LifecycleEvent, LifecycleEventKind } from "./event.js";
import type { HealthStatus } from "./node.js";

/**
 * Ce qu'une brique émet vers OPS — enveloppe discriminée. Le **transport** (fetch
 * HTTP vers l'ingest, binding, retry, batch) est la responsabilité du `sink`
 * fourni par l'appelant : le contrat reste **framework-free** et sans réseau.
 */
export type OpsSignal =
  | { readonly type: "heartbeat"; readonly heartbeat: Heartbeat }
  | { readonly type: "event"; readonly event: LifecycleEvent };

export type OpsSink = (signal: OpsSignal) => Promise<void>;

export interface OpsReporterOptions {
  /** Id stable du nœud émetteur (ex. `pim.sync-shopify`). */
  readonly node: string;
  readonly sink: OpsSink;
  /** Horloge injectable (test) ; défaut : `new Date().toISOString()`. */
  readonly now?: () => string;
}

export interface OpsReporter {
  /** Battement périodique — à émettre **même à vide** (silence ≠ mort). */
  heartbeat(status: HealthStatus, metrics?: HeartbeatMetrics): Promise<void>;
  /** Event ponctuel de cycle de vie (job.*, deploy…). */
  event(kind: LifecycleEventKind, details?: { ref?: string; message?: string }): Promise<void>;
}

/**
 * Fabrique le petit client qu'une brique utilise pour se signaler à OPS. Le nœud
 * et l'horodatage sont remplis ici ; l'appelant ne fournit que l'état/les faits.
 */
export function createOpsReporter(options: OpsReporterOptions): OpsReporter {
  const clock = options.now ?? ((): string => new Date().toISOString());
  return {
    heartbeat(status, metrics) {
      return options.sink({
        type: "heartbeat",
        heartbeat: {
          node: options.node,
          at: clock(),
          status,
          ...(metrics === undefined ? {} : { metrics }),
        },
      });
    },
    event(kind, details) {
      return options.sink({
        type: "event",
        event: {
          node: options.node,
          at: clock(),
          kind,
          ...(details?.ref === undefined ? {} : { ref: details.ref }),
          ...(details?.message === undefined ? {} : { message: details.message }),
        },
      });
    },
  };
}
