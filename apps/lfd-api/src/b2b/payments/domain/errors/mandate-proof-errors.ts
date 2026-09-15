import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Le mandat a changé **pendant** le geste — **409**.
 *
 * L'écriture de la pièce (et toute réécriture du mandat) est conditionnée en
 * base à ce qu'on a chargé : le mandat encore brouillon, et la même pièce. Zéro
 * ligne écrite veut dire qu'un autre geste est passé entre la lecture et
 * l'écriture — un second dépôt, une signature, une révocation.
 *
 * Refuser plutôt qu'écraser : le cas qui a motivé la condition est un redépôt
 * concurrent d'une signature, qui aurait fait purger la pièce du mandat qu'on
 * venait d'activer (plan `documentation/comptabilite/plan-restes-du-mandat.md`
 * §7 #3).
 */
export class MandateProofChangedError extends BusinessError {
  constructor() {
    super(
      "payments.mandate.proof_changed",
      "Le mandat a changé pendant l'opération : un autre scan a été déposé, ou il a été signé ou abandonné entre-temps. Rechargez la fiche, vérifiez la pièce, puis recommencez.",
    );
  }
}

/**
 * La signature vise une pièce qui n'est plus celle du mandat — **409**.
 *
 * Le staff déclare un mandat signé après avoir relu son scan. Si le scan a été
 * remplacé depuis, la déclaration porterait sur un papier que personne n'a
 * regardé (plan §7 #9). Le geste de sortie est de relire la pièce courante.
 */
export class MandateProofRevisionStaleError extends BusinessError {
  constructor() {
    super(
      "payments.mandate.proof_revision_stale",
      "Le scan de ce mandat a été remplacé depuis que la fiche a été ouverte : rechargez-la et relisez la nouvelle pièce avant de déclarer le mandat signé.",
    );
  }
}
