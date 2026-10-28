import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../platform/shared/errors/app-error.js";

/** Un brouillon sans article : il ne se retrouverait pas. */
export class EmptyBakehouseResupplyDraftError extends DomainError {
  constructor() {
    super(
      "resupply.bakehouse_draft.empty",
      "Un brouillon de réassort porte au moins un article : saisissez une quantité avant de l'enregistrer.",
    );
  }
}

/** Plus de lignes que la table du catalogue n'en propose raisonnablement. */
export class TooManyBakehouseResupplyDraftLinesError extends DomainError {
  constructor(readonly max: number) {
    super(
      "resupply.bakehouse_draft.too_many_lines",
      `Un brouillon de réassort porte au plus ${String(max)} articles : partagez la composition en deux réassorts.`,
    );
  }
}

/** Un même article deux fois : l'écran envoie une quantité par article. */
export class DuplicateBakehouseResupplyDraftLineError extends DomainError {
  constructor(readonly sku: string) {
    super(
      "resupply.bakehouse_draft.duplicate_line",
      `L'article ${sku} figure deux fois dans le brouillon : gardez une seule ligne et additionnez les quantités.`,
    );
  }
}

/** Une ligne sans article. */
export class BlankBakehouseResupplyDraftSkuError extends DomainError {
  constructor() {
    super(
      "resupply.bakehouse_draft.blank_sku",
      "Une ligne du brouillon n'a pas d'article : choisissez-le dans la table du catalogue.",
    );
  }
}

/** Un statut inconnu relu en base. */
export class UnknownBakehouseResupplyDraftStatusError extends DomainError {
  constructor(readonly status: string) {
    super(
      "resupply.bakehouse_draft.unknown_status",
      `Le statut de brouillon « ${status} » n'existe pas : un brouillon est ouvert, envoyé ou supprimé.`,
    );
  }
}

/** Le brouillon a déjà été envoyé ou supprimé : il ne s'écrit plus. */
export class BakehouseResupplyDraftClosedError extends BusinessError {
  constructor(readonly draftId: string) {
    super(
      "resupply.bakehouse_draft.closed",
      "Ce brouillon a déjà été envoyé ou supprimé depuis un autre poste : rechargez la liste des brouillons, puis recomposez le réassort si besoin.",
    );
  }
}

/** Un autre poste a écrit le brouillon depuis qu'il a été lu. */
export class BakehouseResupplyDraftChangedMeanwhileError extends BusinessError {
  constructor() {
    super(
      "resupply.bakehouse_draft.changed_meanwhile",
      "Ce brouillon vient d'être modifié depuis un autre poste : rouvrez-le depuis la liste des brouillons pour voir sa version à jour, puis refaites votre geste.",
    );
  }
}

/** Le brouillon visé n'existe pas. */
export class BakehouseResupplyDraftNotFoundError extends ResourceNotFoundError {
  constructor(readonly draftId: string) {
    super(
      "resupply.bakehouse_draft.not_found",
      "Ce brouillon de réassort n'existe pas : rechargez la liste des brouillons.",
    );
  }
}

/** Les lignes relues en base ne sont pas lisibles : on ne rend pas un brouillon vidé en silence. */
export class UnreadableBakehouseResupplyDraftError extends TechnicalError {
  constructor(
    readonly draftId: string,
    cause: unknown,
  ) {
    super(
      "resupply.bakehouse_draft.unreadable",
      `Les lignes du brouillon ${draftId} sont illisibles en base : signalez-le, le brouillon n'a pas été modifié.`,
      cause,
    );
  }
}
