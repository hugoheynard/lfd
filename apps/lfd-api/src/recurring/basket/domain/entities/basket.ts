import type {
  BillingAddressPayload,
  FulfillmentMethod,
  FulfillmentWindow,
  Recurrence,
  SubscriptionStatus,
} from "@lfd/contracts";

import {
  EmptySubscriptionError,
  InvalidDateRangeError,
  InvalidRoutingError,
  SubscriptionAlreadyActiveError,
  SubscriptionAlreadyPausedError,
  SubscriptionCancelledError,
} from "../errors/basket-errors.js";
import { calendarDays } from "../services/occurrence-calendar.js";
import type { IsoDate } from "../value-objects/iso-date.js";
import type { BasketLine } from "../value-objects/basket-line.js";
import {
  type AnnouncedSalesTerms,
  type BasketSalesTermsVersion,
  type PublishedSalesTerms,
  SALES_TERMS_NOTICE_DAYS,
} from "./basket-sales-terms.js";

/**
 * **Le cycle de vie** d'un panier : les deux états que le client voit, et
 * l'arrêt. Un panier arrêté reste en base (pas de DELETE physique) mais ne se
 * lit plus et ne se mute plus.
 */
export type BasketLifecycle = SubscriptionStatus | "cancelled";

/** Le statut d'un panier arrêté, tel qu'il est écrit en base. */
export const CANCELLED_BASKET = "cancelled" satisfies BasketLifecycle;

/** Acheminement figé du panier : livraison (adresse libre) OU retrait (point), et son créneau. */
export interface BasketRouting {
  readonly method: FulfillmentMethod;
  readonly deliveryAddress: BillingAddressPayload | null;
  readonly pickupAddressId: string | null;
  readonly window: FulfillmentWindow;
}

/** Ce qu'il faut pour **ouvrir** un panier. */
export interface OpenBasketInput {
  readonly id: string;
  readonly buyerUserId: string;
  /** La société de l'espace, `null` en perso — figée à l'ouverture. */
  readonly companyId: string | null;
  readonly fromOrderId: string | null;
  readonly cadence: Recurrence;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate | null;
  readonly routing: BasketRouting;
  readonly note: string;
  readonly lines: readonly BasketLine[];
  /** La version des CGV acceptée à l'ouverture — obligatoire. */
  readonly salesTerms: BasketSalesTermsVersion;
}

/** Ce qu'il faut pour **reconstituer** un panier persisté. */
export interface ReconstituteBasketInput extends OpenBasketInput {
  readonly status: BasketLifecycle;
  readonly nextSalesTerms: AnnouncedSalesTerms | null;
  readonly plannedUntil: IsoDate | null;
}

/**
 * Ce qu'un panier **décide** : la cadence, la période, l'acheminement, les
 * lignes. Ni l'adresse — une coordonnée —, ni la note — du texte libre :
 * c'est la forme que le journal en garde.
 */
export interface BasketDecision {
  readonly recurrence: Recurrence;
  readonly status: SubscriptionStatus;
  /** `AAAA-MM-JJ` : un jour, jamais un instant. */
  readonly startDate: string;
  readonly endDate: string | null;
  readonly fulfillmentMethod: FulfillmentMethod;
  readonly pickupAddressId: string | null;
  readonly lines: readonly { readonly sku: string; readonly quantity: number }[];
}

/**
 * **Panier récurrent** (agrégat racine) : le gabarit d'une commande qui se
 * répète. `open()` fige l'intention — lignes, période, acheminement, créneau
 * et CGV acceptées ; `pause()`, `resume()` et `cancel()` arbitrent l'état et
 * refusent une transition illégale. Les échéances sont des entités à part
 * (`occurrence/`), que le panier sait dater (`serviceDaysBetween`).
 */
export class Basket {
  private constructor(
    readonly id: string,
    readonly buyerUserId: string,
    readonly companyId: string | null,
    readonly fromOrderId: string | null,
    readonly cadence: Recurrence,
    private status: BasketLifecycle,
    readonly startDate: IsoDate,
    readonly endDate: IsoDate | null,
    readonly routing: BasketRouting,
    readonly note: string,
    readonly lines: readonly BasketLine[],
    private accepted: BasketSalesTermsVersion,
    private announced: AnnouncedSalesTerms | null,
    private planned: IsoDate | null,
  ) {}

  /**
   * Ouvre un panier neuf (sort **actif**).
   *
   * @throws {EmptySubscriptionError} aucune ligne.
   * @throws {InvalidDateRangeError} la fin précède le début.
   * @throws {InvalidRoutingError} une livraison sans adresse.
   */
  static open(input: OpenBasketInput): Basket {
    if (input.lines.length === 0) {
      throw new EmptySubscriptionError();
    }
    if (input.endDate !== null && input.endDate.isBefore(input.startDate)) {
      throw new InvalidDateRangeError(input.startDate.toString(), input.endDate.toString());
    }
    return Basket.reconstitute({
      ...input,
      routing: normalizeRouting(input.routing),
      status: "active",
      nextSalesTerms: null,
      plannedUntil: null,
    });
  }

  /** Reconstitue un panier depuis la base (déjà valide : les règles d'ouverture ne se rejouent pas). */
  static reconstitute(input: ReconstituteBasketInput): Basket {
    return new Basket(
      input.id,
      input.buyerUserId,
      input.companyId,
      input.fromOrderId,
      input.cadence,
      input.status,
      input.startDate,
      input.endDate,
      input.routing,
      input.note,
      input.lines,
      input.salesTerms,
      input.nextSalesTerms,
      input.plannedUntil,
    );
  }

