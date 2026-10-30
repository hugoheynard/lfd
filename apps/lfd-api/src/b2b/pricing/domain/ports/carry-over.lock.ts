import type { CarriedFamily } from "../entities/decision-carry-over.js";

/**
 * **Le verrou d'un report** (`plan-report-apres-detachement.md`, § 3) : deux
 * reports simultanés d'une même famille vers une même référence passent l'un
 * après l'autre, et « déjà reporté » se relit après le verrou. Il n'y a pas
 * d'unicité en base pour le tenir — l'origine est en `jsonb`, et une unicité
 * sur l'identifiant d'origine ne survivrait pas au versionnage d'un plancher.
 *
 * Pris DANS l'unité de travail de l'appelant, relâché à sa fin.
 */
export abstract class CarryOverLock {
  abstract acquire(family: CarriedFamily, toSku: string): Promise<void>;
}
