import { Injectable } from "@nestjs/common";

import type { ProductionDay } from "../../../day/index.js";
import { ProductionPaperArchive, type PaperSlot } from "../../../shared/print/index.js";
import { DossierPaperNotStoredError } from "../../domain/errors/dossier-resend-errors.js";
import { ProductionPaperRenderer, dayDossierSlotOf } from "./production-paper.service.js";

/**
 * **Le dossier de la version courante, rangé** — l'exemplaire que l'e-mail
 * du renvoi joint par référence (`plan-historique-des-tirages.md`, lot H6 ;
 * porte `lint:mail-attachment-by-reference`). Déjà rangé, il sert tel quel ;
 * sinon il est fabriqué depuis la journée chargée (état `n`, clé `n`) et
 * rangé. Hors transaction : le stockage est un appel réseau.
 *
 * Un papier qui ne peut pas être rangé — une lecture du dossier n'a pas
 * répondu (`archivable` faux), ou le rangement a échoué — refuse le geste :
 * on ne joint jamais un papier qu'on ne pourrait pas relire.
 */
@Injectable()
export class VersionDossierPaper {
  constructor(
    private readonly renderer: ProductionPaperRenderer,
    private readonly archive: ProductionPaperArchive,
  ) {}

  /**
   * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
   * @throws {DossierPaperNotStoredError} le papier n'a pas pu être rangé.
   */
  async storedOf(day: ProductionDay, version: number): Promise<PaperSlot> {
    const slot = dayDossierSlotOf(day);
    if (await this.archive.isArchived(slot.key)) {
      return slot;
    }
    const draft = await this.renderer.dossierOf(day);
    if (!draft.archivable) {
      throw new DossierPaperNotStoredError(day.day.value, version);
    }
    await this.archive.storedOr(slot, () => Promise.resolve(draft));
    if (!(await this.archive.isArchived(slot.key))) {
      throw new DossierPaperNotStoredError(day.day.value, version);
    }
    return slot;
  }
}
