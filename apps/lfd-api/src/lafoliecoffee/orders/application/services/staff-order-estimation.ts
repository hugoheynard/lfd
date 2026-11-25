import type {
  AdminOrderEstimateNotice,
  AdminOrderEstimatePayload,
  AdminOrderEstimateView,
  OrderQuoteCutoffView,
} from "@lfd/contracts";

import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";
import { withCatalogueSnapshot } from "../../../catalog/application/catalogue-snapshot-scope.js";
import type { Order } from "../../domain/entities/order.js";
import { OrderCompanyNotFoundError } from "../../domain/errors/order-errors.js";
import type { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import { isCounterEntry } from "../../domain/services/order-supply-rules.js";
import { amountsViewOf } from "../queries/estimate-amounts-view.js";
import type { OrderCutoffNotice } from "./order-cutoff-notice.service.js";
import type { DraftedOrder, DraftPolicy, OrderDrafting } from "./order-drafting.service.js";
import type { ShelfCircuit } from "./shelf-circuit.service.js";
import { prepareStaffOrder } from "./staff-order-preparation.js";
import { staffSettlementRefusal } from "./staff-settlement-refusal.js";

/** Ce que l'estimation lit, et rien d'autre. */
export interface StaffOrderEstimationPorts {
  readonly guard: OrderGuardReader;
  readonly drafting: OrderDrafting;
  readonly shelf: ShelfCircuit;
  readonly cutoffNotice: OrderCutoffNotice;
}

/**
 * **L'estimation de la saisie de l'équipe** : la commande que la passation
 * passerait, composée par la MÊME préparation ({@link prepareStaffOrder}) et
 * sous la MÊME politique, puis lue sans être écrite (plan
 * `documentation/commandes/passation/commande-passee-par-l-equipe.md`, § 8).
 * Partagée par l'estimation ordinaire et celle d'un reliquat.
 *
 * Elle s'arrête après la composition : ni vitrine ni journée tenues, ni
 * persistance, ni règlement, ni dérogation consommée, ni événement.
 *
 * Un refus de la composition revient comme `refusal`, avec les mots de la
 * passation ; seul le mur sur l'acheteur reste une erreur (404), comme à la
 * passation. Les deux refus que la passation lève APRÈS la composition — le
 * reste en vitrine et le crédit — sont jugés par les mêmes prédicats, sans
 * verrou, et rendus en `warnings`.
 */
export class StaffOrderEstimation {
  constructor(private readonly ports: StaffOrderEstimationPorts) {}

  /**
   * Le catalogue lu dans l'instantané (plan des matériaux du catalogue, M1b) :
   * l'estimation chiffre, la passation qui suit relit la base et fait foi.
   */
  estimate(
    staffUserId: string,
    payload: AdminOrderEstimatePayload,
    exceedItemLimits: boolean,
    policy: DraftPolicy,
  ): Promise<AdminOrderEstimateView> {
    return withCatalogueSnapshot(async () => {
      const drafted = await this.draftOrRefusal(staffUserId, payload, exceedItemLimits, policy);
      const cutoff = await this.cutoffOf(payload, exceedItemLimits);
      if (!("order" in drafted)) {
        return { amounts: null, cutoff, refusal: drafted, warnings: [] };
      }
      return {
        amounts: amountsViewOf(drafted.order.amounts(), drafted.order.offer),
        cutoff,
        refusal: null,
        warnings: await this.warningsOf(drafted.order, payload),
      };
    });
  }

  /** La composition, ou le refus qu'elle lèverait — le mur, lui, reste une erreur. */
  private async draftOrRefusal(
    staffUserId: string,
    payload: AdminOrderEstimatePayload,
    exceedItemLimits: boolean,
    policy: DraftPolicy,
  ): Promise<DraftedOrder | AdminOrderEstimateNotice> {
    try {
      return await prepareStaffOrder(
        { guard: this.ports.guard, drafting: this.ports.drafting },
        staffUserId,
        payload,
        "estimate",
        exceedItemLimits,
        policy,
      );
    } catch (error) {
      if (isCompositionRefusal(error)) {
        return { code: error.code, message: error.message };
      }
      throw error;
    }
  }

  /** Ce que la passation jugera sous verrou, jugé ici sans verrou. */
  private async warningsOf(
    order: Order,
    payload: AdminOrderEstimatePayload,
  ): Promise<readonly AdminOrderEstimateNotice[]> {
    const short = await this.ports.shelf.stockShortfallOf(order);
    const credit = await staffSettlementRefusal(
      { guard: this.ports.guard, shelf: this.ports.shelf },
      order,
      payload.settlement,
      payload.companyId,
      isCounterEntry(payload.entryOrigin, payload.entryShortcut),
    );
    return [short, credit].flatMap((warning) =>
      warning === null ? [] : [{ code: warning.code, message: warning.message }],
    );
  }

  /**
   * L'heure limite du jour visé, séparée sur la marque comme le devis (lot
   * L4), avec les limites de produit que la passation passerait : elle ne
   * refuse pas pour un motif manquant, l'écran le demande en les lisant.
   */
  private async cutoffOf(
    payload: AdminOrderEstimatePayload,
    exceedItemLimits: boolean,
  ): Promise<OrderQuoteCutoffView | null> {
    if (payload.requestedDeliveryDate === null) {
      return null;
    }
    return this.ports.cutoffNotice.forDay(
      payload.lines.map((line) => line.sku),
      payload.requestedDeliveryDate,
      payload.supply ?? "planned",
      exceedItemLimits,
    );
  }
}

/**
 * Un refus que la passation lèverait en composant : une règle du domaine ou
 * du métier. Le mur sur l'acheteur n'en est pas un — il reste le 404 de la
 * passation, pour ne rien dire d'une société à qui n'en est pas membre.
 */
function isCompositionRefusal(error: unknown): error is DomainError | BusinessError {
  if (error instanceof OrderCompanyNotFoundError) {
    return false;
  }
  return error instanceof DomainError || error instanceof BusinessError;
}
