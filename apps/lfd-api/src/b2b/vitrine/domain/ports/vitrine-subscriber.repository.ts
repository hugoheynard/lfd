import type { VitrineSubscriber } from "../vitrine-subscriber.js";

/** Port d'écriture des abonnés : l'agrégat entier, chargé puis rangé. */
export abstract class VitrineSubscriberRepository {
  abstract load(id: string): Promise<VitrineSubscriber | null>;
  abstract save(subscriber: VitrineSubscriber): Promise<void>;
  /**
   * Les abonnés allumés, pas en échec et POURVUS D'UNE ADRESSE — ceux que le balayage compare et à
   * qui le relais livre ; un abonné en lecture seule n'y figure jamais. Vide = le balayage ne calcule RIEN (S3).
   */
  abstract listDeliverable(): Promise<readonly VitrineSubscriber[]>;
}
