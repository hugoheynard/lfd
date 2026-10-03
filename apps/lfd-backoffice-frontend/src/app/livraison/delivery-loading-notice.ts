import type { DeliveryLoadingPlanView, LoadDeliveryBinPayload } from '@lfd/contracts';

import { planBinKey } from './delivery-loading-plan';
import type { BinLocation, NextBin } from './delivery-loading-rows';

/**
 * **L'avis après un scan** — un seul à la fois, le dernier. Le plan suggère,
 * il n'impose pas : un bac hors de sa rangée est CHARGÉ, puis l'écran dit où
 * il va. Seul le serveur refuse, et sa phrase s'affiche telle quelle.
 */
export interface LoadingNotice {
  readonly variant: 'success' | 'info' | 'warning' | 'alert';
  /** La première ligne, en gras — `null` : la phrase suffit. */
  readonly title: string | null;
  readonly text: string;
  /** « Voir la rangée n », offert quand le bac va ailleurs. */
  readonly showRow: number | null;
}

/** Le bac du plan qu'un scan désigne, avec l'arrêt de sa commande — ou `null`. */
export function planBinOf(
  plan: Pick<DeliveryLoadingPlanView, 'order'>,
  payload: LoadDeliveryBinPayload,
): NextBin | null {
  const byReference = new Map(plan.order.map((step) => [step.reference, step]));
  for (const step of plan.order) {
    const bin = step.bins.find((candidate) =>
      'binId' in payload ? candidate.binId === payload.binId : candidate.code === payload.code,
    );
    if (bin !== undefined) {
      const owner = byReference.get(bin.reference) ?? step;
      return {
        key: planBinKey(bin),
        bin,
        stopPosition: owner.stopPosition,
        customerLabel: owner.customerLabel,
      };
    }
  }
  return null;
}

/** Le serveur a refusé : sa phrase, mot pour mot. */
export function refusalNotice(text: string): LoadingNotice {
  return { variant: 'alert', title: 'Refusé', text, showRow: null };
}

/** Un bac déjà dans le véhicule : rien n'est envoyé. */
export function alreadyLoadedNotice(code: string): LoadingNotice {
  return {
    variant: 'warning',
    title: `${code} est déjà chargé`,
    text: 'Rien à faire : passez au suivant.',
    showRow: null,
  };
}

/**
 * Un bac du plan, chargé. Hors de la rangée ouverte (`elsewhere`, la phrase
 * d'`outOfRowNotice`) : une aide, en info, avec de quoi aller voir sa rangée.
 * Sinon : le suivant.
 */
export function loadedBinNotice(
  loaded: NextBin,
  elsewhere: { readonly text: string; readonly location: BinLocation } | null,
  next: NextBin | null,
): LoadingNotice {
  const title = `${loaded.bin.code} chargé · arrêt ${String(loaded.stopPosition)}`;
  if (elsewhere !== null) {
    return { variant: 'info', title, text: elsewhere.text, showRow: elsewhere.location.row };
  }
  return {
    variant: 'success',
    title,
    text: next === null ? 'Tout est chargé.' : `Suivant : ${next.bin.code}.`,
    showRow: null,
  };
}
