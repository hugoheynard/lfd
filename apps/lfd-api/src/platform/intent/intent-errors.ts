import { BusinessError, TechnicalError } from "../shared/errors/app-error.js";

/**
 * Une clé d'intention déjà servie pour un autre geste, ou pour le même geste
 * avec d'autres valeurs (le sujet porte l'empreinte du contenu,
 * `intentSubject`). Rien n'est écrit : rendre le résultat d'avant ferait
 * croire que les nouvelles valeurs sont enregistrées. Les écrans oublient la
 * clé sur ce refus, et le nouvel essai en porte une neuve.
 */
export class IntentKeyReusedError extends BusinessError {
  constructor() {
    super(
      "intent.key_reused",
      "Ce geste a déjà été enregistré avec d'autres valeurs, et ces nouvelles valeurs ne l'ont pas été : rechargez la page pour relire ce qui est enregistré, puis recommencez si une correction reste à faire.",
    );
  }
}

/** Le même geste est déjà en cours, lancé par un clic précédent. */
export class GestureInFlightError extends BusinessError {
  constructor() {
    super(
      "intent.in_flight",
      "Ce geste est déjà en cours depuis un premier clic : attendre sa réponse, puis recharger la page pour voir son issue.",
    );
  }
}

/** Le résultat gardé d'un geste ne se relit plus : forme inattendue en base. */
export class IntentRecordUnreadableError extends TechnicalError {
  constructor(gesture: string, field: string) {
    super(
      "intent.record_unreadable",
      `Le résultat gardé du geste « ${gesture} » est illisible (champ « ${field} ») : le geste a abouti, recharger la page pour voir son état.`,
    );
  }
}

/**
 * Le geste a été scellé par un AUTRE appel, qui avait repris l'intention après
 * le bail : celui-ci est annulé avec sa transaction, pour que le geste ne
 * s'écrive qu'une fois.
 */
export class IntentAlreadySealedError extends TechnicalError {
  constructor(gesture: string) {
    super(
      "intent.already_sealed",
      `Le geste « ${gesture} » a déjà abouti par un autre appel de la même demande : cet appel-ci est annulé, rien n'a été écrit deux fois. Recharger la page pour voir son état.`,
    );
  }
}

/** Une intention réclamée dans une transaction ouverte : la réclamation doit la précéder. */
export class IntentClaimInsideTransactionError extends TechnicalError {
  constructor(gesture: string) {
    super(
      "intent.claim_inside_transaction",
      `Le geste « ${gesture} » réclame son intention dans une transaction déjà ouverte : la réclamation doit se faire avant d'ouvrir l'unité de travail. Rien n'a été écrit ; signaler ce cas.`,
    );
  }
}
