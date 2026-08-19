import { z } from "zod";

/**
 * Vocabulaire des **nœuds** de l'écosystème et de leur **santé**. Un nœud = une
 * brique du système (API externe, worker, service, datastore). Voir le design :
 * `documentation/architecture-ops-ecosystem-health.md`.
 */

export const nodeKindSchema = z.enum([
  "external-api",
  "worker",
  "service",
  "datastore",
  // Ce qu'un client charge dans son navigateur. Il n'a ni sonde ni battement :
  // sa santé est celle de ce qu'il appelle. Le déclarer quand même, c'est
  // refuser une carte qui s'arrête au premier maillon qu'on possède — or c'est
  // par là qu'on entre dans le système.
  "frontend",
]);
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
export const probeKindSchema = z.enum([
  "http",
  "shopify",
  "auth0",
  "postgres",
  // Une Page statique : `target` porte son origine publique, et la sonde y
  // vérifie le shell puis le point d'entrée qu'il référence.
  "frontend",
]);
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
  /**
   * Ce nœud **est censé battre**. Déclaré, jamais deviné — et par défaut faux.
   *
   * Sans cette distinction, un nœud qui n'a pas encore d'émetteur de heartbeat
   * serait éternellement dégradé pour un silence que personne n'attendait. Une
   * carte durablement orange enseigne à ignorer sa couleur : c'est la même
   * faute que compter les 429 comme des erreurs, à un autre endroit.
   */
  readonly expectsHeartbeat?: boolean;
}
