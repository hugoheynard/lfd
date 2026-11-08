import type { MailBrandCode } from "../../../requests/domain/value-objects/mail-brand.js";

/**
 * Port de l'**origine publique d'un espace** (plan de désinscription,
 * contradiction : « l'hôte de chaque espace ») — l'adresse depuis laquelle
 * un destinataire atteint l'API par la passerelle. Lue par `AppConfig`.
 */
export abstract class SpacePublicOrigins {
  /** `https://…` sans barre finale ; `null` : non configurée dans cet environnement. */
  abstract originOf(space: MailBrandCode): string | null;
}
