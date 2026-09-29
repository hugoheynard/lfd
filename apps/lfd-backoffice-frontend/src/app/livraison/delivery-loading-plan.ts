import type {
  DeliveryLoadingPlanBinView,
  DeliveryLoadingPlanStackView,
  DeliveryLoadingPlanStepView,
  DeliveryLoadingPlanVolumeView,
  DeliveryLoadingRoundView,
} from '@lfd/contracts';
import type { FoldMeterTone } from 'fold-ng';

import { halfLabel } from './delivery-loading';

/**
 * **Le plan de chargement, dit à l'écran** (`plan-preparation-de-tournee.md`,
 * lot 4 bis, L4b-C7, v2-5, tranche D). Des dérivations pures : le serveur
 * calcule le plan, l'écran le lit et le croise avec ce qui est déjà scanné.
 */

/** Au-delà de cette part de la capacité, la jauge passe en avertissement. */
const NEARLY_FULL_RATIO = 0.9;

/**
 * La clé d'un bac ou d'une moitié — les deux moitiés d'un bac partagé se
 * chargent chacune par leur QR, donc se cochent séparément.
 */
export function planBinKey(bin: Pick<DeliveryLoadingPlanBinView, 'binId' | 'half'>): string {
  return `${bin.binId}:${bin.half ?? 'whole'}`;
}

/** Les bacs (ou moitiés) déjà chargés dans la tournée, relus dans la vue du chargement. */
export function loadedBinKeys(round: Pick<DeliveryLoadingRoundView, 'stops'>): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const stop of round.stops) {
    for (const bin of stop.bins) {
      if (bin.loadedAt !== null) {
        keys.add(planBinKey(bin));
      }
    }
  }
  return keys;
}

/** Une étape est faite quand tous ses bacs sont chargés. Une étape sans bac l'est d'office. */
export function isStepLoaded(
  step: Pick<DeliveryLoadingPlanStepView, 'bins'>,
  loaded: ReadonlySet<string>,
): boolean {
  return step.bins.every((bin) => loaded.has(planBinKey(bin)));
}

/** L'étape à charger maintenant : la première pas entièrement chargée, ou `null` si tout l'est. */
export function currentStep(
  order: readonly DeliveryLoadingPlanStepView[],
  loaded: ReadonlySet<string>,
): number | null {
  return order.find((step) => !isStepLoaded(step, loaded))?.step ?? null;
}

/** « Charger d'abord », « Puis », « En dernier » — ce que l'étape est dans le camion. */
function stepLead(step: number, total: number): string {
  if (step === 1) {
    return 'Charger d’abord';
  }
  return step === total ? 'En dernier' : 'Puis';
}

/** « 2 × Bac M, 1 × Bac S ½ gauche » — les bacs d'une étape, groupés par nature. */
export function stepContentLabel(bins: readonly DeliveryLoadingPlanBinView[]): string {
  if (bins.length === 0) {
    return 'aucun bac';
  }
  const counts = new Map<string, number>();
  for (const bin of bins) {
    const kind = [bin.binTypeName, halfLabel(bin.half)].filter((p) => p !== null).join(' ');
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return [...counts].map(([kind, count]) => `${String(count)} × ${kind}`).join(', ');
}

/** « 1. Charger d'abord — arrêt 6 · CMD-12 · Les Balcons : 2 × Bac M ». */
export function stepHeadline(step: DeliveryLoadingPlanStepView, total: number): string {
  return `${String(step.step)}. ${stepLead(step.step, total)} — arrêt ${String(step.stopPosition)} · ${step.reference} · ${step.customerLabel} : ${stepContentLabel(step.bins)}`;
}

/** « ABC234 · Bac M · ½ gauche · partagé avec CMD-3 · ❄ isotherme · pile 2 ». */
export function planBinLabel(bin: DeliveryLoadingPlanBinView): string {
  return [
    bin.code,
    bin.binTypeName,
    halfLabel(bin.half),
    bin.sharedWithReference === null
      ? null
      : `${bin.reference}, partagé avec ${bin.sharedWithReference}`,
    bin.isotherm ? '❄ isotherme' : null,
    `pile ${String(bin.stackIndex)}`,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

/** « Pile 1 · Bac M — 3 / 5 ». */
export function stackTitle(stack: DeliveryLoadingPlanStackView): string {
  return `Pile ${String(stack.stackIndex)} · ${stack.binTypeName} — ${String(stack.height)} / ${String(stack.maxStack)}`;
}

/** « de bas en haut : arrêt 6, arrêt 5 ». */
export function stackStopsLabel(
  stack: Pick<DeliveryLoadingPlanStackView, 'stopPositions'>,
): string {
  return `de bas en haut : ${stack.stopPositions.map((p) => `arrêt ${String(p)}`).join(', ')}`;
}

/** Une jauge de volume — ou `null` en capacité quand on ne sait pas : jamais « ça tient ». */
export interface VolumeGauge {
  readonly label: string;
  readonly usedLiters: number;
  readonly capacityLiters: number | null;
  readonly tone: FoldMeterTone;
  /** « 120 L / 800 L », ou la phrase qui dit pourquoi on ne peut pas comparer. */
  readonly detail: string;
}

/** Ce qu'on dit d'une capacité sèche inconnue : le cas, et le geste de sortie. */
export const UNKNOWN_DRY_CAPACITY = 'capacité inconnue — renseignez les dimensions du véhicule';
/** Ce qu'on dit d'un véhicule sans caisse réfrigérée renseignée. */
export const UNKNOWN_COLD_CAPACITY =
  'aucune caisse réfrigérée renseignée — renseignez-la sur le véhicule s’il en a une';

function gauge(
  label: string,
  used: number,
  capacity: number | null,
  over: boolean,
  unknown: string,
): VolumeGauge {
  let tone: FoldMeterTone = 'success';
  if (over) {
    tone = 'alert';
  } else if (capacity !== null && used >= capacity * NEARLY_FULL_RATIO) {
    tone = 'warning';
  }
  return {
    label,
    usedLiters: used,
    capacityLiters: capacity,
    tone,
    detail:
      capacity === null
        ? `${String(used)} L — ${unknown}`
        : `${String(used)} L / ${String(capacity)} L`,
  };
}

/** Les deux jauges, sec puis froid. */
export function volumeGauges(volume: DeliveryLoadingPlanVolumeView): readonly VolumeGauge[] {
  return [
    gauge('Sec', volume.dryLiters, volume.dryCapacityLiters, volume.dryOver, UNKNOWN_DRY_CAPACITY),
    gauge(
      'Froid',
      volume.coldLiters,
      volume.coldCapacityLiters,
      volume.coldOver,
      UNKNOWN_COLD_CAPACITY,
    ),
  ];
}
