import type { DeferrableMailTemplate, DeferredMailDemand, MailRequested } from "./mail.js";

/**
 * Une demande « à l'équipe » : celle de {@link Mail.send}, sans destinataire —
 * le bloc le lit dans le réglage du staff. La clé est celle de l'appelant ;
 * le bloc la suffixe de l'identifiant de chaque membre (`…:<id>`), ou de
 * `:inbox` pour la boîte de l'équipe — jamais d'une adresse.
 */
export type StaffAudienceMailDemand<K extends DeferrableMailTemplate> = Omit<
  DeferredMailDemand<K>,
  "to"
>;

/**
 * **Envoyer un avis à l'équipe** (lot P1c,
 * `documentation/payment/les-liens-de-paiement.md`) : une
 * porte à part de `Mail` (ISP) — un appelant qui écrit à une personne n'a pas
 * à connaître celle qui écrit à l'équipe. Déclarée et implémentée par le bloc,
 * atteinte en « port uniquement » comme `Mail`.
 *
 * Les destinataires sont lus **au moment de l'appel**, dans la transaction de
 * l'appelant, et figés dans les demandes : un membre suspendu une seconde
 * plus tard reçoit l'avis, et c'est assumé.
 */
export abstract class StaffAudienceMail {
  /**
   * Écrit une demande par membre réglé et joignable, dans l'`UnitOfWork` de
   * l'appelant ; sans personne, une seule à la boîte de l'équipe, et un
   * avertissement ; sans boîte non plus, rien, et un avertissement.
   *
   * @returns les demandes écrites, dans l'ordre des identifiants — vide si
   *   rien n'est parti.
   * @throws {MailRequestOutsideUnitOfWorkError} hors d'une `UnitOfWork`.
   */
  abstract sendToStaffAudience<K extends DeferrableMailTemplate>(
    demand: StaffAudienceMailDemand<K>,
  ): Promise<readonly MailRequested[]>;
}
