import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus du contexte **bundles** — les formules du commerce
 * (`documentation/formules/plan-les-formules.md`, lot F2a).
 *
 * Chaque message est lu par du personnel qui n'a pas le code sous les yeux :
 * il nomme le cas réel et le geste de sortie. « Formule » est le mot de
 * l'écran ; `bundle` reste celui du code.
 */

/** Un texte vide, ou trop long pour l'écran qui l'affiche. 400. */
export class InvalidBundleTextError extends DomainError {
  constructor(
    readonly field: string,
    readonly max: number,
  ) {
    super(
      "bundles.text_invalid",
      `${field} de la formule doit contenir au moins une lettre ou un chiffre, et ` +
        `${String(max)} caractères au plus.`,
    );
  }
}

/** La clientèle n'est pas celle qu'une formule admet aujourd'hui. 400. */
export class InvalidBundleAudienceError extends DomainError {
  constructor(readonly audience: string) {
    super(
      "bundles.audience_invalid",
      `« ${audience} » n'est pas une clientèle admise pour une formule : les formules ne ` +
        `se vendent pour l'instant qu'aux particuliers (public).`,
    );
  }
}

/** Le statut relu n'est pas l'un de ceux que ce lot connaît. 400. */
export class InvalidBundleStatusError extends DomainError {
  constructor(readonly status: string) {
    super(
      "bundles.status_invalid",
      `« ${status} » n'est pas un état de formule : brouillon (draft) ou retirée (withdrawn).`,
    );
  }
}

/** Moins de deux groupes : ce ne serait plus une formule, mais un article. 400. */
export class BundleTooFewGroupsError extends DomainError {
  constructor(readonly count: number) {
    super(
      "bundles.too_few_groups",
      `Une formule compte au moins deux groupes (par exemple « Viennoiserie » et ` +
        `« Boisson ») ; celle-ci en aurait ${String(count)}. Ajoutez un groupe.`,
    );
  }
}

/** Un groupe sans aucun choix : le client n'y pourrait rien prendre. 400. */
export class EmptyBundleGroupError extends DomainError {
  constructor(readonly label: string) {
    super(
      "bundles.group_empty",
      `Le groupe « ${label} » n'a aucun article au choix : ajoutez-en au moins un, ou ` +
        `retirez le groupe.`,
    );
  }
}

/** Deux groupes sous la même clé — le plus souvent, le même libellé. 400. */
export class DuplicateBundleGroupError extends DomainError {
  constructor(readonly key: string) {
    super(
      "bundles.group_duplicate",
      `Deux groupes de la formule portent la clé « ${key} » : donnez-leur des libellés ` +
        `distincts.`,
    );
  }
}

/** Une clé de groupe que la formule ne connaît pas. 400 : la demande ne désigne rien. */
export class UnknownBundleGroupError extends DomainError {
  constructor(readonly key: string) {
    super(
      "bundles.group_unknown",
      `La formule n'a pas de groupe « ${key} ». Rechargez la formule : un autre onglet ` +
        `l'a peut-être modifiée.`,
    );
  }
}

/**
 * Un article choisi deux fois dans la même formule — dans un groupe ou dans
 * deux. 400. Un même article dans deux groupes rendrait la part de chacun
 * ambiguë, et la commande ne saurait plus quel groupe il remplit.
 */
export class DuplicateBundleChoiceError extends DomainError {
  constructor(readonly sku: string) {
    super(
      "bundles.choice_duplicate",
      `L'article ${sku} figure deux fois dans la formule : un article n'y entre qu'une ` +
        `fois, dans un seul groupe.`,
    );
  }
}

/** Des références que le catalogue du commerce ne connaît pas. 400. */
export class UnknownBundleChoicesError extends DomainError {
  constructor(readonly skus: readonly string[]) {
    super(
      "bundles.choice_unknown",
      `${skus.length > 1 ? "Ces références ne désignent" : "Cette référence ne désigne"} ` +
        `aucun article du catalogue : ${skus.join(", ")}. Choisissez l'article par la ` +
        `recherche de l'écran.`,
    );
  }
}

/**
 * Un article que la boutique ne sert pas aux particuliers en ce moment —
 * réservé aux pros, masqué, ou en attente de validation. 409 :
 * l'article existe, c'est son état qui refuse.
 */
export class BundleChoiceNotServedToPublicError extends BusinessError {
  constructor(readonly articles: readonly string[]) {
    super(
      "bundles.choice_not_served_to_public",
      `${articles.length > 1 ? "Ces articles ne sont" : "Cet article n'est"} pas en vente ` +
        `aux particuliers en ce moment : ${articles.join(", ")}. Une formule ne propose que ` +
        `ce que la boutique sert au public — vérifiez au catalogue publié qu'il n'est ni ` +
        `réservé aux pros, ni masqué, ni en attente de validation.`,
    );
  }
}

/**
 * Un article qui ne se vend que pendant une opération datée. 409 : la formule
 * le proposerait hors de son opération.
 */
export class BundleChoiceOperationOnlyError extends BusinessError {
  constructor(readonly articles: readonly string[]) {
    super(
      "bundles.choice_operation_only",
      `${articles.length > 1 ? "Ces articles ne se vendent" : "Cet article ne se vend"} ` +
        `que pendant une opération datée : ${articles.join(", ")}. Une formule ne peut pas ` +
        `le proposer — retirez-le de la formule.`,
    );
  }
}

/** La clé dérivée du nom est déjà celle d'une formule, retirée comprise. 409. */
export class BundleKeyTakenError extends BusinessError {
  constructor(readonly key: string) {
    super(
      "bundles.key_taken",
      `Une formule porte déjà la clé « ${key} », peut-être retirée : une clé ne se ` +
        `réemploie jamais. Donnez à la nouvelle formule un autre nom.`,
    );
  }
}

/** Aucune formule ne porte cette clé. 404. */
export class BundleNotFoundError extends ResourceNotFoundError {
  constructor(readonly key: string) {
    super("bundles.not_found", `Aucune formule ne porte la clé « ${key} ».`);
  }
}

/** La formule est retirée : elle ne se modifie plus tant qu'elle n'est pas remise en brouillon. 409. */
export class BundleWithdrawnError extends BusinessError {
  constructor(readonly key: string) {
    super(
      "bundles.withdrawn",
      `La formule « ${key} » est retirée : remettez-la en brouillon pour la modifier.`,
    );
  }
}

/** Retirer une formule déjà retirée. 409. */
export class BundleAlreadyWithdrawnError extends BusinessError {
  constructor(readonly key: string) {
    super("bundles.already_withdrawn", `La formule « ${key} » est déjà retirée.`);
  }
}

/** Remettre en brouillon une formule qui l'est déjà. 409. */
export class BundleAlreadyDraftError extends BusinessError {
  constructor(readonly key: string) {
    super(
      "bundles.already_draft",
      `La formule « ${key} » est déjà en brouillon : il n'y a rien à remettre.`,
    );
  }
}