  /** Met en pause — refuse si déjà en pause ou arrêté. */
  pause(): void {
    if (this.liveStatus() === "paused") {
      throw new SubscriptionAlreadyPausedError();
    }
    this.status = "paused";
  }

  /** Reprend — refuse si déjà actif ou arrêté. */
  resume(): void {
    if (this.liveStatus() === "active") {
      throw new SubscriptionAlreadyActiveError();
    }
    this.status = "active";
  }

  /**
   * **Arrête** le panier, sans retour : un client qui veut reprendre ouvre un
   * nouveau panier.
   *
   * @throws {SubscriptionCancelledError} le panier est déjà arrêté.
   */
  cancel(): void {
    this.liveStatus();
    this.status = CANCELLED_BASKET;
  }

  /**
   * L'état que le client voit.
   *
   * @throws {SubscriptionCancelledError} le panier est arrêté.
   */
  get currentStatus(): SubscriptionStatus {
    return this.liveStatus();
  }

  /** L'état tel qu'il s'écrit, arrêt compris. */
  get lifecycle(): BasketLifecycle {
    return this.status;
  }

  /**
   * **Servi par le balayage** : actif, et d'une société. Un panier sans
   * société reste lisible et gérable, mais aucune échéance ne lui est créée.
   */
  get isServed(): boolean {
    return this.status === "active" && this.companyId !== null;
  }

  /** La version des CGV que le panier applique aujourd'hui, hors annonce. */
  get salesTerms(): BasketSalesTermsVersion {
    return this.accepted;
  }

  /** La version annoncée et sa date d'effet, `null` sans annonce en cours. */
  get nextSalesTerms(): AnnouncedSalesTerms | null {
    return this.announced;
  }

  /**
   * **Une nouvelle version des CGV est publiée** (plan § 7) : le panier la
   * note, avec sa date d'effet — le jour de l'envoi de l'e-mail + 30 jours.
   * Une annonce déjà entrée en vigueur à ce jour devient la version
   * appliquée ; une annonce encore en préavis est remplacée par la nouvelle,
   * qui repart pour 30 jours.
   *
   * Rend faux, sans rien changer, quand la version n'est pas plus récente que
   * celle que le panier applique ou annonce déjà : un rejeu n'annonce rien,
   * et l'e-mail ne repart pas.
   *
   * @throws {SubscriptionCancelledError} le panier est arrêté.
   */
  announceSalesTerms(published: PublishedSalesTerms, sentOn: IsoDate): boolean {
    this.liveStatus();
    const applied = this.salesTermsOn(sentOn);
    if (published.revision <= Math.max(this.announced?.revision ?? 0, applied.revision)) {
      return false;
    }
    this.accepted = applied;
    this.announced = {
      revision: published.revision,
      fileId: published.fileId,
      effectiveOn: sentOn.plusDays(SALES_TERMS_NOTICE_DAYS),
    };
    return true;
  }

  /** Le dernier jour jusqu'où les échéances sont créées, `null` avant la première création. */
  get plannedUntil(): IsoDate | null {
    return this.planned;
  }

  /** Les jours que le panier vise entre deux jours, bornes comprises. */
  serviceDaysBetween(from: IsoDate, to: IsoDate): readonly IsoDate[] {
    return calendarDays(
      { cadence: this.cadence, startDate: this.startDate, endDate: this.endDate },
      from,
      to,
    );
  }

  /** Avance la création à l'avance jusqu'à `until` ; elle ne recule jamais. */
  plannedThrough(until: IsoDate): void {
    if (this.planned === null || until.isAfter(this.planned)) {
      this.planned = until;
    }
  }

  /**
   * **La version des CGV que le panier applique à un jour de service** (plan
   * § 7) : la version annoncée à partir de sa date d'effet, l'actuelle avant.
   * C'est elle, et non celle en vigueur à la passation, que la commande fige.
   */
  salesTermsOn(serviceDay: IsoDate): BasketSalesTermsVersion {
    const next = this.announced;
    if (next === null || serviceDay.isBefore(next.effectiveOn)) {
      return this.accepted;
    }
    return { key: this.accepted.key, revision: next.revision, fileId: next.fileId };
  }

  /** Ce que le panier décide, sans coordonnée ni texte libre. */
  decision(): BasketDecision {
    return {
      recurrence: this.cadence,
      status: this.liveStatus(),
      startDate: this.startDate.toString(),
      endDate: this.endDate === null ? null : this.endDate.toString(),
      fulfillmentMethod: this.routing.method,
      pickupAddressId: this.routing.pickupAddressId,
      lines: this.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
    };
  }

  private liveStatus(): SubscriptionStatus {
    if (this.status === CANCELLED_BASKET) {
      throw new SubscriptionCancelledError();
    }
    return this.status;
  }
}

/** Livraison ⇒ adresse requise, pas de point ; retrait ⇒ pas d'adresse. Coupe le résidu. */
function normalizeRouting(routing: BasketRouting): BasketRouting {
  if (routing.method === "delivery") {
    if (routing.deliveryAddress === null) {
      throw new InvalidRoutingError("Une livraison exige une adresse.");
    }
    return { ...routing, pickupAddressId: null };
  }
  return { ...routing, deliveryAddress: null };
}
