import { createHash } from "node:crypto";

import { LEGAL_DOCUMENT_TITLES } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../platform/id/id-generator.js";
import { CustomerDocumentStore } from "../../../platform/storage/customer-document-store.js";
import { Clock } from "../../../platform/time/clock.js";
import { LegalDocumentFile } from "../domain/entities/legal-document-file.js";
import { LegalDocumentFileRepository } from "../domain/legal-document-file.repository.js";
import { LegalPdf } from "../domain/value-objects/legal-pdf.js";
import { DepositLegalDocumentFileCommand } from "./deposit-legal-document-file.command.js";

/**
 * Dépose un PDF de référence et rend **son identifiant** (plan
 * `legal/plan-cgv-par-audience.md`, C3, C3′).
 *
 * L'ordre compte : l'objet R2 d'abord, la ligne ensuite. Si la ligne échoue,
 * un objet reste sans ligne — inoffensif, aucune lecture ne le désigne, et on
 * ne le supprime pas : le port `customers` n'a pas de `delete`, et c'est voulu.
 * L'inverse — une ligne qui promettrait un objet absent — rendrait un
 * téléchargement en panne.
 *
 * 🔴 Jamais écrasé : la clé dérive de l'identifiant neuf, et le PDF remplacé
 * n'est que daté (`supersededAt`). La base refuse tout le reste.
 */
@CommandHandler(DepositLegalDocumentFileCommand)
export class DepositLegalDocumentFileHandler implements ICommandHandler<
  DepositLegalDocumentFileCommand,
  string
> {
  constructor(
    private readonly files: LegalDocumentFileRepository,
    private readonly store: CustomerDocumentStore,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(command: DepositLegalDocumentFileCommand): Promise<string> {
    const pdf = LegalPdf.create(command.bytes);
    const title = LEGAL_DOCUMENT_TITLES[command.document].fr;
    const now = this.clock.now();
    const replaced = await this.files.current(command.document);
    replaced?.supersede(now, title);
    const file = LegalDocumentFile.deposit({
      id: this.ids.next(),
      document: command.document,
      sha256: createHash("sha256").update(pdf.bytes).digest("hex"),
      sizeBytes: pdf.size,
      uploadedAt: now,
      uploadedByStaffId: command.staffUserId,
    });
    await this.store.save(file.storageKey, { bytes: pdf.bytes, contentType: "application/pdf" });
    await this.files.deposit(file, replaced, title);
    return file.id;
  }
}
