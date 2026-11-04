import type { NextFunction } from "express";

/**
 * Une étape chronométrée de la requête, rendue au navigateur dans
 * `Server-Timing` — plan `documentation/caching-usage/plan-latence-de-navigation.md`, L0.
 */
export interface ServerTimingMark {
  readonly name: string;
  readonly durationMs: number;
}

/** La requête qui porte ses étapes : le guard y ajoute les siennes. */
export interface TimedRequest {
  serverTiming?: ServerTimingMark[];
}

/** Les deux méthodes de la réponse que le middleware touche. */
export interface TimedResponse {
  setHeader(name: string, value: string): unknown;
  writeHead: (...args: never[]) => unknown;
}

/** Ajoute une étape, si la requête est chronométrée (elle l'est hors tests unitaires). */
export function recordServerTiming(request: TimedRequest, name: string, startedAt: number): void {
  request.serverTiming?.push({ name, durationMs: performance.now() - startedAt });
}

/** `auth;dur=12.3, app;dur=40.1` — une durée lisible, sans description. */
export function formatServerTiming(marks: readonly ServerTimingMark[]): string {
  return marks.map((mark) => `${mark.name};dur=${mark.durationMs.toFixed(1)}`).join(", ");
}

/**
 * Pose `Server-Timing` sur TOUTE réponse de Nest : les étapes notées par le
 * guard, puis `app`, le temps passé dans Nest de l'entrée au premier octet.
 *
 * Ce n'est pas une donnée de la personne : des durées, que l'onglet Réseau du
 * navigateur montre sans outil. Le Worker et la passerelle ajoutent les leurs,
 * ce qui découpe le plancher d'un appel par saut. `performance.now()` mesure
 * une durée sur l'horloge monotone, pas un instant (`lint:clock-port`).
 */
export function serverTiming(
  request: TimedRequest,
  response: TimedResponse,
  next: NextFunction,
): void {
  const startedAt = performance.now();
  const marks: ServerTimingMark[] = [];
  request.serverTiming = marks;
  const writeHead = response.writeHead.bind(response) as (...args: unknown[]) => unknown;
  response.writeHead = (...args: unknown[]) => {
    const all = [...marks, { name: "app", durationMs: performance.now() - startedAt }];
    response.setHeader("Server-Timing", formatServerTiming(all));
    return writeHead(...args);
  };
  next();
}
