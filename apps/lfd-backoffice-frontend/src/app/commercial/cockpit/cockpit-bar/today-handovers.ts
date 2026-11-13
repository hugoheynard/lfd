import type { CockpitHandoverSplitView, CockpitHandoversView } from '@lfd/contracts';

/** Un acheminement : ce qui doit sortir aujourd'hui, et ce qui est déjà parti. */
export type HandoverSplit = CockpitHandoverSplitView;

/**
 * **Les remises du jour, par acheminement.**
 *
 * Les deux voies ne se pilotent pas pareil et ne se comptent donc pas ensemble :
 * un **retrait** attend qu'un client passe — on ne peut que l'appeler s'il ne
 * vient pas — tandis qu'un **coursier** part d'ici, et le nombre restant dit
 * s'il reste une tournée à faire. Un total unique masquerait exactement la
 * question qu'on se pose en fin de journée.
 */
export interface TodayHandovers {
  readonly pickup: HandoverSplit;
  readonly delivery: HandoverSplit;
}

/**
 * Les chiffres du jour tels que le serveur les a comptés — ou `null` si la
 * lecture a échoué. Le serveur compte (annulées et non réglées exclues) : le
 * cockpit ne reçoit aucune ligne de la file.
 */
export function todayHandovers(view: CockpitHandoversView | null): TodayHandovers | null {
  return view === null ? null : { pickup: view.pickup, delivery: view.delivery };
}

/** Combien restent à remettre, les deux voies confondues — le reste-à-faire. */
export function remainingHandovers(handovers: TodayHandovers): number {
  return (
    handovers.pickup.expected -
    handovers.pickup.done +
    (handovers.delivery.expected - handovers.delivery.done)
  );
}
