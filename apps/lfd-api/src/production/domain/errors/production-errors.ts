import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../platform/shared/errors/app-error.js";

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

/**
 * La journée n'est **pas encore arrêtée**, et deux gestes l'exigent.
 *
 * **Le compte à produire** : tiré d'une journée ouverte, il serait arrêté sur un
 * état qui bouge encore — donc faux à la seconde où on le lit, et pire, archivé
 * sous une clé qui le rendrait ensuite tel quel.
 *
 * **Le colisage** : une commande qu'aucune clôture n'a inscrite n'est pas à
 * fabriquer aujourd'hui. La déclarer colisée créerait un fait sur une journée
 * qui n'existe pas encore.
 */
export class ProductionDayNotClosedError extends BusinessError {
  constructor(serviceDay: string) {
    // 🔴 Le message nommait le compte à produire — juste pour le tirage du PDF,
    // hors sujet pour un colisage refusé, qui lève la MÊME erreur. Il nomme
    // désormais le cas et le geste de sortie, ce qui vaut pour les deux : ce
    // refus est lu par quelqu'un qui n'a pas le code sous les yeux.
    super(
      "production.day.not_closed",
      `La journée du ${serviceDay} n'est pas arrêtée. Clôturez le plan du soir d'abord.`,
    );
  }
}

/**
 * Aucune feuille pour cette référence dans cette journée.
 *
 * Un `ResourceNotFoundError` et pas un refus métier : la question « où est la
 * feuille de CMD-0009 du 8 septembre ? » a une réponse vide, ce qui est
 * différent d'un état qui interdit le geste.
 */
export class AtelierSheetNotFoundError extends ResourceNotFoundError {
  constructor(reference: string, serviceDay: string) {
    super(
      "production.sheet.not_found",
      `Aucune feuille d'atelier pour ${reference} le ${serviceDay}.`,
    );
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

/**
 * La plage demandée n'en est pas une.
 *
 * Deux cas, un seul refus : la fin précède le début, ou la plage dépasse ce
 * qu'un écran peut montrer d'un coup. Le second n'est pas une garde de
 * performance — c'est la raison d'être de l'écran : une matrice de quatre-vingts
 * colonnes ne répond plus à « quand est-ce que ça me tombe dessus », elle
 * demande de faire défiler pour le savoir.
 */
export class InvalidServiceRangeError extends DomainError {
  constructor(reason: string) {
    super("production.service_range.invalid", `Plage de production invalide : ${reason}.`);
  }
}

/**
 * Aucun article sous ce SKU dans le **compte à produire** de la journée.
 *
 * ⚠️ Ce n'est pas « ce produit n'existe pas » : la production ne connaît pas le
 * catalogue. C'est « il n'est pas au programme de ce jour-là », et c'est la
 * seule chose qu'elle sache dire. Un 404, donc, et pas un 400 — l'appelant ne
 * corrigera pas sa charge, il regarde la mauvaise journée.
 */
export class ProducedItemNotFoundError extends ResourceNotFoundError {
  constructor(sku: string, serviceDay: string) {
    super(
      "production.item.not_found",
      `Aucun article « ${sku} » au compte à produire du ${serviceDay}.`,
    );
  }
}
