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

/**
 * Ce que la transaction de la garde a lu pour l'envoi : à qui écrire. Les
 * abonnés le passent tel quel de `prepare` à `deliver`.
 */
export interface PreparedDossier {
  readonly addressees: readonly DossierAddressee[];
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
 * ## Deux temps (2026-10-07, audit B1)
 *
 * Ses deux seuls appelants, `SendDossierOnDayClosed` et
 * `SendDossierOnDayRetaken` (vérifié le 2026-10-07), tournent dans la
 * transaction que la garde ouvre pour poser leur reçu :
 *
 * - `prepare` y lit les destinataires, en base seulement. Une liste ou un
 *   annuaire illisibles lèvent : la livraison échoue et sera rejouée, comme
 *   pour la journée que l'abonné lit juste avant ;
 * - `deliver` part APRÈS la validation, hors transaction : le papier, qui lit
 *   et range son archive dans le stockage objet, puis les envois chez Resend.
 *   Aucun de ces allers-retours ne tient plus une connexion du pool — et rien
 *   ici n'est rejoué, d'où la cloche ci-dessous.
 *
 * ## Idempotence
 *
 * Chaque destinataire est d'abord PRIS dans la trace
 * (`DossierDispatchLog.claim`, clé `(journée, instant d'origine, ligne)`) :
 * déjà pris, il est sauté. La clé est aussi passée au fournisseur
 * (`Idempotency-Key` chez Resend), en seconde serrure : `claim`, l'envoi et
 * `settle` sont validés chacun seul, si bien qu'aucune transaction annulée
 * n'efface plus la trace d'un e-mail parti.
 *
 * ## Échec
 *
 * - **Le papier ne se fabrique pas** : personne ne reçoit rien, et la cloche
 *   (`dossierNotPrepared`) nomme tout le monde.
 * - **Un refus du fournisseur** pour une personne n'arrête pas les autres : il
 *   est noté dans la trace et n'est **pas retenté** — la ligne existe, une
 *   redélivrance la saute. À la fin, la cloche (`dossierNotSent`) nomme ceux
 *   qui n'ont rien reçu.
 * - **La base tombe pendant le tour** (trace, journal, cloche) : le tour
 *   s'arrête là et `deliver` lève, journalisé par l'appelant. La cloche ne
 *   sonnerait pas davantage : elle écrit dans la même base. Un redémarrage
 *   pendant le tour l'arrête de même, sans journal : une ligne déjà prise
 *   reste `pending`.
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

  /**
   * **Dans la transaction de la garde** : à qui écrire. La base seule, et une
   * lecture qui échoue lève — la livraison sera rejouée.
   */
  async prepare(): Promise<PreparedDossier> {
    const rows = await this.recipients.list();
    if (rows.length === 0) {
      return { addressees: [] };
    }
    const cards = await this.staff.contactsOf(
      rows.flatMap((row) => (row.kind === "staff" ? [row.staffUserId] : [])),
    );
    return { addressees: dossierAddresseesOf(rows, cards) };
  }

  /**
   * **Après la validation, hors transaction** : le papier, un envoi par
   * destinataire, puis le journal et la cloche. Ne lève que pour une panne de
   * base (trace, journal, cloche).
   */
  async deliver(
    prepared: PreparedDossier,
    day: ProductionDay,
    occasion: DossierOccasion,
  ): Promise<void> {
    const { addressees } = prepared;
    if (addressees.length === 0) {
      return;
    }
    const paper = await this.paperOrBell(addressees, day, occasion);
    if (paper === null) {
      return;
    }
    const tally: DispatchTally = { sent: 0, failedNames: [] };
    for (const addressee of addressees) {
      await this.sendTo(addressee, day, occasion, paper, tally);
    }
    await this.report(tally, day, occasion);
  }

  /**
   * Le papier, ou la cloche : sans lui personne ne reçoit rien, et rien ne
   * rejouera l'envoi — la livraison est déjà validée. Ni adresse ni nom au
   * log : la cloche nomme les personnes.
   */
  private async paperOrBell(
    addressees: readonly DossierAddressee[],
    day: ProductionDay,
    occasion: DossierOccasion,
  ): Promise<ProductionPaper | null> {
    try {
      return await this.papers.dossierOf(day);
    } catch (error) {
      this.logger.error(
        `Dossier du ${day.day.value} non fabriqué : personne ne l'a reçu.`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.bell.dossierNotPrepared(
        day.day,
        occasion.at,
        addressees.map((addressee) => addressee.name),
        this.clock.now(),
      );
      return null;
    }
  }

  /** Le journal du tour, et la cloche pour ceux qui n'ont rien reçu. */
  private async report(
    tally: DispatchTally,
    day: ProductionDay,
    occasion: DossierOccasion,
  ): Promise<void> {
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
