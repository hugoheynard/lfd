import { AsyncLocalStorage } from "node:async_hooks";

import type { NextFunction } from "express";

import { OverlappingSpan } from "./overlapping-span.js";

/**
 * Une étape chronométrée de la requête, rendue au navigateur dans
 * `Server-Timing` — `documentation/caching-usage/carte-des-caches.md`, § 6 (posé par le lot L0 de la latence de navigation, 2026-11-04).
 */
export interface ServerTimingMark {
  readonly name: string;
  readonly durationMs: number;
  /** Un mot neutre (`memory`, `resolved`…) — jamais une donnée de la personne. */
  readonly description?: string | undefined;
}

/**
 * Les étapes de la requête en cours, pour qui n'a pas la requête sous la main
 * — un adaptateur appelé par le guard, par exemple le résolveur du principal
 * (2026-11-05, plan de latence : distinguer la mémoire d'une résolution
 * complète). Distinct du `RequestContext` métier : ce n'est que de la mesure.
 */
interface RequestTimings {
  readonly marks: ServerTimingMark[];
  readonly spans: Map<string, OverlappingSpan>;
}

const current = new AsyncLocalStorage<RequestTimings>();

/**
 * Chronomètre `work` et ajoute l'étape aux marques de la requête en cours,
 * s'il y en a une. Hors requête (tests, tâches de fond), ne note rien.
 */
export async function timeServerTiming<T>(name: string, work: () => Promise<T>): Promise<T> {
  const startedAt = performance.now();
  try {
    return await work();
  } finally {
    current.getStore()?.marks.push({ name, durationMs: performance.now() - startedAt });
  }
}

/**
 * Chronomètre `work` comme une lecture de la famille `name` : la requête
 * rendra `<name>` (temps mural où au moins une lecture était ouverte — des
 * lectures parallèles ne comptent qu'une fois) et `<name>-reads` (leur nombre,
 * en description). Une famille sans lecture n'apparaît pas. Hors requête
 * (tâche de fond, test unitaire), ne note rien.
 */
export async function timeServerTimingSpan<T>(name: string, work: () => Promise<T>): Promise<T> {
  const store = current.getStore();
  if (store === undefined) {
    return work();
  }
  const span = store.spans.get(name) ?? new OverlappingSpan(name);
  store.spans.set(name, span);
  span.enter(performance.now());
  try {
    return await work();
  } finally {
    span.leave(performance.now());
  }
}

/** Ajoute une étape sans durée, qui ne porte qu'une description (`principal-source;desc=memory`). */
export function noteServerTiming(name: string, description: string): void {
  current.getStore()?.marks.push({ name, durationMs: 0, description });
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
  return marks
    .map(
      (mark) =>
        `${mark.name};dur=${mark.durationMs.toFixed(1)}` +
        (mark.description === undefined ? "" : `;desc="${mark.description}"`),
    )
    .join(", ");
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
  const spans = new Map<string, OverlappingSpan>();
  request.serverTiming = marks;
  const writeHead = response.writeHead.bind(response) as (...args: unknown[]) => unknown;
  response.writeHead = (...args: unknown[]) => {
    const now = performance.now();
    const spanMarks = [...spans.values()].flatMap((span) => span.marksAt(now));
    const all = [...marks, ...spanMarks, { name: "app", durationMs: now - startedAt }];
    response.setHeader("Server-Timing", formatServerTiming(all));
    return writeHead(...args);
  };
  current.run({ marks, spans }, () => next());
}
