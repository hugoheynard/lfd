import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Mail } from "../../../../mail/channels/requests/mail.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { CreditorReader } from "../../../accounting/domain/ports/creditor.reader.js";
import { LegalEntityLogoReader } from "../../../accounting/domain/ports/legal-entity-logo.reader.js";
import { CustomerDocumentStore } from "../../../../platform/storage/customer-document-store.js";
import { DocumentStore } from "../../../../platform/storage/document-store.js";
import {
  MandateNotFoundError,
  MandateNotSendableError,
} from "../../domain/errors/mandate-errors.js";
import { MandateSentEvent } from "../../domain/events/payment-mandate.events.js";
import { CompanyBankAccountRepository } from "../../domain/ports/company-bank-account.repository.js";
import { PaymentMandateRepository } from "../../domain/payment-mandate.repository.js";
import { MandateDebtorReader } from "../../domain/ports/mandate-debtor.reader.js";
import { Clock } from "../../../../platform/time/clock.js";
import { buildCustomerMandate, type CustomerMandateDocument } from "../customer-mandate-support.js";
import { SendMandateCommand } from "./send-mandate.command.js";

const PDF_CONTENT_TYPE = "application/pdf";

/**
 * Envoie au client le mandat **frappé**, prêt à signer.
 *
 * ## Le document est celui de l'écran, pas un second rendu
 *
 * 🔴 Le PDF part par la **même lecture** que l'aperçu. Un second chemin de rendu
 * finirait par diverger — et le jour où il divergerait, on enverrait au client
 * un document différent de celui qu'on a relu avant de cliquer. Le rendu est
 * pur et la lecture bon marché : les refaire coûte moins que les garder en
 * phase.
 *
 * ## Ce qui est refusé
 *
 * Un mandat **non frappé n'existe pas ici** : la garde porte sur son état, pas
 * sur le rendu. Envoyer un exemplaire filigrané « EXEMPLE » à un client serait
 * lui demander de signer un document qui dit lui-même qu'il ne se signe pas.
 *
 * Un mandat **déjà signé** est refusé aussi. Le renvoyer ferait circuler un
 * second exemplaire de la même RUM, et c'est celui qui revient en dernier qui
 * gagnerait — sur une autorisation qu'on oppose en contestation.
 *
 * ## Le geste : `sendAndAwaitReceipt`, par le bloc `mail` (lot S2e)
 *
 * Envoi IMMÉDIAT par la porte du bloc (`Mail.sendAndAwaitReceipt`), pas une
 * demande différée — relu le 2026-11-06 :
 *
 * - le fait `payment_mandate.sent` porte l'identifiant que le fournisseur a
 *   rendu (décision de Hugo du 2026-09-19) : avec `send`, il n'existerait
 *   pas encore au moment d'écrire le fait, et « envoyé » voudrait dire
 *   « demandé » ;
 * - c'est un clic du staff sans écriture locale ni unité de travail : un refus
 *   de l'envoi doit s'afficher à l'agent, comme le renvoi du lien de paiement
 *   (S2a) ou celui d'une facture (S2d).
 *
 * Aucun état du mandat ne dépend de l'envoi (il reste `draft` jusqu'à la
 * preuve signée).
 *
 * ## Le papier envoyé est l'exemplaire gardé (revue, cas 7)
 *
 * Décision de Hugo du 2026-11-06 : aucune pièce jointe n'est plus fabriquée
 * en mémoire au moment de l'envoi. Le PDF rendu est d'abord RANGÉ au
 * stockage des pièces client (`CustomerDocumentStore`, le seul que le bloc
 * `mail` ouvre), puis la demande ne porte que sa place (`pdfStored`) ; le
 * bloc le relit pour l'envoyer. Ce qu'on a envoyé se relit donc à l'octet
 * près, ce qui compte pour un mandat qu'on oppose en contestation.
 *
 * La clé est {@link mandateCopyKey} : une par envoi voulu, jamais écrasée par
 * le suivant (le rendu lit l'horloge, deux envois ne rangent pas forcément
 * les mêmes octets). Ni adresse, ni IBAN, ni nom de titulaire, ni RUM : des
 * identifiants opaques seulement. Le rangement qui échoue fait échouer le
 * geste AVANT l'envoi ; une pièce que le bloc ne retrouve pas est refusée
 * par lui (`MailAttachmentMissingError`), et rien ne part.
 *
 * ## L'idempotence
 *
 * Une clé **par intention** (`mandate-to-sign:<mandat>:<intention>`), la clé
 * que l'écran a fabriquée à l'ouverture de la confirmation (revue, cas 4) :
 * un double clic ne réexécute rien et n'envoie qu'un courriel ; un second
 * « Envoyer » du même brouillon — le client a perdu le courriel — porte une
 * clé neuve et renvoie. Une clé par mandat tairait ce renvoi un an. Ni
 * adresse ni RUM dans la clé.
 *
 * ## Le fait « mandat envoyé »
 *
 * Décidé par Hugo le 2026-09-19 : l'envoi entre au journal d'activité
 * (`payment_mandate.sent`), avec l'identifiant rendu par le fournisseur et
 * jamais l'adresse. Il est écrit **après** l'envoi : s'il l'était avant,
 * un envoi refusé laisserait au journal un papier qui n'est jamais parti.
 *
 * `@hors-transaction` le courriel part chez un tiers et ne se rattrape pas :
 * aucune transaction ne peut l'annuler, et `sendAndAwaitReceipt` est refusé sous une
 * unité de travail. Si le journal refuse d'écrire, la requête échoue et le
 * courriel est déjà parti ; un second clic de même intention ne le renvoie
 * pas (le bloc rend le reçu de la clé) et écrit le fait.
 */
