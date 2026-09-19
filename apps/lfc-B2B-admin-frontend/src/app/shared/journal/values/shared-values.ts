import { domain, type ValueFamily } from './value-domain';

/**
 * **Ce que plusieurs familles partagent** : qui a fait le geste, un agent ou le
 * client. Les RIB, les mandats et les rendez-vous le disent avec les mêmes
 * valeurs — un seul ensemble, pour qu'elles ne se lisent pas de deux façons.
 */

/** `via` sur un RIB, un mandat, ses options (`actorChannel()` du catalogue). */
export const ACTOR_CHANNEL = domain('qui a fait le geste', {
  staff: 'L’équipe',
  customer: 'Le client',
});

export const SHARED_VALUES: ValueFamily = {
  enums: [ACTOR_CHANNEL],
  // Les mêmes, en littéral : un rendez-vous confirmé, un mandat révoqué ne
  // peuvent l'être que par l'équipe, et le schéma l'écrit `z.literal("staff")`.
  literals: ACTOR_CHANNEL.labels,
};
