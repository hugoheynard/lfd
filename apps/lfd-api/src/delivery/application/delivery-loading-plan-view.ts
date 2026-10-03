import type { DeliveryLoadingPlanFloorView, DeliveryLoadingPlanView } from "@lfd/contracts";

import type { LoadingRoundRow } from "../domain/ports/delivery-loading.reader.js";
import type { LoadingPlan, PlanBinType, PlanStop } from "../domain/services/loading-plan.js";
import { TechnicalError } from "../../platform/shared/errors/app-error.js";
import { type BinContext, binToRedo, orderNamesOf } from "./delivery-loading-view.js";

/** Un bac dont le type n'a pas été relu : la clé étrangère l'aurait dû garantir. */
class LoadingPlanBinTypeMissingError extends TechnicalError {
  constructor(binTypeId: string) {
    super(
      "delivery.loading_plan_bin_type_missing",
      `Le type de bac ${binTypeId} d'un bac déclaré est introuvable : le plan de chargement ne peut pas être calculé. Signalez-le à l'équipe technique.`,
    );
  }
}

/** Les arrêts vivants d'une tournée, leurs bacs NON annulés, pour le cœur pur. */
export function planStopsOf(
  round: LoadingRoundRow,
  context: BinContext,
  binTypes: ReadonlyMap<string, PlanBinType>,
): readonly PlanStop[] {
  return round.stops.map((stop) => {
    const names = context.names.get(stop.orderId) ?? orderNamesOf(undefined);
    return {
      position: stop.position,
      orderId: stop.orderId,
      reference: names.reference,
      customerLabel: names.customerLabel,
      bins: stop.bins
        .filter((bin) => bin.voidedAt === null)
        .map((bin) => {
          const binType = binTypes.get(bin.binType.id);
          if (binType === undefined) {
            throw new LoadingPlanBinTypeMissingError(bin.binType.id);
          }
          return {
            id: bin.id,
            code: bin.code,
            binType,
            half: bin.half,
            physicalBinId: bin.physicalBinId,
            partner:
              bin.partner === null
                ? null
                : {
                    orderId: bin.partner.orderId,
                    reference: context.names.get(bin.partner.orderId)?.reference ?? "",
                  },
            toRedo: binToRedo(bin, context.places),
          };
        }),
    };
  });
}

export function loadingPlanView(
  round: LoadingRoundRow,
  plan: LoadingPlan,
): DeliveryLoadingPlanView {
  const { volume } = plan;
  return {
    roundId: round.id,
    vehicleName: round.vehicleName,
    order: plan.steps.map((step) => ({
      step: step.step,
      stopPosition: step.stop.position,
      reference: step.stop.reference,
      customerLabel: step.stop.customerLabel,
      bins: step.bins.map(({ bin, reference, stackIndex }) => ({
        binId: bin.id,
        code: bin.code,
        reference,
        binTypeName: bin.binType.name,
        half: bin.half,
        sharedWithReference: bin.partner?.reference ?? null,
        isotherm: bin.binType.isotherm,
        stackIndex,
      })),
    })),
    stacks: plan.stacks.map((stack) => ({
      stackIndex: stack.stackIndex,
      binTypeName: stack.binType.name,
      binTypeHeightCm: stack.binType.outerHeightCm,
      height: stack.height,
      maxStack: stack.binType.maxStack,
      stopPositions: stack.stopPositions,
      placement: stack.placement === null ? null : { ...stack.placement },
    })),
    floor: floorView(plan),
    volume: {
      dryLiters: volume.dryLiters,
      coldLiters: volume.coldLiters,
      dryCapacityLiters: volume.dryCapacityLiters,
      coldCapacityLiters: volume.coldCapacityLiters,
      dryOver: volume.dryOver,
      coldOver: volume.coldOver,
    },
    warnings: plan.warnings.map((warning) => ({ ...warning })),
  };
}

/** Le plancher à dessiner : ses cotes et ses passages (la hauteur ne se dessine pas de dessus). */
function floorView(plan: LoadingPlan): DeliveryLoadingPlanFloorView | null {
  const { floor } = plan;
  if (floor === null) {
    return null;
  }
  const arches = floor.wheelArches;
  return {
    lengthCm: floor.lengthCm,
    widthCm: floor.widthCm,
    wheelArches:
      arches === null
        ? null
        : {
            fromBackCm: arches.fromBackCm,
            lengthCm: arches.lengthCm,
            protrusionCm: arches.protrusionCm,
          },
  };
}
