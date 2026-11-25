import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

// ─── Données mal formées : le modèle se protège lui-même (400) ───────────────

export class InvalidEventNameError extends DomainError {
  constructor(readonly reason: string) {
    super("events.name.invalid", `Nom de l'événement refusé : ${reason}`);
  }
}

export class InvalidEventDateError extends DomainError {
  constructor(
    readonly raw: string,
    readonly reason: string,
  ) {
    super("events.date.invalid", `Date de l'événement « ${raw} » refusée : ${reason}`);
  }
}

export class InvalidEventApplicationsError extends DomainError {
  constructor(readonly reason: string) {
    super("events.applications.invalid", `Applications de l'événement refusées : ${reason}`);
  }
}

/** Aucun fichier dans le dépôt : le champ multipart manquait ou était vide. */
export class MissingFunctionSheetFileError extends DomainError {
  constructor() {
    super(
      "events.function_sheet.missing",
      "Aucun fichier reçu : choisissez la fiche de fonction en PDF, puis déposez-la.",
    );
  }
}

/** Le fichier n'est pas un PDF — ni par son type annoncé, ni par ses octets. */
export class FunctionSheetNotPdfError extends DomainError {
  constructor(readonly fileName: string) {
    super(
      "events.function_sheet.not_pdf",
      `« ${fileName} » n'est pas un PDF. Exportez la fiche en PDF depuis Excel ` +
        "(Fichier › Exporter › PDF), puis déposez le PDF.",
    );
  }
}

export class FunctionSheetTooLargeError extends DomainError {
  constructor(
    readonly fileName: string,
    readonly maxMegabytes: number,
  ) {
    super(
      "events.function_sheet.too_large",
      `« ${fileName} » dépasse ${String(maxMegabytes)} Mo. Exportez la fiche en PDF ` +
        "sans images en haute définition, ou coupez-la en plusieurs fiches.",
    );
  }
}

// ─── Règles métier (409) ─────────────────────────────────────────────────────

/** Un événement archivé ne reçoit plus de geste : ni fiche, ni nom, ni date. */
export class EventArchivedError extends BusinessError {
  constructor(readonly eventName: string) {
    super(
      "events.archived",
      `L'événement « ${eventName} » est archivé : on n'y dépose plus de fiche et on ne le ` +
        "modifie plus. Créez un nouvel événement si la journée a lieu.",
    );
  }
}

/** On ne remplace qu'une fiche en vigueur : une fiche retirée ou déjà remplacée ne l'est plus. */
export class FunctionSheetRetiredError extends BusinessError {
  constructor(readonly fileName: string) {
    super(
      "events.function_sheet.retired",
      `La fiche « ${fileName} » n'est plus en vigueur (retirée ou déjà remplacée) : ` +
        "rechargez la page et remplacez la version en vigueur, ou déposez une nouvelle fiche.",
    );
  }
}

// ─── Introuvables (404) ──────────────────────────────────────────────────────

export class EventNotFoundError extends ResourceNotFoundError {
  constructor(readonly eventId: string) {
    super(
      "events.not_found",
      `Aucun événement « ${eventId} » : la liste a peut-être changé, rechargez-la.`,
    );
  }
}

export class FunctionSheetNotFoundError extends ResourceNotFoundError {
  constructor(readonly sheetId: string) {
    super(
      "events.function_sheet.not_found",
      `Aucune fiche de fonction « ${sheetId} » en vigueur sur cet événement : elle a peut-être été retirée, rechargez la page.`,
    );
  }
}
