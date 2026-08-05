import { z } from "zod";

/**
 * Vocabulaire des **nœuds** de l'écosystème et de leur **santé**. Un nœud = une
 * brique du système (API externe, worker, service, datastore). Voir le design :
 * `documentation/architecture-ops-ecosystem-health.md`.
 */

export const nodeKindSchema = z.enum(["external-api", "worker", "service", "datastore"]);
export type NodeKind = z.infer<typeof nodeKindSchema>;

/**
 * Santé rendue d'un nœud. `unknown` **n'est pas** `down` : c'est « on ne sait
 * pas » (heartbeat périmé / probe muet) — la distinction est un invariant du
 * modèle (silence ≠ mort).
 */
export const healthStatusSchema = z.enum(["up", "degraded", "down", "unknown"]);
export type HealthStatus = z.infer<typeof healthStatusSchema>;

/**
 * Comment OPS **sonde** un nœud qu'on ne possède pas (API externe, datastore).
 * `target` est opaque au contrat : l'implémentation du prober (côté backend OPS)
 * l'interprète (URL, DSN, handle…). Les nœuds qu'on possède n'ont pas de probe :
 * ils **poussent** (heartbeat).
 */
export const probeKindSchema = z.enum(["http", "shopify", "auth0", "postgres"]);
export type ProbeKind = z.infer<typeof probeKindSchema>;

export interface NodeProbe {
  readonly kind: ProbeKind;
  readonly target?: string;
}

/**
 * Déclaration **statique** d'un nœud dans le manifeste de topologie — la carte est
 * déclarée et versionnée, jamais devinée du trafic. `dependsOn` porte les arêtes
 * (« dépend de ») qui font la causalité amont → aval.
 */
export interface NodeManifest {
  readonly id: string;
  readonly kind: NodeKind;
  readonly label: string;
  readonly dependsOn: readonly string[];
  /** Présent uniquement pour les nœuds **sondés** (externes, datastores). */
  readonly probe?: NodeProbe;
}
