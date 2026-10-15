import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus du contexte **operations** du commerce — repris de l'agrégat du
 * référentiel (`pim/operations`), dont ce contexte devient la source
 * (`documentation/operations-datees/plan-l-operation-passe-au-commerce.md`).
 *
 * Chaque message est lu par du personnel qui n'a pas le code sous les yeux :
 * il nomme le cas réel et le geste de sortie. Les dates y sont dites en heure
 * de Paris (`JJ/MM/AAAA à HH:MM`), jamais en ISO.
 */

/**
 * L'écriture des opérations au commerce est FERMÉE sur ce déploiement
 * (`OPERATIONS_AT_COMMERCE`). 409 : la demande est bien formée, c'est l'état
 * du déploiement qui s'y oppose — elle ouvre à la bascule (lot 3 du plan).
 */
export class OperationWritingClosedError extends BusinessError {
  constructor() {
    super(
      "operations.writing_closed",
      "L'écriture des opérations au commerce ouvre à la bascule (OPERATIONS_AT_COMMERCE) : " +
        "d'ici là, une opération se prépare au référentiel (« Opérations datées ») et se " +
        "restreint à la réception du catalogue.",
    );
  }
}

/** La clé n'a pas la forme d'une identité : minuscules, chiffres, tirets. 400. */
export class InvalidOperationKeyError extends DomainError {
  constructor(readonly key: string) {
    super(
      "operations.key_invalid",
      `La clé « ${key} » n'est pas valable : minuscules sans accent, chiffres et tirets ` +
        `seulement, 64 caractères au plus (par exemple « noel-2026 »).`,
    );
  }
}

/**
 * La clé est déjà prise — **archivée ou retirée comprise**. Une clé ne se
 * réemploie jamais (D9) : la vitrine (`operation-link.ts`) et le rayon
 * `op:<key>` y sont accrochés.
 */
export class OperationKeyTakenError extends BusinessError {
  constructor(readonly key: string) {
    super(
      "operations.key_taken",
      `La clé « ${key} » est déjà celle d'une opération, peut-être archivée. Une clé ne ` +
        `se réemploie jamais : choisissez-en une autre (par exemple « ${key}-bis »).`,
    );
  }
}

/** Aucune opération ne porte cette clé au commerce. */
export class OperationNotFoundError extends ResourceNotFoundError {
  constructor(readonly key: string) {
    super("operations.not_found", `Aucune opération ne porte la clé « ${key} » au commerce.`);
  }
}

/** Un jour de retrait qui n'est pas un jour du calendrier. 400. */
export class InvalidOperationDayError extends DomainError {
  constructor(
    readonly field: string,
    readonly raw: string,
  ) {
    super(
      "operations.day_invalid",
      `« ${raw} » n'est pas un jour valable pour ${field} : attendu AAAA-MM-JJ, ` +
        `un jour qui existe au calendrier.`,
    );
  }
}

/** Un instant illisible. 400. */
export class InvalidOperationInstantError extends DomainError {
  constructor(readonly field: string) {
    super("operations.instant_invalid", `La date de ${field} n'est pas lisible.`);
  }
}

/** Les quatre façons dont les cinq dates se contredisent — une par invariant de D2. */
export type ScheduleRefusal =
  | "announce_after_order"
  | "order_window_empty"
  | "pickup_window_inverted"
  | "order_after_pickup_end";

/** Les cinq dates se contredisent (D2). Un code par cas, une phrase pour le staff. */
export class InvalidOperationScheduleError extends DomainError {
  /** Public pour `instanceof` ; on le construit par les fabriques ci-dessous. */
  constructor(reason: ScheduleRefusal, message: string) {
    super(`operations.${reason}`, message);
  }

  static announceAfterOrder(announce: string, order: string): InvalidOperationScheduleError {
    return new InvalidOperationScheduleError(
      "announce_after_order",
      `L'annonce (${announce}) tombe après l'ouverture des commandes (${order}) : on annonce ` +
        `d'abord, on vend ensuite. Avancez l'annonce ou retardez l'ouverture.`,
    );
  }

  static emptyOrderWindow(opens: string, until: string): InvalidOperationScheduleError {
    return new InvalidOperationScheduleError(
      "order_window_empty",
      `Les commandes fermeraient (${until}) avant d'avoir ouvert (${opens}). ` +
        `Retardez la clôture ou avancez l'ouverture.`,
    );
  }

  static pickupInverted(from: string, until: string): InvalidOperationScheduleError {
    return new InvalidOperationScheduleError(
      "pickup_window_inverted",
      `Le premier jour de retrait (${from}) tombe après le dernier (${until}). ` +
        `Inversez-les, ou retirez sur un seul jour.`,
    );
  }

