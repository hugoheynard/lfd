import { Buffer } from "node:buffer";

import type { ClientSheet } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { DocumentStorageUnavailableError } from "../../../../platform/shared/errors/storage-errors.js";
import { CustomerDocumentStore } from "../../../../platform/storage/customer-document-store.js";
import {
  orderSheetPdfFileName,
  orderSheetPdfKey,
  renderOrderSheetPdf,
} from "../../domain/services/order-sheet-pdf.js";

/** Le fichier servi : ses octets et le nom qu'on proposera au téléchargement. */
export interface OrderSheetPdf {
  readonly bytes: Buffer;
  readonly fileName: string;
}

/**
 * **Le bon de commande en PDF : le relire s'il existe, le fabriquer sinon.**
 *
 * ## Pourquoi c'est un service et non du code de handler
 *
 * Deux surfaces servent ce document — le client, derrière le mur de sa société ;
 * le staff, derrière le mur du back-office. Ce qui les distingue est **qui a le
 * droit de le lire**, et rien d'autre : c'est le même document, sous la **même
 * clé**, avec la même archive.
 *
 * Le dupliquer aurait laissé deux chemins écrire sous la même clé avec des
 * règles qui divergeraient au premier changement — et l'un des deux aurait fini
 * par archiver ce que l'autre relit.
 *
 * ⚠️ Il n'y a **pas de version staff** du bon, sur décision explicite : le
 * document qu'on discute au téléphone doit être celui que le client a sous les
 * yeux. Un exemplaire enrichi côté bureau ferait parler de deux papiers.
 *
 * ## Pourquoi ranger, plutôt que rendre à chaque fois
 *
 * Le papier qui est parti du comptoir est un **fait**, au même titre qu'un prix
 * figé sur une ligne. Un avenant appliqué le lendemain, un libellé corrigé, un
 * taux rectifié : recalculer donnerait un PDF qui ne ressemble plus à celui que
 * le client a dans la poche — et c'est exactement la situation où il appelle.
 *
 * ## Pourquoi au premier téléchargement, et pourquoi la course est inoffensive
 *
 * Fabriquer à la passation produirait un document pour chaque commande, dont
 * l'immense majorité ne sera jamais demandée. On écrit donc à la demande.
 *
 * Deux téléchargements simultanés entrent alors tous les deux dans la branche
 * « la clé manque » et écrivent tous les deux — et le port du stockage dit
 * qu'« une même clé écrase ». **C'est sans conséquence à une condition, et elle
 * est tenue : le rendu est déterministe.** Deux rendus de la même révision
 * produisent les mêmes octets, le second `save` écrase le premier par un objet
 * identique, et peu importe qui gagne. Pas de verrou, rien à coordonner.
 */
@Injectable()
export class OrderSheetArchive {
  constructor(private readonly documents: CustomerDocumentStore) {}

  /** L'archive de cette feuille, ou le rendu neuf — rangé au passage. */
  async pdfOf(sheet: ClientSheet): Promise<OrderSheetPdf> {
    const key = orderSheetPdfKey(sheet);
    const fileName = orderSheetPdfFileName(sheet);

    const archived = await this.readArchived(key);
    if (archived !== null) {
      return { bytes: archived, fileName };
    }

    const bytes = await renderOrderSheetPdf(sheet);
    await this.archive(key, bytes);
    return { bytes, fileName };
  }

  /**
   * L'archive si elle existe, `null` si elle n'existe pas **ou si le stockage
   * est en panne** — et la différence entre les deux est dans le journal.
   *
   * ⚠️ Le `catch` est INDISPENSABLE et ne doit pas être retiré au nom de la
   * propreté : `R2_CUSTOMERS_*` peut être absent — c'est le cas en production à
   * ce jour — et `readIfPresent` lève alors. Sans lui, chaque téléchargement de
   * bon rendrait 500 pour un défaut de configuration qui ne regarde pas le
   * client. Il est étroit — il ne rattrape QUE l'indisponibilité du stockage, et
   * l'adaptateur l'a déjà journalisée en ERREUR avant de lever.
   */
  private async readArchived(key: string): Promise<Buffer | null> {
    try {
      return await this.documents.readIfPresent(key);
    } catch (error) {
      if (error instanceof DocumentStorageUnavailableError) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Le rangement est **best-effort** : un R2 en panne ne doit pas empêcher un
   * client de télécharger son bon. On lui rend les octets qu'on vient de
   * fabriquer, et le rangement retentera au téléchargement suivant. L'inverse —
   * refuser le document parce qu'on n'a pas su l'archiver — ferait payer au
   * client une panne qui ne le regarde pas.
   */
  private async archive(key: string, bytes: Buffer): Promise<void> {
    try {
      await this.documents.save(key, { bytes, contentType: "application/pdf" });
    } catch {
      // Silence volontaire : le prochain téléchargement retentera, et le
      // demandeur a déjà son document. L'échec, lui, a été journalisé par
      // l'adaptateur avant d'arriver ici.
    }
  }
}
