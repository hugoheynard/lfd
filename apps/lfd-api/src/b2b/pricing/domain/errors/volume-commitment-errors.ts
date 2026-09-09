/**
 * **Les refus d'un ENGAGEMENT de volume.**
 *
 * Les trois catégories de ce fichier ont été corrigées le 2026-09-09 (R18) : il
 * répondait 400 sur l'introuvable, le clos et le recouvrement, là où ses quatre
 * sœurs répondaient 404 et 409.
 */

import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Un volume visé nul ou négatif.
 *
 * Un engagement à zéro n'engage à rien, et l'écran de suivi afficherait un
 * « 0 % atteint » qui ressemble à une alerte alors que rien n'a été promis.
 */
export class InvalidPromisedVolumeError extends DomainError {
  constructor(quantity: number) {
    super(
      "pricing.commitment.invalid_promised_volume",
      `Le volume visé par un engagement doit être un entier strictement positif (reçu : ${String(quantity)}).`,
    );
  }
}

/**
 * Un engagement clos ne se rouvre pas : on en signe un nouveau.
 *
 * **409 depuis le 2026-09-09**, comme `Archived*IsSealedError` partout ailleurs
 * : la demande est bien formée, c'est l'état de la ressource qui la refuse
 * (R18).
 */
export class ArchivedVolumeCommitmentIsSealedError extends BusinessError {
  constructor(id: string) {
    super(
      "pricing.commitment.archived_is_sealed",
      `L'engagement ${id} est clos : il ne se rouvre pas, un nouvel engagement se signe.`,
    );
  }
}

/**
 * Deux engagements vivants sur la même cible et la même période, pour un client.
 *
 * **`BusinessError` (409), et non `DomainError` (400), depuis le 2026-09-09.**
 * C'est la contrainte d'exclusion qui parle : la saisie est parfaitement bien
 * formée, c'est l'état de la base qui la refuse. Ses deux sœurs — la règle et le
 * barème — répondaient déjà 409 sur le MÊME fait ; l'engagement répondait 400,
 * et un back-office qui distingue « votre saisie est mauvaise » de « quelqu'un
 * est déjà passé » lisait deux réponses pour une seule situation (R18).
 */
export class OverlappingVolumeCommitmentError extends BusinessError {
  constructor() {
    super(
      "pricing.commitment.overlaps",
      "Un engagement couvre déjà cette cible pour ce client sur une partie de cette période : deux cumuls concurrents donneraient deux paliers, donc un prix indéterminé.",
    );
  }
}

/**
 * L'engagement demandé n'existe pas, ou ne concerne pas ce client.
 *
 * **404 depuis le 2026-09-09**, comme toute ressource absente du dépôt. Il
 * répondait 400, ce qui disait au staff que sa requête était malformée alors
 * qu'elle était impeccable (R18).
 */
export class VolumeCommitmentNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super("pricing.commitment.not_found", `Aucun engagement de volume ${id}.`);
  }
}
