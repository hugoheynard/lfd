import type { CreatedPaymentLink } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PayLinks } from "../../../../payment/channels/requests/index.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import type { IntentRecord } from "../../../../platform/intent/gesture-intent.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import {
  type IntentCodec,
  OncePerIntent,
  readIntentString,
} from "../../../../platform/intent/once-per-intent.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import { PaymentLink } from "../../domain/entities/payment-link.js";
import {
  PaymentLinkCompanyNotFoundError,
  PaymentLinkUrlGoneError,
} from "../../domain/errors/payment-link-errors.js";
import { PaymentLinkCreatedEvent } from "../../domain/events/payment-link.events.js";
import { AccountingSettingsReader } from "../../domain/ports/accounting-settings.store.js";
import { PaymentLinkCompanyReader } from "../../domain/ports/payment-link-company.reader.js";
import { PaymentLinkRepository } from "../../domain/ports/payment-link.repository.js";
import { PaymentLinkTerms } from "../../domain/value-objects/payment-link-terms.js";
import { FREE_CHARGE_LINK_ORIGIN, freeChargeSubject } from "../free-charge/free-charge-subject.js";
import { CreatePaymentLinkCommand } from "./create-payment-link.command.js";

/** Ce que le scellé d'intention garde : l'identifiant seul, jamais l'URL (elle porte le jeton). */
interface SealedLink {
  readonly id: string;
}

/**
 * Crée une **demande de paiement libre** et ouvre son lien vers la porte du bloc
 * `payment` (plan du lien vers un sujet, §5.1) — dans UNE transaction, sans
 * réseau : le plafond lu maintenant et les termes validés contre lui, la
 * ligne (canal `door`), le lien `PayLinks.open` du sujet `free_charge` au
 * nom de la société, le fait de journal. L'intention chez le prestataire ne
 * naît qu'à l'ouverture de la page par le client.
 *
 * Rend l'id et l'URL : l'écran affiche le lien à copier sans relire la liste.
 *
 * **Une fois par intention** (sujet : la société, le montant, le libellé, la nature) :
 * un double clic rend la même demande de paiement libre. 🔴 Le scellé ne garde que
 * l'identifiant — l'URL porte le jeton du lien, qui ne s'écrit jamais en
 * clair dans `gesture_intents` ; le rejeu la relit par `PayLinks.urlOf`.
 */
@CommandHandler(CreatePaymentLinkCommand)
export class CreatePaymentLinkHandler implements ICommandHandler<
  CreatePaymentLinkCommand,
  CreatedPaymentLink
> {
  constructor(
    private readonly settings: AccountingSettingsReader,
    private readonly companies: PaymentLinkCompanyReader,
    private readonly payLinks: PayLinks,
    private readonly links: PaymentLinkRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
    private readonly authors: StaffAuthorDirectory,
  ) {}

  /**
   * @throws {PaymentLinkCompanyNotFoundError} société inconnue.
   * @throws {PaymentLinkAboveCapError} au-delà du plafond.
   * @throws {PayLinkOriginWithoutRootError} l'adresse publique n'est pas configurée.
   * @throws {PaymentLinkUrlGoneError} rejeu d'une demande de paiement libre payée ou annulée depuis.
   */
  async execute(command: CreatePaymentLinkCommand): Promise<CreatedPaymentLink> {
    // L'adresse rendue par l'ouverture ; absente quand l'intention est rejouée.
    const opened: { url: string | null } = { url: null };
    const { id } = await this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: CREATE_LINK_GESTURE,
        subject: intentSubject(
          command.companyId,
          command.amountCents,
          command.label,
          command.nature,
        ),
      },
      SEALED_LINK,
      (seal) =>
        this.create(command, seal, (url) => {
          opened.url = url;
        }),
    );
    const url = opened.url ?? (await this.payLinks.urlOf(freeChargeSubject(id)));
    if (url === null) {
      throw new PaymentLinkUrlGoneError(id);
    }
    return { id, url };
  }

  private async create(
    command: CreatePaymentLinkCommand,
    seal: (sealed: SealedLink) => Promise<void>,
    opened: (url: string) => void,
  ): Promise<SealedLink> {
    const companyName = await this.companies.nameOf(command.companyId);
    if (companyName === null) {
      throw new PaymentLinkCompanyNotFoundError(command.companyId);
    }
    // Le nom de l'auteur, figé sur le lien pour l'avis à l'équipe : `payment`
    // ne lit pas l'annuaire. Fiche introuvable : `null`, jamais un nom inventé.
    const byLabel = (await this.authors.identify([command.staffUserId])).nameOf(
      command.staffUserId,
    );
    const { paymentLinkMaxCents } = await this.settings.read();
    const terms = PaymentLinkTerms.create(command.amountCents, command.label, paymentLinkMaxCents);
    const link = PaymentLink.create({
      id: this.ids.next(),
      companyId: command.companyId,
      terms,
      nature: command.nature,
      createdAt: this.clock.now(),
      createdByStaffId: command.staffUserId,
    });
    const url = await this.uow.run(async () => {
      await this.links.save(link);
      const { url: linkUrl } = await this.payLinks.open(freeChargeSubject(link.id), {
        origin: FREE_CHARGE_LINK_ORIGIN,
        payerLabel: companyName,
        by: command.staffUserId,
        byLabel,
      });
      await this.events.publishTraced(new PaymentLinkCreatedEvent(link, companyName));
      await seal({ id: link.id });
      return linkUrl;
    });
    opened(url);
    return { id: link.id };
  }
}

/** Le nom stable du geste, dans le registre des intentions. */
const CREATE_LINK_GESTURE = "payments.create-payment-link";

/**
 * Le lien gardé : son identifiant seul. Un scellé d'avant la porte portait
 * aussi l'URL Stripe ; elle est ignorée à la relecture, et l'adresse relue.
 */
const SEALED_LINK: IntentCodec<SealedLink> = {
  write: (sealed): IntentRecord => ({ id: sealed.id }),
  read: (record, gesture) => ({ id: readIntentString(record, "id", gesture) }),
};
