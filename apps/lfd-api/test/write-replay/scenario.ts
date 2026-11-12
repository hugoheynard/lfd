import type { E2eContext } from "../e2e-harness.js";
import type { FixedClock } from "../../src/platform/time/fixed-clock.js";

/**
 * Ce qu'un scénario reçoit : l'application, et l'horloge FIXE de la suite,
 * remise à maintenant avant chaque scénario — celui qui a besoin d'un autre
 * instant (une clôture passée) la pose lui-même.
 */
export interface ReplayWorld {
  readonly ctx: E2eContext;
  readonly clock: FixedClock;
}

/** Une pièce jointe d'une route multipart. */
export interface ReplayFile {
  readonly field: string;
  readonly content: Buffer;
  readonly filename: string;
  readonly contentType: string;
}

/** La requête qu'un scénario a préparée, rejouée deux fois avec la même clé. */
export interface ReplayRequest {
  /** Le `sub` de l'appelant (le jeton e2e EST le `sub`) ; `null` pour une route publique. */
  readonly sub: string | null;
  /** Le chemin concret ; il doit désigner la route de l'inventaire. */
  readonly path: string;
  readonly body?: object;
  /** Multipart : les champs texte et les fichiers, à la place de `body`. */
  readonly fields?: Readonly<Record<string, string>>;
  readonly files?: readonly ReplayFile[];
  /**
   * Ce que le rejeu doit rendre : la même réponse (`same`, le défaut), ou un
   * refus 409 qui ne refait rien (`shown-once`, un secret montré une fois que
   * le résultat gardé ne contient pas — `platform/intent/shown-once-replay.ts`).
   */
  readonly replay?: "same" | "shown-once";
}

/** Sème le minimum (sur une base vidée) et rend la requête à rejouer. */
export type ReplayScenario = (world: ReplayWorld) => Promise<ReplayRequest>;

/** Les scénarios d'un bloc, par `fichier#méthode` du contrôleur. */
export type ScenarioSet = Readonly<Record<string, ReplayScenario>>;

/** Le `sub` de l'opérateur des suites admin, semé par le harnais. */
export const STAFF = "staff-e2e";

/** L'opérateur, en appelant direct — pour un semis par les vraies routes. */
export const staffOf = (ctx: E2eContext) => (): ReturnType<E2eContext["asSub"]> => ctx.asSub(STAFF);

/** La clé d'une route : le fichier sous `apps/lfd-api/src/`, puis la méthode. */
export const routeKey = (file: string, method: string): string =>
  `apps/lfd-api/src/${file}#${method}`;
