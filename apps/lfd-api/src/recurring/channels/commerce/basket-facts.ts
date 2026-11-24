import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";

/** Noms stables des faits d'un panier, clés de routage vers `@DurableHandler`. */
export const RECURRING_BASKET_OPENED = "recurring.basket_opened";
export const RECURRING_BASKET_PAUSED = "recurring.basket_paused";
export const RECURRING_BASKET_RESUMED = "recurring.basket_resumed";
export const RECURRING_BASKET_STOPPED = "recurring.basket_stopped";
export const RECURRING_BASKET_OCCURRENCE_CHANGED = "recurring.basket_occurrence_changed";

/** Un geste du client sur son panier, écrit en durable. */
export type RecurringBasketFactType =
  | typeof RECURRING_BASKET_OPENED
  | typeof RECURRING_BASKET_PAUSED
  | typeof RECURRING_BASKET_RESUMED
  | typeof RECURRING_BASKET_STOPPED
  | typeof RECURRING_BASKET_OCCURRENCE_CHANGED;

/**
 * Le site du panier, FIGÉ au geste : la société copiée sur le panier, son
 * nom du moment et son principal lu sous le verrou de la ligne du site
 * (`BasketBuyerStanding.siteOf`). `null` pour un panier sans société.
 */
export interface BasketFactSite {
  readonly companyId: string;
  readonly name: string;
  readonly principalCompanyId: string | null;
}

/**
 * **Un geste sur un panier récurrent** — écrit par le bloc dans la
 * transaction du geste (plan `plan-bloc-recurrent.md`, § 6.2). Le bloc ne
 * sait pas qui l'écoute : aujourd'hui l'avis au principal et la croissance.
 *
 * La charge ne porte ni lignes, ni adresse, ni note : un abonné n'a pas à
 * les connaître. L'auteur est toujours le client acheteur — le staff n'agit
 * pas sur un panier.
 *
 * La clé : `<type>:<basketId>` pour l'ouverture et l'arrêt, qui n'ont lieu
 * qu'une fois ; `<type>:<basketId>:<gestureId>` pour les gestes qui se
 * répètent (pause, reprise, échéance modifiée) — un fait par geste.
 *
 * 🔴 Il vit dans le CANAL : un fait qu'un autre bloc consomme fait partie de
 * la surface publiée, au même titre qu'un port.
 */
export class RecurringBasketFact implements DurableEvent {
  constructor(
    readonly type: RecurringBasketFactType,
    readonly basketId: string,
    readonly buyerUserId: string,
    /** La cadence du panier (`weekly`, `biweekly`, `monthly`). */
    readonly cadence: string,
    readonly site: BasketFactSite | null,
    /** Présent pour un geste qui se répète ; `null` pour l'ouverture et l'arrêt. */
    readonly gestureId: string | null,
  ) {}

  durableFact(): DurableFact {
    return {
      type: this.type,
      key:
        this.gestureId === null
          ? `${this.type}:${this.basketId}`
          : `${this.type}:${this.basketId}:${this.gestureId}`,
      // Le site à plat, sous les noms d'un geste de site : la purge du
      // scénario de dev retrouve ces faits par `siteCompanyId`.
      payload: {
        basketId: this.basketId,
        buyerUserId: this.buyerUserId,
        cadence: this.cadence,
        siteCompanyId: this.site?.companyId ?? null,
        siteName: this.site?.name ?? null,
        principalCompanyId: this.site?.principalCompanyId ?? null,
        gestureId: this.gestureId,
      },
    };
  }

  /**
   * Relit le contrat côté abonné. Une charge hors forme est une faute
   * d'émetteur : la livraison échoue, est reprise, puis reste en message mort.
   *
   * @throws {RecurringBasketFactPayloadError}
   */
  static fromDelivery(delivery: {
    readonly type: string;
    readonly payload: Readonly<Record<string, unknown>>;
  }): RecurringBasketFact {
    const { basketId, buyerUserId, cadence, gestureId } = delivery.payload;
    const type = BASKET_FACT_TYPES.find((known) => known === delivery.type);
    const readSite = siteOf(delivery.payload);
    if (
      type === undefined ||
      !isText(basketId) ||
      !isText(buyerUserId) ||
      !isText(cadence) ||
      readSite === undefined ||
      !(gestureId === null || isText(gestureId))
    ) {
      throw new RecurringBasketFactPayloadError(delivery.type);
    }
    return new RecurringBasketFact(type, basketId, buyerUserId, cadence, readSite, gestureId);
  }
}

const BASKET_FACT_TYPES: readonly RecurringBasketFactType[] = [
  RECURRING_BASKET_OPENED,
  RECURRING_BASKET_PAUSED,
  RECURRING_BASKET_RESUMED,
  RECURRING_BASKET_STOPPED,
  RECURRING_BASKET_OCCURRENCE_CHANGED,
];

/** Le site relu ; `undefined` si la charge est hors forme. */
function siteOf(payload: Readonly<Record<string, unknown>>): BasketFactSite | null | undefined {
  const { siteCompanyId, siteName, principalCompanyId } = payload;
  if (siteCompanyId === null && siteName === null && principalCompanyId === null) {
    return null;
  }
  if (!isText(siteCompanyId) || !isText(siteName) || !isTextOrNull(principalCompanyId)) {
    return undefined;
  }
  return { companyId: siteCompanyId, name: siteName, principalCompanyId };
}

function isTextOrNull(value: unknown): value is string | null {
  return value === null || isText(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Un fait de panier récurrent illisible : ses abonnés n'ont rien fait, le message reste visible. */
export class RecurringBasketFactPayloadError extends TechnicalError {
  constructor(type: string) {
    super(
      "recurring.basket_fact.payload_invalid",
      `Un fait « ${type} » d'un panier récurrent est illisible : ni l'avis au principal ni la ` +
        "croissance ne l'ont pris en compte. Le geste lui-même est bien enregistré. Le message " +
        "reste dans la boîte d'envoi ; corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
