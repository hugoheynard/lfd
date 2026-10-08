import type {
  DeliveryLoadingPlanFloorView,
  DeliveryLoadingPlanPlacementView,
  DeliveryLoadingPlanView,
} from "@lfd/contracts";

import type { LoadingRoundRow } from "../domain/ports/delivery-loading.reader.js";
import type { StackPlacement } from "../domain/services/floor/place-stacks.js";
import type { LoadingPlan, PlanBinType, PlanStop } from "../domain/services/loading-plan.js";
import { MM_PER_CM } from "../domain/value-objects/bin-type-dimensions.js";
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
      bins: step.bins.map(({ bin, reference, stackIndex, behind }) => ({
        binId: bin.id,
        code: bin.code,
        reference,
        binTypeName: bin.binType.name,
        half: bin.half,
        sharedWithReference: bin.partner?.reference ?? null,
        isotherm: bin.binType.isotherm,
        stackIndex,
        behind,
      })),
    })),
    stacks: plan.stacks.map((stack) => ({
      stackIndex: stack.stackIndex,
      binTypeName: stack.binType.name,
      binTypeHeightCm: stack.binType.outerHeightMm / MM_PER_CM,
      height: stack.height,
      maxStack: stack.binType.maxStack,
      stopPositions: stack.stopPositions,
      placement: placementView(stack.placement),
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

/**
 * Le plan pose en millimètres (un type de bac s'y mesure) ; la vue dessine
 * dans le repère du plancher, en centimètres — une décimale au plus.
 */
function placementView(placement: StackPlacement | null): DeliveryLoadingPlanPlacementView | null {
  if (placement === null) {
    return null;
  }
  if (placement.kind !== "floor") {
    return { kind: placement.kind };
  }
  return {
    kind: "floor",
    row: placement.row,
    xCm: placement.xMm / MM_PER_CM,
    yCm: placement.yMm / MM_PER_CM,
    depthCm: placement.depthMm / MM_PER_CM,
    widthCm: placement.widthMm / MM_PER_CM,
    orientation: placement.orientation,
    // Absent au sol : le contrat le garde facultatif pour les écrans d'avant G5b.
    ...(placement.overArch === null ? {} : { overArch: placement.overArch }),
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
