import type { BinHalf } from "../value-objects/bin-declaration.js";
import type { PlanBin, PlanBinType } from "./loading-plan.js";
import type { PackingProposal } from "./propose-packing.js";

/** Un bac DÉCLARÉ et non annulé d'une commande, tel que la composition le lit. */
export interface DeclaredStopBin {
  readonly id: string;
  readonly binTypeId: string;
  readonly half: BinHalf | null;
  readonly physicalBinId: string | null;
}

/**
 * **Ce qu'une commande occupera dans le véhicule** (CA4) — dans cet ordre :
 *
 * 1. `declared` : les bacs déclarés au colisage font foi ;
 * 2. `estimated` : sinon, la proposition de colisage (lignes × contenances)
 *    dit combien il en faudra ;
 * 3. `unknown` : sinon on ne sait pas — et on ne l'invente pas. La commande
 *    reste à répartir, signalée : une demande inventée ferait passer une
 *    tournée pour chargeable sans que personne l'ait vérifié.
 */
export type StopDemand =
  | { readonly kind: "declared"; readonly bins: readonly PlanBin[] }
  | { readonly kind: "estimated"; readonly bins: readonly PlanBin[] }
  | { readonly kind: "unknown" };

/** Ce qu'il faut pour juger la demande d'une commande. Pur. */
export interface StopDemandInput {
  readonly orderId: string;
  readonly declared: readonly DeclaredStopBin[];
  /** La proposition de colisage de ses lignes, ou `null` : aucune ligne lue. */
  readonly estimate: PackingProposal | null;
  /** Les types du catalogue, archivés compris (un bac déclaré garde le sien). */
  readonly binTypes: ReadonlyMap<string, PlanBinType>;
}

const UNKNOWN: StopDemand = { kind: "unknown" };

/**
 * La demande en bacs d'une commande (CA4). Une estimation porte une moitié
 * comme un bac ENTIER : on ne sait pas avec qui elle serait partagée, et on
 * ne promet pas une place qu'on n'a pas (même règle que `loadingVolumeOf`).
 * Un type introuvable rend la demande inconnue plutôt que de l'ignorer.
 */
export function stopDemandOf(input: StopDemandInput): StopDemand {
  if (input.declared.length > 0) {
    return declaredDemand(input);
  }
  const estimate = input.estimate;
  if (estimate === null || estimate.unplaced.length > 0) {
    return UNKNOWN;
  }
  const bins: PlanBin[] = [];
  for (const entry of estimate.bins) {
    const binType = input.binTypes.get(entry.binTypeId);
    if (binType === undefined) {
      return UNKNOWN;
    }
    const count = entry.whole + (entry.half ? 1 : 0);
    for (let index = 0; index < count; index += 1) {
      const id = `${input.orderId}:${entry.binTypeId}:${String(bins.length + 1)}`;
      bins.push(planBinOf(id, binType, null, null));
    }
  }
  return bins.length === 0 ? UNKNOWN : { kind: "estimated", bins };
}

function declaredDemand(input: StopDemandInput): StopDemand {
  const bins: PlanBin[] = [];
  for (const bin of input.declared) {
    const binType = input.binTypes.get(bin.binTypeId);
    if (binType === undefined) {
      return UNKNOWN;
    }
    bins.push(planBinOf(bin.id, binType, bin.half, bin.physicalBinId));
  }
  return { kind: "declared", bins };
}

/**
 * Un bac pour le plan de chargement. Sans partenaire : la composition ne
 * range pas un bac partagé à l'étape du premier arrêt — deux moitiés d'un
 * même bac physique dans la même tournée n'y comptent qu'une fois
 * (`physicalKey`), et c'est ce qui compte pour la place.
 */
function planBinOf(
  id: string,
  binType: PlanBinType,
  half: BinHalf | null,
  physicalBinId: string | null,
): PlanBin {
  return { id, code: "", binType, half, physicalBinId, partner: null, toRedo: false };
}
