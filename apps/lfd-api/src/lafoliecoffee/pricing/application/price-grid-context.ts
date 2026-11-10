import { instantToLocal, localToInstant, type PriceGridQuestion } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { Clock } from "../../../platform/time/clock.js";
import {
  PRO_ANONYMOUS_VIEWER,
  PUBLIC_VIEWER,
  pricingCompanyOf,
  viewerAudience,
  type CatalogViewer,
} from "../../catalog/domain/catalog-viewer.js";
import type { RealLotBuyer, TypicalBuyer } from "../../promotions/domain/lot-buyer.js";
import type { FulfillmentFact } from "../../promotions/domain/promotion-targeting.js";
import {
  PriceGridCompanyNotFoundError,
  PriceGridDatedPublicError,
  PriceGridInvalidDayError,
  PriceGridPickupNotFoundError,
  PriceGridZoneNotFoundError,
} from "../domain/errors/price-grid-errors.js";
import { PricedCompanyNamer } from "../domain/ports/priced-company-namer.js";
import { PriceGridFulfillmentNamer } from "../domain/ports/price-grid-fulfillment.namer.js";
import { PriceGridViewerReader } from "../domain/ports/price-grid-viewer.reader.js";
import type { PriceGridBasis } from "../domain/price-grid-row.js";
import type { PriceLens } from "../domain/price-lens.js";
import { priceGridTypicalBuyer } from "./price-grid-typical-buyer.js";

/** Minuit, heure de Paris : un jour choisi se lit à son ouverture. */
const DAY_OPENING = "00:00";

/** Les limites d'un pro type, que l'en-tête du fichier écrit (§ 8.6). */
const TYPICAL_LIMITS =
  "Pro type, aucune société : hors conditions négociées, hors remises réservées à une " +
  "société et ses sites, hors articles réservés, hors remises jugées au créneau.";

/** Ce que les deux pros types ont en commun, et ce qui les sépare (§ 8.5). */
const TYPICAL_SAME_PRICES =
  "Pros (société active) et pros en cours d'inscription : mêmes prix, promotions " +
  "différentes — chacun ne reçoit que celles qui visent sa clientèle.";

/** La lentille, dite (§ 8.7). */
const LENS_REMARKS: Readonly<Record<"typical" | "company", string>> = {
  typical: "Projection : le prix d'un pro type, sans historique ni engagement.",
  company: "Prix réel de cette société : sa mercuriale, ses conditions et ses engagements compris.",
};

/**
 * L'acheteur de la grille : un pro type, ou un acheteur réel (une société, ou
 * un particulier par sa porte d'entrée). Le MÊME pour la porte du prix, pour
 * la liste des promotions de ligne et pour les faits du panier.
 */
export type PriceGridBuyer =
  TypicalBuyer | (RealLotBuyer & { readonly buyerKind: "guest" | "registered" });

/** La question d'une grille, établie au serveur — jamais un fait reçu tel quel. */
export interface PriceGridContext {
  readonly buyer: PriceGridBuyer;
  /** Le lecteur du catalogue : il décide la gamme et le tarif (pro HT, public TTC). */
  readonly viewer: CatalogViewer;
  readonly basis: PriceGridBasis;
  /** `unproven` pour un pro type (une projection), `measured` sinon. */
  readonly lens: PriceLens;
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
    /** Ce que l'en-tête dit de ce public : ses limites, sa lentille. */
    readonly remarks: readonly string[];
  };
}

/** Ce que la question établit de l'acheteur, avant la date et l'acheminement. */
interface EstablishedBuyer {
  readonly buyer: PriceGridBuyer;
  readonly viewer: CatalogViewer;
  readonly lens: PriceLens;
  readonly label: string;
  readonly remarks: readonly string[];
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
    private readonly viewers: PriceGridViewerReader,
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
    const basis = viewerAudience(buyer.viewer) === "pro" ? "ht" : "ttc";
    const now = this.clock.now();
    const today = instantToLocal(now).day;
    const day = question.day ?? today;
    // Aujourd'hui se dit par l'ABSENCE d'instant : minuit serait une relecture,
    // et rescellerait l'article à l'historique (`architecture-la-porte-du-prix.md`, § 1).
    const at = day === today ? undefined : this.instantOf(day);
    const replay = at !== undefined && at.getTime() < now.getTime();
    if (replay && basis === "ttc") {
      throw new PriceGridDatedPublicError(frenchDay(day));
    }
    return {
      buyer: buyer.buyer,
      viewer: buyer.viewer,
      basis,
      lens: buyer.lens,
      at,
      judgedAt: at ?? now,
      day,
      replay,
      fulfillment: fulfillment.fact,
      labels: {
        audience: buyer.label,
        day: day === today ? `${frenchDay(day)} (aujourd'hui)` : frenchDay(day),
        fulfillment: fulfillment.label,
        remarks: buyer.remarks,
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

  private async buyerOf(audience: PriceGridQuestion["audience"]): Promise<EstablishedBuyer> {
    switch (audience.kind) {
      case "pro_active":
        return typicalOf(audience.kind, "Pros (société active)");
      case "pro_pending":
        return typicalOf(audience.kind, "Pros en cours d'inscription");
      case "individuals_registered":
        return individualsOf("registered", "Particuliers inscrits");
      case "individuals_guest":
        return individualsOf("guest", "Particuliers sans compte");
      case "company":
        return this.companyOf(audience.companyId);
    }
  }

  /**
   * Une société précise, servie comme la vitrine la sert. La société des
   * faits est celle que la porte du prix reçoit (`pricingCompanyOf`) — la
   * même pour l'offre de ligne et pour les faits du panier (§ 8).
   */
  private async companyOf(companyId: string): Promise<EstablishedBuyer> {
    const name = await this.companies.nameOf(companyId);
    if (name === null) {
      throw new PriceGridCompanyNotFoundError(companyId);
    }
    const viewer = await this.viewers.viewerOf(companyId);
    return {
      buyer: { kind: "real", companyId: pricingCompanyOf(viewer), buyerKind: "registered" },
      viewer,
      lens: "measured",
      label: name,
      remarks: [LENS_REMARKS.company],
    };
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

/** Un pro type : le lecteur pro anonyme — tarif pro HT, sans mercuriale ni article réservé. */
function typicalOf(clientele: "pro_active" | "pro_pending", label: string): EstablishedBuyer {
  return {
    buyer: priceGridTypicalBuyer(clientele),
    viewer: PRO_ANONYMOUS_VIEWER,
    lens: "unproven",
    label,
    remarks: [TYPICAL_LIMITS, TYPICAL_SAME_PRICES, LENS_REMARKS.typical],
  };
}

/** Des particuliers : leur vrai `buyerKind`, sans société (§ 8.5). */
function individualsOf(buyerKind: "guest" | "registered", label: string): EstablishedBuyer {
  return {
    buyer: { kind: "real", companyId: null, buyerKind },
    viewer: PUBLIC_VIEWER,
    lens: "measured",
    label,
    remarks: [],
  };
}
