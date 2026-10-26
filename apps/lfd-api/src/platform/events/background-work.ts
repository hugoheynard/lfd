import { Injectable, Logger } from "@nestjs/common";

import { outsideRequestContext } from "../context/request-context.store.js";

/**
 * Le **travail de fond lancé sur un événement** — celui que personne n'attend.
 *
 * Un abonné d'événement (`@EventsHandler`) tourne hors de la requête HTTP qui l'a
 * provoqué : la réponse part avant lui. Deux conséquences qu'on ne peut pas
 * laisser au hasard, et qui sont les deux raisons d'être de cette classe.
 *
 * 1. **Une erreur n'a personne pour l'attraper.** Sans ce garde, un projet de
 *    projection qui échoue devient un `unhandledRejection` — donc, selon le
 *    runtime, un log illisible ou un processus qui meurt. On journalise et on
 *    continue : une projection ratée n'a jamais valu qu'on perde le reste.
 * 2. **Personne ne sait quand c'est fini.** Un test qui vide la base juste après
 *    une requête peut le faire pendant qu'une écriture de fond est encore en
 *    route — et cette écriture atterrit alors dans le test suivant. `whenIdle()`
 *    donne le point d'attente qui manquait ; c'est sa seule raison d'exister, et
 *    la production ne l'appelle pas.
 */
/**
 * Ce qui est en vol, nommé : l'étiquette de chaque tâche, et le nombre de
 * tâches terminées depuis le démarrage. Le compteur dit si l'attente AVANCE —
 * une file qui se renouvelle n'est pas une file figée.
 */
export interface BackgroundWorkSnapshot {
  readonly pending: readonly string[];
  readonly settled: number;
}

@Injectable()
export class BackgroundWork {
  private readonly logger = new Logger(BackgroundWork.name);
  private readonly pending = new Map<Promise<void>, string>();
  private settled = 0;

  /** Suit une tâche de fond, et **avale** son échec après l'avoir journalisé. */
  track(work: Promise<void>, label: string): Promise<void> {
    const guarded = work
      .catch((cause: unknown) => {
        this.logger.error(`Travail de fond en échec (${label})`, cause);
      })
      .finally(() => {
        this.pending.delete(guarded);
        this.settled += 1;
      });
    this.pending.set(guarded, label);
    return guarded;
  }

  /**
   * Lance et suit une tâche **détachée de la requête** qui la lance : elle
   * tourne hors de son contexte, donc sous l'heure système et non sous
   * l'instant gelé de la requête. Pour un travail qui dure au-delà de la
   * réponse (la réémission du catalogue, 2026-10-18).
   */
  detach(work: () => Promise<void>, label: string): Promise<void> {
    return outsideRequestContext(() => this.track(work(), label));
  }

  /**
   * Attend qu'il n'y ait plus rien en vol. La boucle est nécessaire : une tâche
   * peut en lancer une autre, et un seul `Promise.all` rendrait la main trop tôt.
   */
  async whenIdle(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.all([...this.pending.keys()]);
    }
  }

  /**
   * L'état de l'attente, pour qui doit dire POURQUOI elle ne finit pas : le
   * harnais e2e, quand `whenIdle()` ne converge pas (2026-10-26 — une tâche
   * de fond pendue sur un appel réseau figeait un hook quatre minutes sans un
   * mot). La production ne l'appelle pas.
   */
  snapshot(): BackgroundWorkSnapshot {
    return { pending: [...this.pending.values()], settled: this.settled };
  }
}
