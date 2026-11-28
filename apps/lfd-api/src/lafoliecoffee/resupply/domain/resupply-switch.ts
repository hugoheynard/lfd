import type { ResupplyTrace } from "./resupply-trace.js";

/**
 * Le réassort tant que personne n'a posé l'interrupteur : éteint (décidé par
 * Hugo le 2026-11-28). Il s'allume pour tout le monde dans Réglages ›
 * Production › Fournil.
 */
export const RESUPPLY_ENABLED_BY_DEFAULT = false;

/**
 * **L'interrupteur du réassort**, tel qu'il a été posé. Aucune règle ne
 * refuse son écriture : c'est une configuration, pas un agrégat
 * (CLAUDE.md § 3.1).
 */
export interface ResupplySwitch {
  readonly enabled: boolean;
  readonly updated: ResupplyTrace;
}
