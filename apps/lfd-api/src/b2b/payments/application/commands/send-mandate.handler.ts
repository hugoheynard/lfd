import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { MAILER, type B2bMailer } from "../../../../platform/mailer/mailer.tokens.js";
import { CreditorReader } from "../../../accounting/domain/ports/creditor.reader.js";
import { LegalEntityLogoReader } from "../../../accounting/domain/ports/legal-entity-logo.reader.js";
import { DocumentStore } from "../../../../platform/storage/document-store.js";
import {
  MandateNotFoundError,
  MandateNotSendableError,
} from "../../domain/errors/mandate-errors.js";
import { CompanyBankAccountRepository } from "../../domain/ports/company-bank-account.repository.js";
import { PaymentMandateRepository } from "../../domain/payment-mandate.repository.js";
import { buildCustomerMandate } from "../customer-mandate-support.js";
import { SendMandateCommand } from "./send-mandate.command.js";

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
 * ## L'idempotence
 *
 * La clé porte l'identifiant du mandat : deux clics rapides ne font pas partir
 * deux courriels. Elle ne porte PAS d'horodatage — un renvoi délibéré passe par
 * le refus ci-dessus, pas par une clé qui changerait toute seule.
 */
@CommandHandler(SendMandateCommand)
export class SendMandateHandler implements ICommandHandler<SendMandateCommand, void> {
  constructor(
    private readonly mandates: PaymentMandateRepository,
    private readonly accounts: CompanyBankAccountRepository,
    private readonly creditors: CreditorReader,
    private readonly logos: LegalEntityLogoReader,
    private readonly store: DocumentStore,
    @Inject(MAILER) private readonly mailer: B2bMailer,
  ) {}

  async execute(command: SendMandateCommand): Promise<void> {
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

    const document = await buildCustomerMandate(
      {
        accounts: this.accounts,
        mandates: this.mandates,
        creditors: this.creditors,
        logos: this.logos,
        store: this.store,
      },
      command.companyId,
    );
    const snapshot = mandate.toSnapshot();

    await this.mailer.send({
      to: holder.email,
      template: "customer.mandate-to-sign",
      data: {
        // Le schéma DU MANDAT, figé à sa frappe : le courriel décrit le papier joint.
        scheme: snapshot.scheme,
        companyName: holder.companyName,
        reference: snapshot.reference,
        creditorIdentifier: document.creditorIdentifier,
        creditorName: document.creditorName,
        pdfBase64: document.bytes.toString("base64"),
        fileName: document.fileName,
      },
      idempotencyKey: `mandate-to-sign:${mandate.id}`,
    });
  }
}
