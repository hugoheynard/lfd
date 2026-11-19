import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../platform/shared/errors/app-error.js";

/** Un modèle sans article : il ne remplirait rien. */
export class EmptyResupplyTemplateError extends DomainError {
  constructor() {
    super(
      "resupply.template.empty",
      "Un modèle de réassort porte au moins un article : saisissez une quantité avant de l'enregistrer.",
    );
  }
}

/** Plus de lignes que la table du catalogue n'en propose raisonnablement. */
export class TooManyResupplyTemplateLinesError extends DomainError {
  constructor(readonly max: number) {
    super(
      "resupply.template.too_many_lines",
      `Un modèle de réassort porte au plus ${String(max)} articles : partagez-le en deux modèles.`,
    );
  }
}

/** Un même article deux fois : l'écran envoie une quantité par article. */
export class DuplicateResupplyTemplateLineError extends DomainError {
  constructor(readonly sku: string) {
    super(
      "resupply.template.duplicate_line",
      `L'article ${sku} figure deux fois dans le modèle : gardez une seule ligne et additionnez les quantités.`,
    );
  }
}

/** Une ligne sans article. */
export class BlankResupplyTemplateSkuError extends DomainError {
  constructor() {
    super(
      "resupply.template.blank_sku",
      "Une ligne du modèle n'a pas d'article : choisissez-le dans la table du catalogue.",
    );
  }
}

/** Un modèle se retrouve par son nom : il en faut un. */
export class ResupplyTemplateNameRequiredError extends DomainError {
  constructor() {
    super(
      "resupply.template.name_required",
      "Un modèle de réassort a un nom (« Base matin ») : saisissez-le avant d'enregistrer.",
    );
  }
}

/** Un modèle actif du même point porte déjà ce nom. */
export class ResupplyTemplateNameTakenError extends BusinessError {
  constructor(readonly templateName: string) {
    super(
      "resupply.template.name_taken",
      `Un modèle de ce point s'appelle déjà « ${templateName} » : choisissez un autre nom, ou archivez l'ancien modèle.`,
    );
  }
}

/** Le modèle est archivé : il ne s'ajuste plus. */
export class ResupplyTemplateArchivedError extends BusinessError {
  constructor(readonly templateId: string) {
    super(
      "resupply.template.archived",
      "Ce modèle a été archivé depuis un autre poste : rechargez la liste des modèles.",
    );
  }
}

/** Un autre poste a écrit le modèle depuis qu'il a été lu. */
export class ResupplyTemplateChangedMeanwhileError extends BusinessError {
  constructor() {
    super(
      "resupply.template.changed_meanwhile",
      "Ce modèle vient d'être modifié depuis un autre poste : rechargez-le pour voir sa version à jour, puis refaites votre geste.",
    );
  }
}

/** Le modèle visé n'existe pas. */
export class ResupplyTemplateNotFoundError extends ResourceNotFoundError {
  constructor(readonly templateId: string) {
    super(
      "resupply.template.not_found",
      "Ce modèle de réassort n'existe pas : rechargez la liste des modèles.",
    );
  }
}

/**
 * Un modèle porte déjà cet identifiant — la même création rejouée en même
 * temps : la base a refusé la seconde, que le cas d'usage relit.
 */
export class ResupplyTemplateAlreadyWrittenError extends BusinessError {
  constructor(readonly templateId: string) {
    super(
      "resupply.template.already_written",
      "Ce modèle vient d'être enregistré depuis un autre clic : rechargez la page, il y est déjà.",
    );
  }
}

/** La clé de création est déjà celle d'un modèle d'un AUTRE point. */
export class ResupplyTemplateKeyTakenError extends BusinessError {
  constructor(readonly key: string) {
    super(
      "resupply.template.key_taken",
      "Cet enregistrement porte une clé déjà employée par le modèle d'un autre point : rien n'a été enregistré. Fermez le panneau, rouvrez-le, puis enregistrez de nouveau.",
    );
  }
}

/** Les lignes relues en base ne sont pas lisibles : on ne rend pas un modèle vidé en silence. */
export class UnreadableResupplyTemplateError extends TechnicalError {
  constructor(
    readonly templateId: string,
    cause: unknown,
  ) {
    super(
      "resupply.template.unreadable",
      `Les lignes du modèle ${templateId} sont illisibles en base : signalez-le, le modèle n'a pas été modifié.`,
      cause,
    );
  }
}
