import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus du contexte **operations**.
 *
 * Chaque message est lu par du personnel qui n'a pas le code sous les yeux :
 * il nomme le cas réel et le geste de sortie. Les dates y sont dites en heure
 * de Paris (`JJ/MM/AAAA à HH:MM`), jamais en ISO — c'est ce que l'écran saisit.
 */

/** La clé n'a pas la forme d'une identité : minuscules, chiffres, tirets. 400. */
export class InvalidOperationKeyError extends DomainError {
  constructor(readonly key: string) {
    super(
      "pim.operation.key_invalid",
      `La clé « ${key} » n'est pas valable : minuscules sans accent, chiffres et tirets ` +
        `seulement, 64 caractères au plus (par exemple « noel-2026 »).`,
    );
  }
}

/**
 * La clé est déjà prise — **archivée comprise**. 409 : la demande est bien
 * formée, c'est l'existence d'une autre opération qui s'y oppose.
 *
 * Une clé ne se réemploie jamais (D9) : le commerce accroche ses surcharges à
 * cette clé, et une « nouvelle » `noel-2026` hériterait des décisions prises
 * sur l'ancienne sans que personne l'ait voulu.
 */
export class OperationKeyTakenError extends BusinessError {
  constructor(readonly key: string) {
    super(
      "pim.operation.key_taken",
      `La clé « ${key} » est déjà celle d'une opération, peut-être archivée. Une clé ne ` +
        `se réemploie jamais : choisissez-en une autre (par exemple « ${key}-bis »).`,
    );
  }
}

/** Aucune opération ne porte cette clé. */
export class OperationNotFoundError extends ResourceNotFoundError {
  constructor(readonly key: string) {
    super("pim.operation.not_found", `Aucune opération ne porte la clé « ${key} ».`);
  }
}

/** Un jour de retrait qui n'est pas un jour du calendrier. 400. */
export class InvalidOperationDayError extends DomainError {
  constructor(
    readonly field: string,
    readonly raw: string,
  ) {
    super(
      "pim.operation.day_invalid",
      `« ${raw} » n'est pas un jour valable pour ${field} : attendu AAAA-MM-JJ, ` +
        `un jour qui existe au calendrier.`,
    );
  }
}

/** Un instant illisible. 400. */
export class InvalidOperationInstantError extends DomainError {
  constructor(readonly field: string) {
    super("pim.operation.instant_invalid", `La date de ${field} n'est pas lisible.`);
  }
}

/** Les quatre façons dont les cinq dates se contredisent — une par invariant de D2. */
export type ScheduleRefusal =
  | "announce_after_order"
  | "order_window_empty"
  | "pickup_window_inverted"
  | "order_after_pickup_end";

/**
 * Les cinq dates se contredisent (D2). Un seul type, un code par cas : l'écran
 * qui voudrait surligner le bon champ lit le code, le staff lit la phrase.
 */
export class InvalidOperationScheduleError extends DomainError {
  /** Public pour `instanceof` et les assertions ; on le construit par les fabriques ci-dessous. */
  constructor(reason: ScheduleRefusal, message: string) {
    super(`pim.operation.${reason}`, message);
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
      "pim.operation.audience_invalid",
      `« ${audience} » n'est pas une clientèle : professionnels (pro), particuliers ` +
        `(public) ou les deux (both).`,
    );
  }
}

/** Une image sans adresse. 400. */
export class InvalidOperationImageError extends DomainError {
  constructor() {
    super(
      "pim.operation.image_invalid",
      "L'image de l'opération n'a pas d'adresse : choisissez-la dans la médiathèque, ou retirez-la.",
    );
  }
}

/** La sélection nomme deux fois le même article. 400. */
export class DuplicateOperationSkuError extends DomainError {
  constructor(readonly sku: string) {
    super(
      "pim.operation.sku_duplicate",
      `L'article ${sku} figure deux fois dans la sélection : gardez-le à une seule place.`,
    );
  }
}

/** La sélection dépasse ce qu'un rayon affiche. 400. */
export class OperationSelectionTooLargeError extends DomainError {
  constructor(readonly limit: number) {
    super(
      "pim.operation.selection_too_large",
      `Une opération sélectionne ${String(limit)} articles au plus. Retirez-en, ou ` +
        `répartissez-les sur deux opérations.`,
    );
  }
}

/** Des SKU qu'aucun article du référentiel ne porte. 400 : la demande ne désigne rien. */
export class UnknownOperationSkusError extends DomainError {
  constructor(readonly skus: readonly string[]) {
    super(
      "pim.operation.sku_unknown",
      `${skus.length > 1 ? "Ces références ne désignent" : "Cette référence ne désigne"} ` +
        `aucun article du catalogue : ${skus.join(", ")}. Vérifiez la saisie.`,
    );
  }
}

/** L'opération est archivée : elle ne se modifie plus. 409. */
export class OperationArchivedError extends BusinessError {
  constructor(readonly key: string) {
    super(
      "pim.operation.archived",
      `L'opération « ${key} » est archivée : elle ne se modifie plus. Préparez-en une ` +
        `nouvelle, sous une autre clé.`,
    );
  }
}

/**
 * Minuit n'existe pas ce jour-là à Paris. Impossible tant que les bascules
 * d'heure tombent à 2 h et 3 h — d'où une erreur technique, pas un refus.
 */
export class MidnightMissingError extends TechnicalError {
  constructor(readonly day: string) {
    super(
      "pim.operation.midnight_missing",
      `Minuit n'existe pas le ${day} à Paris : la fin des retraits ne se calcule pas.`,
    );
  }
}