  static orderAfterPickupEnd(until: string, lastDay: string): InvalidOperationScheduleError {
    return new InvalidOperationScheduleError(
      "order_after_pickup_end",
      `Les commandes fermeraient (${until}) après le dernier jour de retrait (${lastDay}) : ` +
        `une commande passée si tard ne pourrait plus être retirée. Avancez la clôture ` +
        `ou prolongez les retraits.`,
    );
  }
}

/** La clientèle n'est pas l'une des trois. 400 — une ligne relue de travers aussi. */
export class InvalidOperationAudienceError extends DomainError {
  constructor(readonly audience: string) {
    super(
      "operations.audience_invalid",
      `« ${audience} » n'est pas une clientèle : professionnels (pro), particuliers ` +
        `(public) ou les deux (both).`,
    );
  }
}

/** Un nom d'opération sans français. 400. */
export class InvalidOperationTextError extends DomainError {
  constructor(readonly field: string) {
    super(
      "operations.text_invalid",
      `Le champ « ${field} » doit avoir une valeur en français : c'est celle que la boutique affiche d'abord.`,
    );
  }
}

/** Une image sans adresse. 400. */
export class InvalidOperationImageError extends DomainError {
  constructor() {
    super(
      "operations.image_invalid",
      "L'image de l'opération n'a pas d'adresse : donnez-en une, ou retirez l'image.",
    );
  }
}

/**
 * Un point focal hors de l'image. 400. Il vient de la médiathèque, qui le
 * borne déjà : le voir ici, c'est une ligne relue de travers.
 */
export class InvalidOperationFocalError extends DomainError {
  constructor(
    readonly x: number,
    readonly y: number,
  ) {
    super(
      "operations.image_focal_invalid",
      `Le point focal de l'image (${x} ; ${y}) sort de l'image : chaque coordonnée va de 0 à 1. ` +
        `Reposez-le à la médiathèque.`,
    );
  }
}

/**
 * L'image choisie n'est pas dans la médiathèque (→ 404). Une opération ne
 * porte qu'une image du fonds : une adresse tierce peut disparaître, et la
 * médiathèque ne saurait pas qu'on l'affiche.
 */
export class UnknownOperationImageError extends ResourceNotFoundError {
  constructor(readonly url: string) {
    super(
      "operations.image_unknown",
      `L'image « ${url} » n'est pas dans la médiathèque : déposez-la d'abord à la ` +
        `médiathèque, puis choisissez-la depuis l'opération.`,
    );
  }
}

/** La sélection nomme deux fois le même article. 400. */
export class DuplicateOperationSkuError extends DomainError {
  constructor(readonly sku: string) {
    super(
      "operations.sku_duplicate",
      `L'article ${sku} figure deux fois dans la sélection : gardez-le à une seule place.`,
    );
  }
}

/** La sélection dépasse ce qu'un rayon affiche. 400. */
export class OperationSelectionTooLargeError extends DomainError {
  constructor(readonly limit: number) {
    super(
      "operations.selection_too_large",
      `Une opération sélectionne ${String(limit)} articles au plus. Retirez-en, ou ` +
        `répartissez-les sur deux opérations.`,
    );
  }
}

/** Des SKU que le catalogue du commerce ne connaît pas. 400 : la demande ne désigne rien. */
export class UnknownOperationSkusError extends DomainError {
  constructor(readonly skus: readonly string[]) {
    super(
      "operations.sku_unknown",
      `${skus.length > 1 ? "Ces références ne désignent" : "Cette référence ne désigne"} ` +
        `aucun article reçu du référentiel : ${skus.join(", ")}. Vérifiez la saisie, ou ` +
        `attendez que l'article soit arrivé au catalogue.`,
    );
  }
}

/** L'opération est archivée : elle ne se modifie plus. 409. */
export class OperationArchivedError extends BusinessError {
  constructor(readonly key: string) {
    super(
      "operations.archived",
      `L'opération « ${key} » est archivée : elle ne se modifie plus. Préparez-en une ` +
        `nouvelle, sous une autre clé.`,
    );
  }
}

/** Minuit n'existe pas ce jour-là à Paris — impossible tant que les bascules tombent la nuit. */
export class MidnightMissingError extends TechnicalError {
  constructor(readonly day: string) {
    super(
      "operations.midnight_missing",
      `Minuit n'existe pas le ${day} à Paris : la fin des retraits ne se calcule pas.`,
    );
  }
}
