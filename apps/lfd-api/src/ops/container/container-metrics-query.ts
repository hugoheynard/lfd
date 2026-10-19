import type { ContainerSample } from "./container-metrics-reader.port.js";

/**
 * **La requête GraphQL et la lecture de sa réponse** — le SEUL fichier qui
 * connaît les noms de champs de Cloudflare. Pur, testé sur une réponse figée.
 *
 * Source : https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-container-metrics/
 * (relue le 2026-10-19). Ce qui y est écrit en toutes lettres :
 *
 * - le dataset `containersMetricsAdaptiveGroups` sous `viewer.accounts(filter: {accountTag})` ;
 * - les filtres `datetime_geq` / `datetime_leq` (type `Time`) ;
 * - les dimensions `datetimeMinute`, `instanceId`, `applicationId` ;
 * - `sum.cpuTimeSec` (secondes de CPU) et `max.memory` (octets — l'exemple de
 *   la doc rend `312475648` pour ≈ 300 Mio).
 *
 * ⚠️ **À CONFIRMER contre l'API réelle**, faute d'introspection possible sans
 * jeton (2026-10-19) :
 *
 * - le **filtre** `applicationId` : la doc le donne comme dimension, et montre
 *   `instanceId` utilisé à la fois en dimension et en filtre — d'où l'analogie ;
 * - `orderBy: [datetimeMinute_ASC]` : la doc montre `datetimeHour_ASC` ;
 * - `avg.cpuUtilization` n'est volontairement PAS lu : la doc ne dit pas à quoi
 *   ce ratio est rapporté (un cœur ? l'allocation ?), et le diviser par les
 *   vCPU serait une hypothèse. `cpuTimeSec` est une grandeur physique.
 */
export const CONTAINER_METRICS_QUERY = `query ApiContainerMetrics($accountTag: String, $applicationId: String, $from: Time, $to: Time) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      containersMetricsAdaptiveGroups(
        limit: 1000
        filter: { datetime_geq: $from, datetime_leq: $to, applicationId: $applicationId }
        orderBy: [datetimeMinute_ASC]
      ) {
        dimensions { datetimeMinute instanceId }
        sum { cpuTimeSec }
        max { memory }
      }
    }
  }
}`;

/** Ce que la réponse dit d'elle-même, une fois lue. */
export type ParsedContainerMetrics =
  | { readonly kind: "samples"; readonly samples: readonly ContainerSample[] }
  | { readonly kind: "errors"; readonly messages: readonly string[] };

/**
 * Lit la réponse **défensivement** : une ligne dont un champ manque ou n'est
 * pas un nombre est écartée, pas promue — elle fausserait un pourcentage.
 * Un `errors` non vide l'emporte sur les données : GraphQL peut rendre les deux,
 * et une réponse partielle se lirait comme un container calme.
 */
export function parseContainerMetrics(payload: unknown): ParsedContainerMetrics {
  const errors = messagesOf(field(payload, "errors"));
  if (errors.length > 0) {
    return { kind: "errors", messages: errors };
  }
  const accounts = field(field(field(payload, "data"), "viewer"), "accounts");
  const groups = Array.isArray(accounts)
    ? field(accounts[0], "containersMetricsAdaptiveGroups")
    : undefined;
  if (!Array.isArray(groups)) {
    return { kind: "samples", samples: [] };
  }
  return { kind: "samples", samples: groups.flatMap(sampleOf) };
}

/**
 * Un refus de droits se reconnaît à son message — Cloudflare rend un `200`
 * avec `errors` pour un jeton sans la permission. ⚠️ Le libellé exact est À
 * CONFIRMER ; un message non reconnu tombe en `unavailable`, ce qui reste vrai.
 */
export function isPermissionMessage(message: string): boolean {
  return /not authori[sz]ed|permission|unauthori[sz]ed|forbidden|access denied/i.test(message);
}

function sampleOf(group: unknown): readonly ContainerSample[] {
  const dimensions = field(group, "dimensions");
  const minute = field(dimensions, "datetimeMinute");
  const instanceId = field(dimensions, "instanceId");
  const cpuTimeSec = field(field(group, "sum"), "cpuTimeSec");
  const maxMemoryBytes = field(field(group, "max"), "memory");
  if (
    typeof minute !== "string" ||
    Number.isNaN(Date.parse(minute)) ||
    typeof instanceId !== "string" ||
    !isFiniteNumber(cpuTimeSec) ||
    !isFiniteNumber(maxMemoryBytes)
  ) {
    return [];
  }
  return [{ minute, instanceId, cpuTimeSec, maxMemoryBytes }];
}

function messagesOf(errors: unknown): readonly string[] {
  if (!Array.isArray(errors)) {
    return [];
  }
  return errors.map((error: unknown) => {
    const message = field(error, "message");
    return typeof message === "string" ? message : "erreur GraphQL sans message";
  });
}

function field(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || !(key in value)) {
    return undefined;
  }
  return (value as Record<string, unknown>)[key];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
