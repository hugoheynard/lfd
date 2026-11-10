import type { SupportRequestView } from "@lfd/contracts";

/**
 * Port de **lecture** d'une demande de contact, par son identifiant.
 *
 * Distinct de `SupportRequestRepository` (ISP) : l'abonné qui prévient
 * l'équipe relit UNE demande et n'écrit rien — il n'a pas à dépendre d'une
 * surface qui sait enregistrer et clore. L'événement de dépôt ne porte que des
 * identifiants, et c'est voulu : il dit ce qui s'est passé, pas ce qu'on veut
 * afficher (`todo-notifications.md`, option b).
 */
export abstract class SupportRequestReader {
  /** La demande, ou `null` si elle n'existe pas. */
  abstract find(supportRequestId: string): Promise<SupportRequestView | null>;
}
