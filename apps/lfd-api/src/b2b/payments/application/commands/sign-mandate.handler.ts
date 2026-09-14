import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { MandateSignedEvent } from "../../domain/events/payment-mandate.events.js";
import { MandateNotFoundError } from "../../domain/errors/mandate-errors.js";
import { PaymentMandateRepository } from "../../domain/payment-mandate.repository.js";
import { SignMandateCommand } from "./sign-mandate.command.js";

/**
 * Le papier est revenu signé : le brouillon devient l'autorisation.
 *
 * ## 🔴 Deux écritures, une transaction
 *
 * L'unicité du mandat actif est tenue par un index partiel. Passer un second
 * mandat en `active` sans avoir révoqué le premier lève une violation de
 * contrainte — remontée en 500, sur le geste « le client a renvoyé son mandat
 * signé », c'est-à-dire au pire moment.
 *
 * L'ancien est donc révoqué **dans la même transaction** que la signature du
 * neuf. Hors transaction, un échec entre les deux laisserait une société sans
 * aucun mandat actif alors qu'elle vient d'en signer un.
 *
 * L'agrégat ne le fait pas lui-même, et c'est délibéré : un agrégat ne connaît
 * pas ses voisins. C'est ce qui l'empêche de faire semblant de les gérer.
 *
 * ## Le mur tenant
 *
 * Le mandat est chargé par son identifiant, puis **sa société est vérifiée**.
 * Sans ce contrôle, un identifiant deviné suffirait à signer le mandat d'un
 * autre client depuis la fiche du sien — le `companyId` de l'URL ne prouve rien
 * à lui seul.
 *
 * ## Le journal (depuis le 2026-09-14)
 *
 * Le fait `payment_mandate.signed` part dans la même transaction que les deux
 * écritures, sur le modèle de `CorrectLegalEntityHandler` : activer autorise un
 * débit, et « qui a activé ce mandat, sur quelle date de papier » doit avoir
 * une réponse le jour d'une contestation.
 *
 * ## La date
 *
 * Elle vient du PAPIER et non de l'horloge : un mandat posté revient signé
 * plusieurs jours plus tard. L'horloge ne sert qu'à refuser une date à venir,
 * ce que l'agrégat fait.
 */
@CommandHandler(SignMandateCommand)
export class SignMandateHandler implements ICommandHandler<SignMandateCommand, void> {
  constructor(
    private readonly mandates: PaymentMandateRepository,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: SignMandateCommand): Promise<void> {
    const mandate = await this.mandates.findById(command.mandateId);
    if (mandate === null || mandate.companyId !== command.companyId) {
      throw new MandateNotFoundError(command.companyId);
    }

    const now = this.clock.now();
    // `T00:00:00` local : la date du papier n'a pas d'heure, et lui en donner
    // une en UTC la ferait basculer la veille pour les signatures de début de
    // journée — la RUM imprimée contredirait alors la date affichée.
    const signedAt = new Date(`${command.signedAt}T00:00:00`);
    mandate.sign(signedAt, now);

    const current = await this.mandates.findCurrent(command.companyId);
    const replaced =
      current !== null && current.id !== mandate.id && current.debitable() ? current : null;
    await this.uow.run(async () => {
      if (replaced !== null) {
        replaced.revoke(now);
        await this.mandates.save(replaced);
      }
      await this.mandates.save(mandate);
      await this.events.publishTraced(
        new MandateSignedEvent(
          mandate.id,
          command.companyId,
          mandate.reference,
          command.signedAt,
          replaced?.id ?? null,
        ),
      );
    });
  }
}
