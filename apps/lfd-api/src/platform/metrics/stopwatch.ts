/**
 * Port **Stopwatch** — mesurer une DURÉE.
 *
 * Ni `Clock` ni `WallClock` ne conviennent : le premier est gelé à l'ingress
 * (une durée y vaudrait toujours zéro), le second est réservé à un bail et une
 * échéance de reprise. Une durée n'est pas un fait métier : elle ne s'écrit
 * nulle part et ne décide de rien — elle se mesure.
 */
export abstract class Stopwatch {
  /** Démarre un chronomètre ; la fonction rendue lit les millisecondes écoulées. */
  abstract start(): () => number;
}
