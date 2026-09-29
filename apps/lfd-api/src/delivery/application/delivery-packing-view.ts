import type {
  BinTypeView,
  DeliveryPackingBinView,
  DeliveryPackingLineView,
  DeliveryPackingShareCandidateView,
  DeliveryPackingUnplacedView,
} from "@lfd/contracts";

import type { DeliveryOrderFacts } from "../channels/commerce/index.js";
import type {
  PackedBins,
  PackingBinType,
  UnplacedItem,
} from "../domain/services/propose-packing.js";
import type { ShareChoice } from "../domain/services/share-candidate.js";

/** Le remplissage se lit au centième : au-delà, c'est du bruit de fractions. */
const FILL_PRECISION = 100;

/** Un type EN SERVICE tel que le colisage le compare : volume intérieur, en cm³. */
export function packingTypeOf(type: BinTypeView): PackingBinType {
  const { lengthCm, widthCm, heightCm } = type.inner;
  return {
    id: type.id,
    volume: lengthCm * widthCm * heightCm,
    isotherm: type.isotherm,
    divisible: type.divisible,
  };
}

export function packingBinView(
  entry: PackedBins,
  types: ReadonlyMap<string, BinTypeView>,
): DeliveryPackingBinView {
  const type = types.get(entry.binTypeId);
  return {
    binTypeId: entry.binTypeId,
    binTypeName: type?.name ?? entry.binTypeId,
    isotherm: type?.isotherm ?? false,
    cold: entry.cold,
    whole: entry.whole,
    half: entry.half,
    fill: Math.round(entry.lastFill * FILL_PRECISION) / FILL_PRECISION,
    content: entry.content.map(({ sku, quantity }) => ({ sku, quantity })),
  };
}

export function unplacedView(
  item: UnplacedItem,
  lines: readonly DeliveryPackingLineView[],
): DeliveryPackingUnplacedView {
  return {
    sku: item.sku,
    name: lines.find((line) => line.sku === item.sku)?.name ?? item.sku,
    quantity: item.quantity,
    reason: item.reason,
  };
}

export function shareCandidateView(
  choice: ShareChoice,
  partner: DeliveryOrderFacts | undefined,
  types: ReadonlyMap<string, BinTypeView>,
): DeliveryPackingShareCandidateView {
  return {
    partnerOrderId: choice.half.orderId,
    partnerReference: partner?.reference ?? choice.half.orderId,
    partnerBinId: choice.half.binId,
    binTypeId: choice.half.binTypeId,
    binTypeName: types.get(choice.half.binTypeId)?.name ?? choice.half.binTypeId,
    replacesBinIndex: choice.replacesBinIndex,
  };
}
