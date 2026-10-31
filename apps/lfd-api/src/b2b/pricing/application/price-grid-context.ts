import { instantToLocal, localToInstant, type PriceGridQuestion } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { Clock } from "../../../platform/time/clock.js";
import type {
  FulfillmentFact,
  PromotionBuyerKind,
} from "../../promotions/domain/promotion-targeting.js";
import {
  PriceGridCompanyNotFoundError,
  PriceGridDatedPublicError,
  PriceGridInvalidDayError,
  PriceGridPickupNotFoundError,
  PriceGridZoneNotFoundError,
} from "../domain/errors/price-grid-errors.js";
import { PricedCompanyNamer } from "../domain/ports/priced-company-namer.js";
import { PriceGridFulfillmentNamer } from "../domain/ports/price-grid-fulfillment.namer.js";
import {
  PriceGridServingReader,
  type PriceGridServing,
} from "../domain/ports/price-grid-serving.reader.js";

/** Minuit, heure de Paris : un jour choisi se lit à son ouverture. */
const DAY_OPENING = "00:00";

/** La question d'une grille, établie au serveur — jamais un fait reçu tel quel. */
export interface PriceGridContext {
  /** La société des faits du ciblage ; `null` = un particulier. */
  readonly companyId: string | null;
  readonly buyerKind: Exclude<PromotionBuyerKind, "unknown">;
  readonly serving: PriceGridServing;
  /** `undefined` = maintenant : la porte lit l'horloge elle-même (`LotRequest.at`). */
  readonly at: Date | undefined;
  /** L'instant auquel les promotions se jugent — `at`, ou l'horloge. */
  readonly judgedAt: Date;
  /** Le jour de la grille, `AAAA-MM-JJ` à Paris — aujourd'hui quand rien n'est choisi. */
  readonly day: string;
  /** Une relecture d'un jour passé : les promotions archivées depuis y reviennent. */
  readonly replay: boolean;
  readonly fulfillment: FulfillmentFact;
  readonly labels: {
    readonly audience: string;
    readonly day: string;
    readonly fulfillment: string;
  };
}

/** Un jour `AAAA-MM-JJ` lu à la française. */
function frenchDay(day: string): string {
  const [year, month, date] = day.split("-");
  return `${date ?? ""}/${month ?? ""}/${year ?? ""}`;
}

/**
 * **Qui, quand, comment** — commun aux deux lectures de la grille
 * (`plan-export-grille-de-prix.md`, § 2), pour que la liste des promotions et
 * le fichier posent exactement la même question.
 */
@Injectable()
export class PriceGridContexts {
  constructor(
    private readonly clock: Clock,
    private readonly companies: PricedCompanyNamer,
    private readonly places: PriceGridFulfillmentNamer,
    private readonly servings: PriceGridServingReader,
  ) {}

  /**
   * @throws {PriceGridCompanyNotFoundError} la société n'existe pas.
   * @throws {PriceGridPickupNotFoundError} le point n'existe pas.
   * @throws {PriceGridZoneNotFoundError} la zone n'existe pas.
   * @throws {PriceGridInvalidDayError} le jour n'existe pas.
   * @throws {PriceGridDatedPublicError} un jour passé pour un public servi TTC.
   */
  async contextOf(question: PriceGridQuestion): Promise<PriceGridContext> {
    const [buyer, fulfillment] = await Promise.all([
      this.buyerOf(question.audience),
      this.fulfillmentOf(question.fulfillment),
    ]);
    const serving = await this.servings.servingOf(buyer.companyId);
    const now = this.clock.now();
    const today = instantToLocal(now).day;
    const day = question.day ?? today;
    // Aujourd'hui se dit par l'ABSENCE d'instant : minuit serait une relecture,
    // et rescellerait l'article à l'historique (`architecture-la-porte-du-prix.md`, § 1).
    const at = day === today ? undefined : this.instantOf(day);
    const replay = at !== undefined && at.getTime() < now.getTime();
    if (replay && serving.basis === "ttc") {
      throw new PriceGridDatedPublicError(frenchDay(day));
    }
    return {
      ...buyer,
      serving,
      at,
      judgedAt: at ?? now,
      day,
      replay,
      fulfillment: fulfillment.fact,
      labels: {
        audience: buyer.label,
        day: day === today ? `${frenchDay(day)} (aujourd'hui)` : frenchDay(day),
        fulfillment: fulfillment.label,
      },
    };
  }

  private instantOf(day: string): Date {
    const instant = localToInstant(day, DAY_OPENING);
    if (instant === null) {
      throw new PriceGridInvalidDayError(day);
    }
    return instant;
  }

  private async buyerOf(audience: PriceGridQuestion["audience"]): Promise<{
    readonly companyId: string | null;
    readonly buyerKind: PriceGridContext["buyerKind"];
    readonly label: string;
  }> {
    switch (audience.kind) {
      case "individuals_registered":
        return { companyId: null, buyerKind: "registered", label: "Particuliers inscrits" };
      case "individuals_guest":
        return { companyId: null, buyerKind: "guest", label: "Particuliers sans compte" };
      case "company": {
        const name = await this.companies.nameOf(audience.companyId);
        if (name === null) {
          throw new PriceGridCompanyNotFoundError(audience.companyId);
        }
        return { companyId: audience.companyId, buyerKind: "registered", label: name };
      }
    }
  }

  private async fulfillmentOf(
    fulfillment: PriceGridQuestion["fulfillment"],
  ): Promise<{ readonly fact: FulfillmentFact; readonly label: string }> {
    if (fulfillment.method === "pickup") {
      const name = await this.places.pickupNameOf(fulfillment.pickupId);
      if (name === null) {
        throw new PriceGridPickupNotFoundError(fulfillment.pickupId);
      }
      return {
        fact: { method: "pickup", pickupId: fulfillment.pickupId },
        label: `Retrait — ${name}`,
      };
    }
    const name = await this.places.zoneNameOf(fulfillment.zoneId);
    if (name === null) {
      throw new PriceGridZoneNotFoundError(fulfillment.zoneId);
    }
    return {
      fact: { method: "delivery", zoneId: fulfillment.zoneId },
      label: `Livraison — zone ${name}`,
    };
  }
}