/**
 * La place de l'exemplaire envoyé : `mandates/<société>/<mandat>/<intention>.pdf`.
 * Trois identifiants opaques (l'intention est un UUID validé par le
 * contrôleur) ; un rejeu de la même intention range au même endroit.
 */
export function mandateCopyKey(companyId: string, mandateId: string, intentKey: string): string {
  return `mandates/${companyId}/${mandateId}/${intentKey}.pdf`;
}

@CommandHandler(SendMandateCommand)
export class SendMandateHandler implements ICommandHandler<SendMandateCommand, void> {
  constructor(
    private readonly mandates: PaymentMandateRepository,
    private readonly accounts: CompanyBankAccountRepository,
    private readonly creditors: CreditorReader,
    private readonly logos: LegalEntityLogoReader,
    private readonly store: DocumentStore,
    private readonly kept: CustomerDocumentStore,
    private readonly mail: Mail,
    private readonly events: DomainEventPublisher,
    private readonly debtors: MandateDebtorReader,
    private readonly clock: Clock,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: SendMandateCommand): Promise<void> {
    return this.intents.run(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "payments.send-mandate",
        subject: command.mandateId,
      },
      NOTHING_TO_REPLAY,
      () => this.send(command),
    );
  }

  private async send(command: SendMandateCommand): Promise<void> {
    const mandate = await this.mandates.findById(command.mandateId);
    if (mandate === null || mandate.companyId !== command.companyId) {
      throw new MandateNotFoundError(command.companyId);
    }
    if (mandate.status !== "draft") {
      throw new MandateNotSendableError(mandate.status);
    }

    const holder = await this.mandates.findHolder(command.companyId);
    if (holder === null) {
      throw new MandateNotFoundError(command.companyId);
    }
    const document = await this.render(command.companyId);
    const snapshot = mandate.toSnapshot();
    const key = await this.kept.save(
      mandateCopyKey(command.companyId, mandate.id, command.intentKey),
      {
        bytes: document.bytes,
        contentType: PDF_CONTENT_TYPE,
      },
    );

    const receipt = await this.mail.sendAndAwaitReceipt({
      to: holder.email,
      brand: "lfc",
      template: "customer.mandate-to-sign",
      data: {
        // Le schéma DU MANDAT, figé à sa frappe : le courriel décrit le papier joint.
        scheme: snapshot.scheme,
        companyName: holder.companyName,
        reference: snapshot.reference,
        creditorIdentifier: document.creditorIdentifier,
        creditorName: document.creditorName,
        pdfStored: { store: "customer-documents", key },
        fileName: document.fileName,
      },
      idempotencyKey: `mandate-to-sign:${mandate.id}:${command.intentKey}`,
    });
    await this.events.publishTraced(
      new MandateSentEvent(
        mandate.id,
        { id: mandate.companyId, name: holder.displayName },
        snapshot.reference,
        receipt.providerId,
      ),
    );
  }

  /** Le mandat par la lecture même de l'aperçu (cf. la classe). */
  private render(companyId: string): Promise<CustomerMandateDocument> {
    return buildCustomerMandate(
      {
        accounts: this.accounts,
        mandates: this.mandates,
        creditors: this.creditors,
        logos: this.logos,
        store: this.store,
        debtors: this.debtors,
        clock: this.clock,
      },
      companyId,
    );
  }
}
