import type { HandoverQueueView } from '@lfd/contracts';

/** Un acheminement : ce qui doit sortir aujourd'hui, et ce qui est déjà parti. */
export interface HandoverSplit {
  /** Combien de remises sont attendues par cette voie aujourd'hui. */
  readonly expected: number;
  /** Combien sont déjà faites — le reste est encore à tendre ou à charger. */
  readonly done: number;
}

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
 * La journée de la file du comptoir, réduite à ses deux compteurs — ou `null`
 * si la lecture a échoué.
 *
 * 🔴 **Les annulées sont exclues.** La file les REND, délibérément : un client
 * qui se présente avec une commande annulée doit être trouvé à l'écran pour
 * qu'on puisse lui dire pourquoi on ne lui donne rien. Mais ce n'est pas une
 * remise à faire, et la compter gonflerait le reste-à-faire d'un travail qui
 * n'existe pas.
 */
export function todayHandovers(view: HandoverQueueView | null): TodayHandovers | null {
  if (view === null) {
    return null;
  }
  const live = view.entries.filter((entry) => entry.state !== 'cancelled');
  const split = (delivery: boolean): HandoverSplit => {
    const rows = live.filter((entry) => (entry.fulfillmentMethod === 'delivery') === delivery);
    return {
      expected: rows.length,
      done: rows.filter((entry) => entry.state === 'handed_over').length,
    };
  };
  return { pickup: split(false), delivery: split(true) };
}

/** Combien restent à remettre, les deux voies confondues — le reste-à-faire. */
export function remainingHandovers(handovers: TodayHandovers): number {
  return (
    handovers.pickup.expected -
    handovers.pickup.done +
    (handovers.delivery.expected - handovers.delivery.done)
  );
}
