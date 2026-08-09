import type { AppointmentView } from "@lfd/contracts";

/**
 * Port de **lecture** des rendez-vous — vues plates rendues telles quelles aux
 * surfaces. Séparé du repository (ISP) : la file staff et « mes rendez-vous »
 * côté client n'ont besoin d'aucune méthode d'écriture.
 */
export abstract class AppointmentReader {
  /**
   * La file **staff** : tous les rendez-vous de la fenêtre, quel qu'en soit
   * l'état (les annulés compris — le commercial doit voir ce qui s'est décommandé).
   */
  abstract listBetween(from: Date, to: Date): Promise<readonly AppointmentView[]>;

  /**
   * Les rendez-vous **à venir** d'un sujet donné, du plus proche au plus lointain.
   * C'est ce que le client voit de ses propres rendez-vous.
   */
  /**
   * **Un** rendez-vous, par son identifiant — ou `null`. C'est ce que lit sa page
   * dédiée : sans cette lecture, un lien direct ou un simple rafraîchissement ne
   * pourrait rien afficher, la file de la fenêtre courante ne le contenant pas
   * forcément.
   */
  abstract byId(appointmentId: string): Promise<AppointmentView | null>;

  abstract listUpcomingFor(
    subjectType: string,
    subjectIds: readonly string[],
    now: Date,
  ): Promise<readonly AppointmentView[]>;
}
