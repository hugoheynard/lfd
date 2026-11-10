import { ORDER_OPENING_EXEMPTION_ERRORS } from "@lfd/contracts";

import {
  BusinessError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/** La société à exempter n'existe pas (**404**). */
export class ExemptedCompanyNotFoundError extends ResourceNotFoundError {
  constructor(readonly companyId: string) {
    super(
      ORDER_OPENING_EXEMPTION_ERRORS.companyNotFound,
      "Cette société n'existe pas ou plus. Rechargez la liste des comptes clients et choisissez-en une autre.",
    );
  }
}

/** La société à exempter a cessé la relation commerciale (**409**). */
export class ExemptedCompanyTerminatedError extends BusinessError {
  constructor(readonly companyName: string) {
    super(
      ORDER_OPENING_EXEMPTION_ERRORS.companyTerminated,
      `${companyName} est archivée (relation commerciale terminée) : elle ne peut pas être exemptée. Exemptez plutôt l'adresse e-mail de la personne qui doit commander.`,
    );
  }
}

/** La cible porte déjà une exemption active (**409**). */
export class AlreadyExemptError extends BusinessError {
  constructor(readonly label: string) {
    super(
      ORDER_OPENING_EXEMPTION_ERRORS.alreadyExempt,
      `${label} est déjà dans la liste des exemptions : il n'y a rien à ajouter.`,
    );
  }
}

/** Aucune exemption active sous cet identifiant (**404**). */
export class OrderOpeningExemptionNotFoundError extends ResourceNotFoundError {
  constructor(readonly exemptionId: string) {
    super(
      ORDER_OPENING_EXEMPTION_ERRORS.notFound,
      "Cette exemption n'est plus dans la liste : elle a sans doute déjà été retirée. Rechargez la page.",
    );
  }
}
