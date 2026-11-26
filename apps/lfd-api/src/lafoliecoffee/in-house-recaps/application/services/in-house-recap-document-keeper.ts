import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { CustomerDocumentStore } from "../../../../platform/storage/customer-document-store.js";
import { CompanyNameReader } from "../../../account/domain/ports/company-name.reader.js";
import type { InHouseRecap } from "../../domain/entities/in-house-recap.js";
import {
  InHouseRecapNotFoundError,
  RecapPayerMissingError,
} from "../../domain/errors/in-house-recap-errors.js";
import { InHouseRecapRepository } from "../../domain/ports/in-house-recap.repository.js";
import { ReplacedRecapReader } from "../../domain/ports/replaced-recap.reader.js";
import {
  inHouseRecapDocumentKey,
  inHouseRecapFileName,
  renderInHouseRecapPdf,
} from "../../domain/services/in-house-recap-pdf.js";

/** Le document d'un récapitulatif, tel que l'e-mail le joint : rangé, désigné par sa clé. */
export interface KeptRecapDocument {
  readonly recapId: string;
  readonly payerId: string;
  readonly number: string;
  readonly month: string;
  readonly payerName: string;
  readonly replacesNumber: string | null;
  readonly fileName: string;
  /** La clé au stockage des pièces client. */
  readonly key: string;
}

/**
 * **Rend et range le PDF d'un récapitulatif, une fois** (D10) :
 * `in-house-recaps/<payeur>/<numéro>.pdf`. Un récapitulatif dont la clé est
 * posée n'est pas rendu à nouveau : son fichier est celui qui est parti.
 *
 * Le dépôt au stockage se fait HORS de toute transaction (un appel réseau) ;
 * la clé s'écrit ensuite par l'agrégat (`recordDocument`), dans la sienne.
 *
 * @throws {InHouseRecapNotFoundError} le récapitulatif n'existe pas.
 * @throws {RecapPayerMissingError} son payeur est introuvable.
 */
@Injectable()
export class InHouseRecapDocumentKeeper {
  constructor(
    private readonly recaps: InHouseRecapRepository,
    private readonly names: CompanyNameReader,
    private readonly replaced: ReplacedRecapReader,
    private readonly store: CustomerDocumentStore,
    private readonly uow: UnitOfWork,
  ) {}

  async ensure(recapId: string): Promise<KeptRecapDocument> {
    const recap = await this.recaps.load(recapId);
    if (recap === null) {
      throw new InHouseRecapNotFoundError(recapId);
    }
    const payerName = await this.names.nameOf(recap.payerId);
    if (payerName === null) {
      throw new RecapPayerMissingError(recap.number);
    }
    const document: KeptRecapDocument = {
      recapId: recap.id,
      payerId: recap.payerId,
      number: recap.number,
      month: recap.month.key,
      payerName,
      replacesNumber: await this.replaced.numberReplacedBy(recap.id),
      fileName: inHouseRecapFileName(recap.number),
      key: inHouseRecapDocumentKey(recap),
    };
    if (recap.storageKey === null) {
      await this.keep(recap, document);
    }
    return document;
  }

  private async keep(recap: InHouseRecap, document: KeptRecapDocument): Promise<void> {
    const state = recap.toState();
    const bytes = await renderInHouseRecapPdf({
      number: state.number,
      payerName: document.payerName,
      month: state.month.key,
      issuedAt: state.issuedAt,
      replacesNumber: document.replacesNumber,
      lines: state.lines,
      notes: state.notes,
    });
    await this.store.save(document.key, { bytes, contentType: "application/pdf" });
    await this.uow.run(async () => {
      const fresh = await this.recaps.load(recap.id);
      if (fresh !== null && fresh.recordDocument(document.key)) {
        await this.recaps.saveDocument(fresh);
      }
    });
  }
}
