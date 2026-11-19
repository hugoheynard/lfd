import {
  BusinessError,
  DomainError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/** Un produit dont la limite a été passée, nommé pour le refus. */
export interface PassedItemLimit {
  /** Le nom du produit tel que la commande le porte. */
  readonly productName: string;
  readonly daysBefore: number;
  /** `HH:mm`, à Paris. */
  readonly time: string;
}

/**
 * **La saisie passe outre la limite d'un produit sans dire pourquoi** — refus
 * métier (409), levé avant le règlement : aucun lien de paiement n'est créé,
 * et la clé d'intention est rendue.
 *
 * Le message nomme chaque produit avec sa limite, et le geste de sortie :
 * écrire le motif. Celle qui saisit n'a pas le référentiel sous les yeux.
 */
export class ItemLimitReasonRequiredError extends BusinessError {
  constructor(readonly passed: readonly PassedItemLimit[]) {
    super(
      "orders.cutoff.item_limit_reason_required",
      `${passed.map(describePassed).join(" ; ")} : indiquez pourquoi vous passez outre.`,
    );
  }
}

/**
 * **Le motif d'un dépassement est vide ou trop long** — refus de domaine (400).
 * L'écran borne déjà la saisie ; ce refus tient la règle pour tout appelant.
 */
export class ItemLimitOverrideReasonInvalidError extends DomainError {
  constructor(readonly maxLength: number) {
    super(
      "orders.cutoff.item_limit_reason_invalid",
      `Le motif du dépassement doit compter de 1 à ${maxLength} caractères. Raccourcissez-le ou complétez-le.`,
    );
  }
}

/**
 * **L'équipe ajoute à une commande un produit dont la limite est passée**,
 * sans pouvoir passer outre — refus métier (409).
 *
 * Un code à lui plutôt que `orders.cutoff.past` : celui-là dit que la
 * JOURNÉE est fermée, et les écrans y répondent « choisissez une autre
 * date ». Ici la journée reste ouverte à l'équipe (la règle générale ne lui
 * est pas opposée en modification) ; seul ce produit l'est, et le message le
 * nomme avec les gestes de sortie.
 */
export class ItemLimitPassedOnRevisionError extends BusinessError {
  constructor(readonly productNames: readonly string[]) {
    super(
      "orders.cutoff.item_limit_past",
      `${productNames.map((name) => `« ${name} »`).join(", ")} ne se commande plus pour cette journée : sa limite de commande est passée. Retirez-le de la modification, choisissez une journée plus tardive, ou demandez à une personne qui a le droit de passer outre, si la fiche du produit le permet.`,
    );
  }
}

/** Une trace de dépassement dont l'origine n'est pas l'une des deux admises. */
export class ItemLimitOverrideUnreadableError extends TechnicalError {
  constructor(
    readonly overrideId: string,
    readonly origin: string,
  ) {
    super(
      "orders.item_limit_override.unreadable",
      `La trace de dépassement ${overrideId} porte une origine inconnue (« ${origin} ») : la table a été écrite hors de l'application.`,
    );
  }
}

function describePassed(passed: PassedItemLimit): string {
  return `« ${passed.productName} » se commande ${daysOf(passed.daysBefore)}, ${hourOf(passed.time)}`;
}

function daysOf(daysBefore: number): string {
  if (daysBefore === 0) {
    return "le jour même";
  }
  return daysBefore === 1 ? "1 jour avant" : `${daysBefore} jours avant`;
}

/** `09:30` → « 9 h 30 », `12:00` → « 12 h ». */
function hourOf(time: string): string {
  const [hours = "", minutes = ""] = time.split(":");
  const hour = String(Number(hours));
  return minutes === "00" || minutes === "" ? `${hour} h` : `${hour} h ${minutes}`;
}
