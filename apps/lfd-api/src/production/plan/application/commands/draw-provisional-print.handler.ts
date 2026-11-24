import type { Buffer } from "node:buffer";

import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { ProductionDocumentStore } from "../../../../platform/storage/production-document-store.js";
import { Clock } from "../../../../platform/time/clock.js";
import { ServiceDay } from "../../../day/index.js";
import {
  type ProvisionalChoice,
  ProvisionalPrint,
  plainChoiceOf,
  provisionalPdfKey,
} from "../../domain/entities/provisional-print.js";
import { ProvisionalRunContendedError } from "../../domain/errors/provisional-print-errors.js";
import { ProvisionalPrintLedger } from "../../domain/ports/provisional-print.ledger.js";
import { ProductionPaperRenderer } from "../services/production-paper.service.js";
import {
  type ProvisionalIntake,
  ProvisionalPrintIntake,
} from "../services/provisional-print-intake.js";
import { DrawProvisionalPrintCommand } from "./draw-provisional-print.command.js";

/** Combien de fois un tirage reprend au numéro suivant avant de renoncer. */
const RUN_ATTEMPTS = 5;

/**
 * **Tire une impression provisoire du dossier** (plan
 * `documentation/fournil/plan-impression-provisoire.md`, § 2 et § 4).
 *
 * Une fois par intention : un double clic ne tire pas deux numéros, et le
 * rejeu rend le même identifiant. Le numéro est `max(run) + 1` ; l'unicité
 * (journée, numéro) arbitre deux tirages simultanés, et le perdant reprend au
 * suivant — il redessine, puisque le numéro est imprimé sur chaque page.
 *
 * La ligne s'écrit AVANT le fichier : c'est elle qui réserve le numéro, si
 * bien que deux tirages ne rangent jamais sous la même clé. Le PDF se range
 * ensuite, hors de toute transaction (le stockage est un appel réseau). S'il
 * échoue, l'erreur remonte et la ligne reste sans fichier : la requête du PDF
 * le dit, et on tire une nouvelle impression — le PDF ne se refait pas des
 * commandes en direct, qui ont pu bouger depuis les empreintes gardées.
 *
 * @sans-journal une impression n'est pas un fait métier : rien ne change au
 * plan ni aux commandes, et la ligne elle-même dit qui a tiré quoi, quand.
 *
 * @throws {ProvisionalPrintOfArrestedDayError} le plan est arrêté.
 * @throws {ProvisionalRunUnknownError} @throws {NothingChangedSinceRunError}
 * @throws {DossierSelectionUnknownError} @throws {ProvisionalRunContendedError}
 */
@CommandHandler(DrawProvisionalPrintCommand)
export class DrawProvisionalPrintHandler implements ICommandHandler<
  DrawProvisionalPrintCommand,
  string
> {
  constructor(
    private readonly intake: ProvisionalPrintIntake,
    private readonly renderer: ProductionPaperRenderer,
    private readonly ledger: ProvisionalPrintLedger,
    private readonly documents: ProductionDocumentStore,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: DrawProvisionalPrintCommand): Promise<string> {
    const day = ServiceDay.of(command.serviceDay);
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "production.dossier.provisional_print",
        subject: intentSubject(day.value, plainChoiceOf(command.choice)),
      },
      CREATED_ID_REPLAY,
      async (seal) => {
        const intake = await this.intake.read(day, command.choice);
        const id = this.ids.next();
        for (let attempt = 0; attempt < RUN_ATTEMPTS; attempt += 1) {
          const drawn = await this.drawn(day, intake, {
            id,
            by: command.staffUserId,
            choice: command.choice,
          });
          const recorded = await this.uow.run(async () => {
            const written = await this.ledger.record(drawn.print);
            if (written) {
              await seal(id);
            }
            return written;
          });
          if (recorded) {
            const key = provisionalPdfKey(day.value, drawn.print.state.run);
            await this.documents.save(key, { bytes: drawn.bytes, contentType: "application/pdf" });
            return id;
          }
        }
        throw new ProvisionalRunContendedError(day.value);
      },
    );
  }

  /** Le tirage sous le prochain numéro libre : la ligne et ses octets. */
  private async drawn(
    day: ServiceDay,
    intake: ProvisionalIntake,
    who: { readonly id: string; readonly by: string; readonly choice: ProvisionalChoice },
  ): Promise<{ readonly print: ProvisionalPrint; readonly bytes: Buffer }> {
    const run = ProvisionalPrint.nextRunAfter(await this.ledger.lastRunOf(day));
    const printedAt = this.clock.now();
    const bytes = await this.renderer.provisionalOf(
      intake.content,
      { run, printedAt },
      intake.selection,
    );
    const print = ProvisionalPrint.drawn({
      id: who.id,
      serviceDay: day.value,
      run,
      commerceVersion: intake.commerceVersion,
      printedAt,
      printedBy: who.by,
      orderFingerprints: intake.fingerprints,
      choice: who.choice,
    });
    return { print, bytes };
  }
}
