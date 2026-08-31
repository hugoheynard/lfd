import type { ElasticityComparison, ItemElasticityView, VolumeWindowView } from "@lfd/contracts";

import { attainmentBp, isoRevenueRatioBp, requiredVolume } from "../domain/elasticity.js";
import type { WindowPair } from "../domain/elasticity-windows.js";
import type { VolumeWindow } from "../domain/ports/sku-volume.reader.js";

/** Les deux volumes mesurés pour une comparaison. */
export interface MeasuredPair {
  readonly windows: WindowPair;
  readonly baselineVolume: number;
  readonly observedVolume: number;
}

/**
 * **Le rapport prix / volume d'un article.**
 *
 * Pur : il reçoit des prix et des quantités déjà mesurées, et rend ce que
 * l'écran affiche. Aucun accès à la base — c'est ce qui permet d'éprouver les
 * cas qui comptent (aucune référence, article offert, recul insuffisant) en les
 * énumérant plutôt qu'en fabriquant un historique.
 */
export function itemElasticity(
  fromMillicents: number,
  toMillicents: number,
  measurements: { readonly sinceChange: MeasuredPair | null; readonly rolling: MeasuredPair },
): ItemElasticityView {
  const ratioBp = isoRevenueRatioBp(fromMillicents, toMillicents);
  return {
    fromMillicents,
    toMillicents,
    isoRevenueRatioBp: ratioBp,
    sinceChange:
      measurements.sinceChange === null ? null : comparison(measurements.sinceChange, ratioBp),
    rolling: comparison(measurements.rolling, ratioBp),
  };
}

/**
 * Une comparaison, objectif compris.
 *
 * L'objectif se calcule sur le volume **de référence** — celui d'avant. C'est
 * tout le raisonnement : « je vendais 400, j'ai baissé de 20 %, il m'en faut
 * 500 ». Le calculer sur le réalisé donnerait un objectif qui suit ce qu'on
 * fait, donc toujours atteint.
 */
function comparison(measured: MeasuredPair, ratioBp: number | null): ElasticityComparison {
  const target = requiredVolume(measured.baselineVolume, ratioBp);
  return {
    baseline: windowView(measured.windows.baseline, measured.windows.days),
    baselineVolume: measured.baselineVolume,
    observed: windowView(measured.windows.observed, measured.windows.days),
    observedVolume: measured.observedVolume,
    targetVolume: target,
    attainmentBp: attainmentBp(measured.observedVolume, target),
    conclusive: measured.windows.conclusive,
  };
}

function windowView(window: VolumeWindow, days: number): VolumeWindowView {
  return { from: window.from.toISOString(), to: window.to.toISOString(), days };
}
