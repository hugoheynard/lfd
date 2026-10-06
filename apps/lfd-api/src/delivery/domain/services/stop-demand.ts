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
 *    dit combien il en faudra, pour TOUTES ses lignes ;
 * 3. `defaulted` : sinon, le contenant par défaut des réglages (2026-10-06).
 *    Une commande en partie estimable porte sa part estimée PLUS le défaut,
 *    qui tient lieu de ce qu'on ne sait pas (`withEstimate`) : jamais moins
 *    que la part connue, jamais moins que le défaut ;
 * 4. `unknown` : sinon on ne sait pas — et on ne l'invente pas. La commande
 *    est placée SANS contrôle de place (décision du 2026-10-06 : sans
 *    contenances réglées, le refus laissait presque tout à répartir avant le
 *    colisage), et sa tournée est dite « place non vérifiée ». Une demande
 *    inventée, elle, la ferait passer pour vérifiée — le défaut n'en est pas
 *    une : il est RÉGLÉ par le bureau, et l'écran le dit « par défaut ».
 */
export type StopDemand =
  | { readonly kind: "declared"; readonly bins: readonly PlanBin[] }
  | { readonly kind: "estimated"; readonly bins: readonly PlanBin[] }
  | {
      readonly kind: "defaulted";
      readonly bins: readonly PlanBin[];
      /** Une part a été estimée par les contenances ; le défaut couvre le reste. */
      readonly withEstimate: boolean;
    }
  | { readonly kind: "unknown" };

/** Le contenant par défaut, son type résolu : `count` bacs entiers de `binType`. */
export interface DefaultStopBins {
  readonly binType: PlanBinType;
  readonly count: number;
}

/** Ce qu'il faut pour juger la demande d'une commande. Pur. */
export interface StopDemandInput {
  readonly orderId: string;
  readonly declared: readonly DeclaredStopBin[];
  /** La proposition de colisage de ses lignes, ou `null` : aucune ligne lue. */
  readonly estimate: PackingProposal | null;
  /** Les types du catalogue, archivés compris (un bac déclaré garde le sien). */
  readonly binTypes: ReadonlyMap<string, PlanBinType>;
  /** Le contenant par défaut des réglages, ou `null` : pas de réglage. */
  readonly defaultBins: DefaultStopBins | null;
}

const UNKNOWN: StopDemand = { kind: "unknown" };

/**
 * La demande en bacs d'une commande (CA4). Une estimation porte une moitié
 * comme un bac ENTIER : on ne sait pas avec qui elle serait partagée, et on
 * ne promet pas une place qu'on n'a pas (même règle que `loadingVolumeOf`).
 * Un type introuvable rend l'estimation inutilisable plutôt que de l'ignorer.
 */
export function stopDemandOf(input: StopDemandInput): StopDemand {
  if (input.declared.length > 0) {
    return declaredDemand(input);
  }
  const estimated = estimatedBins(input);
  const complete = input.estimate !== null && input.estimate.unplaced.length === 0;
  if (estimated !== null && estimated.length > 0 && complete) {
    return { kind: "estimated", bins: estimated };
  }
  if (input.defaultBins === null) {
    return UNKNOWN;
  }
  const known = estimated ?? [];
  const bins = [...known];
  for (let index = 0; index < input.defaultBins.count; index += 1) {
    const id = `${input.orderId}:default:${String(index + 1)}`;
    bins.push(planBinOf(id, input.defaultBins.binType, null, null));
  }
  return { kind: "defaulted", bins, withEstimate: known.length > 0 };
}

/** Les bacs que l'estimation propose, ou `null` : pas d'estimation, ou un type introuvable. */
function estimatedBins(input: StopDemandInput): PlanBin[] | null {
  if (input.estimate === null) {
    return null;
  }
  const bins: PlanBin[] = [];
  for (const entry of input.estimate.bins) {
    const binType = input.binTypes.get(entry.binTypeId);
    if (binType === undefined) {
      return null;
    }
    const count = entry.whole + (entry.half ? 1 : 0);
    for (let index = 0; index < count; index += 1) {
      const id = `${input.orderId}:${entry.binTypeId}:${String(bins.length + 1)}`;
      bins.push(planBinOf(id, binType, null, null));
    }
  }
  return bins;
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
