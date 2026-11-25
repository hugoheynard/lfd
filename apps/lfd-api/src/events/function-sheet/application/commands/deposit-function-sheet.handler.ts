import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { ProductionDocumentStore } from "../../../../platform/storage/production-document-store.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { Event } from "../../../event/domain/entities/event.js";
import type { FunctionSheet } from "../../../event/domain/entities/function-sheet.js";
import { EventNotFoundError } from "../../../event/domain/errors/event-errors.js";
import { EventRepository } from "../../../event/domain/ports/event.repository.js";
import { FunctionSheetPdf } from "../../../event/domain/value-objects/function-sheet-pdf.js";
import { DepositFunctionSheetCommand } from "./deposit-function-sheet.command.js";

const logger = new Logger("DepositFunctionSheet");

/**
 * **Le dépôt d'une fiche de fonction** — rend son identifiant.
 *
 * L'agrégat d'abord, le stockage ensuite, la ligne enfin. L'agrégat refuse
 * AVANT qu'un octet parte au stockage (un événement archivé, un fichier qui
 * n'est pas un PDF). Le stockage ne vit pas dans la transaction : un appel
 * réseau n'y a pas sa place. Si la ligne échoue après le rangement, l'objet
 * se retire ici même ; si ce retrait échoue aussi, il reste orphelin sous
 * `events/` et le journal le dit.
 *
 * **Une fois par intention** : la clé est scellée avec la ligne ; un envoi
 * rejoué rend le même identifiant sans rien ranger de plus.
 *
 * @sans-journal le bloc des événements n'a pas de journal : l'auteur et
 * l'heure du dépôt sont gardés sur la fiche (`uploaded_by`, `uploaded_at`).
 * @hors-transaction le rangement au stockage est un appel réseau.
 */
@CommandHandler(DepositFunctionSheetCommand)
export class DepositFunctionSheetHandler implements ICommandHandler<
  DepositFunctionSheetCommand,
  string
> {
  constructor(
    private readonly events: EventRepository,
    private readonly store: ProductionDocumentStore,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: DepositFunctionSheetCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "events.function_sheet.deposit",
        subject: intentSubject("function-sheet", command.eventId, command.bytes),
      },
      CREATED_ID_REPLAY,
      (seal) => this.deposit(command, seal),
    );
  }

  private async deposit(
    command: DepositFunctionSheetCommand,
    seal: (id: string) => Promise<void>,
  ): Promise<string> {
    const pdf = FunctionSheetPdf.create({
      bytes: command.bytes,
      fileName: command.fileName,
      declaredContentType: command.declaredContentType,
    });
    const event = await this.loadEvent(command.eventId);
    const sheet = event.depositSheet({
      sheetId: this.ids.next(),
      pdf,
      uploadedBy: command.staffUserId,
      at: this.clock.now(),
    });
    await this.store.save(sheet.storageKey, { bytes: pdf.bytes, contentType: pdf.contentType });
    try {
      await this.uow.run(async () => {
        await this.events.save(event);
        await seal(sheet.id);
      });
    } catch (error) {
      await this.forget(sheet);
      throw error;
    }
    return sheet.id;
  }

  private async loadEvent(eventId: string): Promise<Event> {
    const event = await this.events.load(eventId);
    if (event === null) {
      throw new EventNotFoundError(eventId);
    }
    return event;
  }

  private async forget(sheet: FunctionSheet): Promise<void> {
    await this.store.delete(sheet.storageKey).catch((cause: unknown) => {
      logger.warn(`Fiche ${sheet.id} orpheline au stockage : ${String(cause)}`);
    });
  }
}
