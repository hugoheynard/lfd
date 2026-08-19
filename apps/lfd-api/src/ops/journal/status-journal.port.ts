import type { HealthReason, HealthStatus } from "@lfd/ops-contract";

/** Un changement d'état, tel qu'il est écrit et relu. */
export interface StatusTransition {
  readonly node: string;
  readonly status: HealthStatus;
  readonly reason: HealthReason;
  readonly detail: string;
  /** L'instant du changement — c'est lui que `since` rend. */
  readonly at: Date;
}

/**
 * **La mémoire de la carte.**
 *
 * Un port, parce que ce qu'OPS a besoin de savoir tient en deux gestes — écrire
 * ce qui vient de changer, relire le dernier état de chacun — et qu'aucun des
 * deux ne devrait dépendre du fait que c'est Postgres derrière. Le jour où OPS
 * partira dans sa propre app, c'est l'adaptateur qui bouge, pas la règle.
 */
export abstract class StatusJournal {
  /** Écrit des transitions. Ne jette jamais : une carte ne tombe pas avec sa mémoire. */
  abstract record(transitions: readonly StatusTransition[]): Promise<void>;

  /** Le dernier état connu de chaque nœud, par identifiant. */
  abstract latest(): Promise<ReadonlyMap<string, StatusTransition>>;
}
