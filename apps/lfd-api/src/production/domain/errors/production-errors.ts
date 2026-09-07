import { BusinessError, DomainError } from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus propres à la **production**.
 *
 * Deux catégories et pas une : `DomainError` dit « cette donnée ne peut pas
 * exister », `BusinessError` dit « cet état ne permet pas ce geste ». Les
 * confondre rendrait un 400 là où le fournil attend un 409, et un écran qui
 * propose de réessayer là où il faut refuser.
 */

/**
 * La journée est **déjà arrêtée**.
 *
 * ⚠️ Ce n'est pas une garde de confort : le compte à produire est un instantané
 * pris à la clôture, et les commandes bougent après. Le recalculer donnerait un
 * autre nombre que celui sur lequel le fournil a lancé ses fournées.
 */
export class ProductionDayAlreadyClosedError extends BusinessError {
  constructor(serviceDay: string) {
    super(
      "production.day.already_closed",
      `La journée du ${serviceDay} est déjà arrêtée. Son compte à produire ne se recalcule pas.`,
    );
  }
}

/** On n'arrête pas une journée sans commande : il n'y aurait rien à produire. */
export class ProductionDayEmptyError extends BusinessError {
  constructor(serviceDay: string) {
    super("production.day.empty", `Aucune commande à produire le ${serviceDay} : rien à arrêter.`);
  }
}

/** Un jour de service s'écrit `AAAA-MM-JJ`, et rien d'autre. */
export class InvalidServiceDayError extends DomainError {
  constructor(value: string) {
    super(
      "production.service_day.invalid",
      `Jour de service invalide : « ${value} » (AAAA-MM-JJ attendu).`,
    );
  }
}
