import { Inject, Injectable, Logger } from "@nestjs/common";

import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { MAILER, type B2bMailer } from "../../../platform/mailer/mailer.tokens.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffContacts } from "../../../staff/directory/domain/staff-contacts.js";
import { signedBy, staffSigner } from "../../domain/entities/plan-signer.js";
import type { ProductionDay } from "../../domain/entities/production-day.js";
import { DossierSentJournalEvent } from "../../domain/events/dossier-dispatch.events.js";
import {
  DossierDispatchLog,
  type DossierDispatchSlot,
} from "../../domain/ports/dossier-dispatch.log.js";
import { DossierRecipientsReader } from "../../domain/ports/dossier-recipients.reader.js";
import {
  dossierAddresseesOf,
  dossierCountsOf,
  type DossierAddressee,
} from "../../domain/services/dossier-addressees.js";
import { parisDateTime, weekdayLongDate } from "../../../platform/pdf/paper-pdf-kit.js";
import { PlanArrestBell } from "./plan-arrest-bell.js";
import { ProductionPapers, type ProductionPaper } from "./production-paper.service.js";

/** L'envoi demandé : à quel instant d'origine, et s'il complète un envoi précédent. */
export interface DossierOccasion {
  /** La clôture, ou le retirage — la clé de la trace et de l'alerte. */
  readonly at: Date;
  readonly completed: boolean;
}

/** Ce qu'un tour d'envoi a donné. */
interface DispatchTally {
  sent: number;
  readonly failedNames: string[];
}

/**
 * **Envoyer le dossier du jour à sa liste** (plan
 * `documentation/production/dossier-prod-du-jour.md`, décisions 2 et 5, E3).
 *
 * Un e-mail par destinataire, PDF joint (`ProductionPapers.dossierOf` : le
 * même papier que le téléchargement, archivé par tirage).
 *
 * ## Idempotence
 *
 * Le fait qui le déclenche est livré au moins une fois. Chaque destinataire
 * est d'abord PRIS dans la trace (`DossierDispatchLog.claim`, clé
 * `(journée, instant d'origine, ligne)`) : déjà pris, il est sauté. La clé est
 * aussi passée au fournisseur (`Idempotency-Key` chez Resend), qui couvre le
 * seul trou restant — un e-mail parti, puis une transaction annulée qui
 * efface sa trace et fait rejouer la livraison.
 *
 * ## Échec
 *
 * Un refus du fournisseur pour une personne n'arrête pas les autres : il est
 * noté dans la trace et n'est **pas retenté** — la ligne existe, une
 * redélivrance la saute. Le handler ne lève donc pas pour un refus d'envoi ;
 * l'outbox ne le rejoue que pour une panne qui précède tout envoi (journée
 * illisible, base), et alors rien n'est encore parti. À la fin, une alerte
 * nomme ceux qui n'ont rien reçu.
 */
@Injectable()
export class DossierDispatch {
  private readonly logger = new Logger(DossierDispatch.name);

  constructor(
    private readonly recipients: DossierRecipientsReader,
    private readonly staff: StaffContacts,
    private readonly papers: ProductionPapers,
    private readonly log: DossierDispatchLog,
    @Inject(MAILER) private readonly mailer: B2bMailer,
    private readonly bell: PlanArrestBell,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
  ) {}

  async dispatch(day: ProductionDay, occasion: DossierOccasion): Promise<void> {
    const addressees = await this.addressees();
    if (addressees.length === 0) {
      return;
    }
    const paper = await this.papers.dossierOf(day);
    const tally: DispatchTally = { sent: 0, failedNames: [] };
    for (const addressee of addressees) {
      await this.sendTo(addressee, day, occasion, paper, tally);
    }
    const attempted = tally.sent + tally.failedNames.length;
    if (attempted === 0) {
      return;
    }
    const serviceDay = day.day;
    await this.events.publishTraced(
      new DossierSentJournalEvent(
        serviceDay.value,
        tally.sent,
        tally.failedNames.length,
        occasion.completed,
      ),
    );
    if (tally.failedNames.length > 0) {
      await this.bell.dossierNotSent(serviceDay, occasion.at, tally.failedNames, this.clock.now());
    }
  }

  private async addressees(): Promise<readonly DossierAddressee[]> {
    const rows = await this.recipients.list();
    if (rows.length === 0) {
      return [];
    }
    const cards = await this.staff.contactsOf(
      rows.flatMap((row) => (row.kind === "staff" ? [row.staffUserId] : [])),
    );
    return dossierAddresseesOf(rows, cards);
  }

  /** Un destinataire : pris, envoyé, noté — ou sauté s'il était déjà pris. */
  private async sendTo(
    addressee: DossierAddressee,
    day: ProductionDay,
    occasion: DossierOccasion,
    paper: ProductionPaper,
    tally: DispatchTally,
  ): Promise<void> {
    const slot: DossierDispatchSlot = {
      serviceDay: day.day.value,
      occasionAt: occasion.at,
      recipientId: addressee.recipientId,
    };
    if (!(await this.log.claim(slot, addressee.name, this.clock.now()))) {
      return;
    }
    const counts = dossierCountsOf(day.orders);
    try {
      const receipt = await this.mailer.send({
        to: addressee.email,
        template: "staff.production-dossier",
        data: {
          firstName: addressee.firstName,
          dayLabel: weekdayLongDate(slot.serviceDay),
          arrestedAtLabel: parisDateTime(occasion.at),
          arrestedBy: arrestedByOf(day, occasion),
          orderCount: counts.orders,
          pickupCount: counts.pickup,
          deliveryCount: counts.delivery,
          pieceCount: counts.pieces,
          completed: occasion.completed,
          pdfBase64: paper.bytes.toString("base64"),
          fileName: paper.fileName,
        },
        idempotencyKey: `production-dossier:${slot.serviceDay}:${occasion.at.toISOString()}:${slot.recipientId}`,
      });
      await this.log.settle(
        slot,
        { kind: "sent", providerId: receipt.providerId },
        this.clock.now(),
      );
      tally.sent += 1;
    } catch (error) {
      const failure = error instanceof Error ? error.message : String(error);
      // Ni adresse ni nom au log : la trace et la cloche nomment la personne.
      this.logger.warn(
        `Dossier du ${slot.serviceDay} refusé pour la ligne ${slot.recipientId} : ${failure}`,
      );
      await this.log.settle(slot, { kind: "failed", failure }, this.clock.now());
      tally.failedNames.push(addressee.name);
    }
  }
}

/**
 * « par Marie Dupont », « automatiquement », ou vide : l'auteur FIGÉ de
 * l'arrêt — ou du retirage, pour un dossier complété.
 */
function arrestedByOf(day: ProductionDay, occasion: DossierOccasion): string {
  if (!occasion.completed) {
    return signedBy(day.closedBy);
  }
  return day.retakenByName === null ? "" : signedBy(staffSigner("", day.retakenByName));
}
