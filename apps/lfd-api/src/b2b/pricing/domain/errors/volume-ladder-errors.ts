/**
 * **Les refus d'un BARÈME de volume.**
 *
 * La grille est le sujet : la plupart de ces refus ne sont pas exprimables palier
 * par palier — ils n'apparaissent qu'une fois la grille réunie en une décision.
 */

import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/** Une échelle de volume **sans palier** : elle ne dit rien. */
export class EmptyVolumeLadderError extends DomainError {
  constructor() {
    super(
      "pricing.ladder.empty",
      "Un barème de volume porte au moins un palier : sans palier, il n'accorde rien et occupe pourtant l'étage volume.",
    );
  }
}

/**
 * Deux paliers à la **même quantité**, ou une quantité nulle.
 *
 * À quantité égale, lequel gagne ? La réponse dépendrait de l'ordre de saisie,
 * donc du hasard — la même faute que deux règles également spécifiques, et le
 * même refus.
 */
export class AmbiguousVolumeTierError extends DomainError {
  constructor(readonly minQuantity: number) {
    super(
      "pricing.ladder.ambiguous_tier",
      `Deux paliers ne peuvent pas partager la même quantité (${String(minQuantity)}), et une quantité de palier est strictement positive.`,
    );
  }
}

/**
 * Un barème où **commander plus rapporte moins**.
 *
 * C'est l'incohérence que des règles indépendantes ne pouvaient pas voir :
 * « 50+ à −10 %, 100+ à −5 % » se compose de deux règles parfaitement valides,
 * et forme pourtant un barème que personne n'a voulu — un client qui passe de 90
 * à 100 pièces verrait sa remise fondre.
 */
export class RegressiveVolumeLadderError extends DomainError {
  constructor(
    readonly minQuantity: number,
    readonly previousMinQuantity: number,
  ) {
    super(
      "pricing.ladder.regressive",
      `Le palier ${String(minQuantity)} accorde moins que le palier ${String(previousMinQuantity)} : commander plus y rapporterait moins.`,
    );
  }
}

/**
 * Un barème **recouvre** un autre sur la même cible.
 *
 * Deux barèmes actifs sur le même produit rendraient le prix dépendant de
 * l'ordre de tri, donc du hasard — la même faute que deux règles également
 * spécifiques, et le même refus. La différence est qu'ici l'ambiguïté serait
 * INVISIBLE : un barème ne se lit pas en frise, il se lit en grille.
 *
 * C'est la contrainte d'exclusion qui parle. Sa réponse est traduite plutôt
 * qu'avalée : le staff doit savoir lequel des deux il est en train de doubler.
 */
export class OverlappingVolumeLadderError extends BusinessError {
  constructor(cause?: unknown) {
    super(
      "pricing.ladder.overlaps",
      "Un barème de volume est déjà en vigueur sur cette cible pendant cette période. Fermez-le ou décalez sa fin avant d'en poser un autre.",
      cause,
    );
  }
}

/**
 * Une ligne de `volume_ladders` que le domaine ne sait pas lire.
 *
 * Même raisonnement que pour une règle illisible : un barème ignoré facturerait
 * un prix que personne n'a décidé, et sans trace.
 */
export class CorruptedVolumeLadderError extends TechnicalError {
  constructor(
    readonly ladderId: string,
    readonly reason: string,
  ) {
    super("pricing.ladder.corrupted", `Barème « ${ladderId} » illisible : ${reason}.`);
  }
}

/**
 * Un geste sur un barème **archivé**.
 *
 * Codes distincts de ceux des règles (`pricing.ladder.*` et non
 * `pricing.rule.*`) : l'écran doit pouvoir dire « ce barème » et non « cette
 * règle ». Le staff qui lit le message n'a pas à traduire.
 */
export class ArchivedVolumeLadderIsSealedError extends BusinessError {
  constructor(readonly ladderId: string) {
    super(
      "pricing.ladder.archived_is_sealed",
      "Ce barème est archivé : une décision close ne se rouvre pas. Posez-en un nouveau.",
    );
  }
}

/** Suspendre deux fois : le second geste n'aurait que l'apparence d'un effet. */
export class VolumeLadderAlreadyPausedError extends BusinessError {
  constructor(
    readonly ladderId: string,
    readonly pausedAt: Date,
  ) {
    super("pricing.ladder.already_paused", "Ce barème est déjà suspendu.");
  }
}

/** Reprendre ce qui n'a jamais été suspendu. */
export class VolumeLadderNotPausedError extends BusinessError {
  constructor(readonly ladderId: string) {
    super("pricing.ladder.not_paused", "Ce barème n'est pas en pause : il n'y a rien à reprendre.");
  }
}

/** Aucun barème sous cet identifiant. Un 404, comme pour une règle. */
export class VolumeLadderNotFoundError extends ResourceNotFoundError {
  constructor(readonly ladderId: string) {
    super("pricing.ladder.not_found", `Aucun barème de volume « ${ladderId} ».`);
  }
}
