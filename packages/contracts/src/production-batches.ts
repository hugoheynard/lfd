import { z } from "zod";

import { workshopInitialsSchema } from "./production-worksheet.js";

/**
 * **Les fournées** — ce que le four a sorti d'une ligne de la fiche d'atelier,
 * déclaré au fil de l'eau plutôt que coché une fois (plan
 * `documentation/production/plan-fournees-progressives.md`, D1, D3).
 */

/** Un ULID : 26 caractères de l'alphabet de Crockford. */
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/u;

/**
 * L'identifiant d'une fournée **à déclarer**, tiré par l'écran : c'est la clé
 * d'idempotence. Rejouer le même rend un succès ; un autre contenu sous le même
 * est refusé (409).
 */
export const workshopBatchIdSchema = z
  .string()
  .regex(ULID, "identifiant de fournée attendu au format ULID");

/**
 * L'identifiant d'une fournée **à annuler** — plus large que le précédent : le
 * serveur écrit lui-même des fournées d'`id` déterministe (`backfill-…` pour
 * une coche héritée, `mark-…` pour l'ancienne case), et elles s'annulent aussi.
 */
export const workshopBatchRefSchema = z.string().trim().min(1).max(200);

/**
 * **Déclarer une fournée.** L'auteur vient du jeton, jamais de la charge. La
 * quantité est un entier ici ; « au moins une pièce » est la règle du domaine,
 * qui la refuse avec un message à lire au fournil.
 */
export const recordWorkshopBatchSchema = z.object({
  quantity: z.number().int("un nombre entier de pièces"),
  initials: workshopInitialsSchema,
});
export type RecordWorkshopBatch = z.infer<typeof recordWorkshopBatchSchema>;

/** Une fournée d'une ligne, telle que la fiche la montre — seules celles qui comptent. */
export interface WorkshopBatch {
  /** À renvoyer tel quel pour l'annuler — y compris un `backfill-…`. */
  readonly id: string;
  readonly quantity: number;
  /** ISO de la déclaration. */
  readonly recordedAt: string;
  /** `null` = déclarée sans signature. */
  readonly initials: string | null;
  /**
   * **Retour en attente** (colisage K2, 2026-10-04) : les pièces de cette
   * fournée que le fournil a demandé au colisage de lui rendre, sans réponse
   * encore. Elles comptent toujours dans « sorti ». `0` = rien en attente — et
   * toujours `0` sur une journée de l'ancien poste, où l'annulation est
   * synchrone. Ajouté au contrat ; un front qui l'ignore affiche comme avant.
   *
   * Facultatif dans le TYPE seulement, comme `qualityHeld` : le serveur
   * l'envoie toujours ; un double de test antérieur qui l'omet se lit `0`.
   */
  readonly pendingReturn?: number;
}

/**
 * Le contenant réglé d'une ligne, pour le bouton rapide « + 1 tourneuse »
 * (décision 5). `null` sur la ligne = aucun réglage, donc pas de bouton : on ne
 * fabrique pas une plaque que personne n'a déclarée.
 */
export interface WorkshopLineContainer {
  readonly unitsPerContainer: number;
  readonly singular: string;
}
