import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Mail } from "../../../../mail/channels/requests/mail.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { weekdayLongDate } from "../../../../platform/pdf/paper-pdf-kit.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffContacts } from "../../../../staff/directory/domain/staff-contacts.js";
import {
  PlanVersionSummaries,
  ProductionDayRepository,
  ServiceDay,
  type ProductionDay,
} from "../../../day/index.js";
import type { PaperSlot } from "../../../shared/print/index.js";
import {
  NoPlanVersionToResendError,
  PlanVersionSummaryMissingError,
} from "../../domain/errors/dossier-resend-errors.js";
import { DossierDispatchLog } from "../../domain/ports/dossier-dispatch.log.js";
import { DossierDispatchesReader } from "../../domain/ports/dossier-dispatches.reader.js";
import { DossierRecipientsReader } from "../../domain/ports/dossier-recipients.reader.js";
import { dossierAddresseesOf } from "../../domain/services/dossier-addressees.js";
import {
  type DossierResend,
  dossierResendsOf,
  lastReceivedOf,
} from "../../domain/services/dossier-resend-targets.js";
import {
  dossierUpdateSummaryDataOf,
  type PlanVersionSummary,
} from "../services/dossier-update-mail-data.js";
import { VersionDossierPaper } from "../services/version-dossier-paper.js";
import { ResendPlanVersionDossierCommand } from "./resend-plan-version-dossier.command.js";

/** Le geste, tel que le registre des intentions le nomme. */
const GESTURE = "production.dossier.resend";

/** Ce que la transaction du renvoi écrit pour une journée. */
interface ResendBatch {
  readonly day: ProductionDay;
  readonly version: number;
  readonly paper: PaperSlot;
  readonly resends: readonly DossierResend[];
  readonly summaries: ReadonlyMap<number, PlanVersionSummary>;
  readonly at: Date;
}

/**
 * **Renvoyer le dossier de la version courante**
 * (`documentation/fournil/plan-historique-des-tirages.md`, lot H6) — à une
 * ligne de la liste, ou à tous ceux qui ne sont pas à jour.
 *
 * Hors transaction : la journée, les destinataires et ce que chacun a reçu,
 * puis le papier de la version, rangé s'il ne l'est pas (le stockage est un
 * appel réseau), puis les résumés. Dans UNE transaction : pour chacun, la
 * trace (clé `(journée, instant du renvoi, ligne)`, version courante), la
 * demande d'e-mail (`mail.send`, la boîte d'envoi), la trace réglée
 * `requested`, et l'intention scellée. Une écriture annulée n'envoie rien ;
 * un rejeu de la même clé ne renvoie rien.
 *
 * Chacun lit ce qui a changé depuis SON papier : le résumé part de sa
 * dernière version reçue, ou de la première s'il n'en a reçu aucune.
 *
 * La clé de chaque e-mail dérive de la clé d'intention et de la ligne : deux
 * gestes distincts renvoient chacun, un même geste rejoué ne renvoie pas.
 *
 * @throws {NoPlanVersionToResendError} la journée n'a pas de version.
 * @throws {ProductionDayNotClosedError} la journée est rouverte.
 * @throws {DossierResendRecipientUnknownError} la ligne visée n'est plus servie.
 * @throws {DossierRecipientUpToDateError} la ligne visée a la version courante.
 * @throws {DossierPaperNotStoredError} le papier n'a pas pu être rangé.
 */
@CommandHandler(ResendPlanVersionDossierCommand)
export class ResendPlanVersionDossierHandler implements ICommandHandler<
  ResendPlanVersionDossierCommand,
  void
> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly recipients: DossierRecipientsReader,
    private readonly staff: StaffContacts,
    private readonly dispatches: DossierDispatchesReader,
    private readonly paper: VersionDossierPaper,
    private readonly summaries: PlanVersionSummaries,
    private readonly log: DossierDispatchLog,
    private readonly mail: Mail,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: ResendPlanVersionDossierCommand): Promise<void> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: GESTURE,
        subject: intentSubject(command.serviceDay, command.target),
      },
      NOTHING_TO_REPLAY,
      (seal) => this.resend(command, seal),
    );
  }

  private async resend(
    command: ResendPlanVersionDossierCommand,
    seal: (result: void) => Promise<void>,
  ): Promise<void> {
    const day = await this.days.load(ServiceDay.of(command.serviceDay));
    const version = day.planVersion;
    if (version === null) {
      throw new NoPlanVersionToResendError(command.serviceDay);
    }
    const resends = await this.resendsOf(command, version);
    if (resends.length === 0) {
      return;
    }
    const paper = await this.paper.storedOf(day, version);
    const summaries = await this.summaries.since(
      day.day,
      resends.map((resend) => resend.sinceVersion),
      version,
    );
    const batch: ResendBatch = {
      day,
      version,
      paper,
      resends,
      summaries,
      at: this.clock.now(),
    };
    await this.uow.run(async () => {
      for (const resend of batch.resends) {
        await this.request(batch, resend, command);
      }
      await seal();
    });
  }

  /** À qui renvoyer : la liste servie aujourd'hui, et ce que chacun a reçu. */
  private async resendsOf(
    command: ResendPlanVersionDossierCommand,
    version: number,
  ): Promise<readonly DossierResend[]> {
    const rows = await this.recipients.list();
    const [cards, traces] = await Promise.all([
      this.staff.contactsOf(rows.flatMap((row) => (row.kind === "staff" ? [row.staffUserId] : []))),
      this.dispatches.of(command.serviceDay),
    ]);
    return dossierResendsOf(
      command.target,
      dossierAddresseesOf(rows, cards),
      lastReceivedOf(traces),
      version,
    );
  }

  /** Un destinataire : pris, demandé, réglé `requested` — ou sauté s'il était déjà pris. */
  private async request(
    batch: ResendBatch,
    resend: DossierResend,
    command: ResendPlanVersionDossierCommand,
  ): Promise<void> {
    const { addressee } = resend;
    const serviceDay = batch.day.day.value;
    const slot = { serviceDay, occasionAt: batch.at, recipientId: addressee.recipientId };
    if (!(await this.log.claim(slot, addressee.name, batch.at, batch.version))) {
      return;
    }
    const summary = batch.summaries.get(resend.sinceVersion);
    if (summary === undefined) {
      throw new PlanVersionSummaryMissingError(serviceDay, resend.sinceVersion);
    }
    await this.mail.send({
      to: addressee.email,
      template: "staff.production-dossier-updated",
      data: {
        firstName: addressee.firstName,
        dayLabel: weekdayLongDate(serviceDay),
        version: batch.version,
        sinceVersion: resend.sinceVersion,
        received: resend.received,
        ...dossierUpdateSummaryDataOf(summary),
        pdfStored: { store: "production-documents", key: batch.paper.key },
        fileName: batch.paper.fileName.replace(/\.pdf$/u, `-version-${String(batch.version)}.pdf`),
      },
      // Une journée du fournil se nomme par son jour de service (`AAAA-MM-JJ`).
      subjects: [{ type: "production_day", id: serviceDay }],
      // La clé d'intention du geste, jamais l'adresse : un double clic ne double pas l'e-mail.
      idempotencyKey: `production-dossier-updated:${command.serviceDay}:${command.intentKey}:${resend.addressee.recipientId}`,
    });
    await this.log.settle(slot, { kind: "requested" }, batch.at);
  }
}
