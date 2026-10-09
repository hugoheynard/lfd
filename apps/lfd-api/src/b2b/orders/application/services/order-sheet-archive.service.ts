import { Buffer } from "node:buffer";

import type { ClientSheet } from "@lfd/contracts";
import { Injectable, Logger } from "@nestjs/common";

import { DocumentStorageUnavailableError } from "../../../../platform/shared/errors/storage-errors.js";
import { CustomerDocumentStore } from "../../../../platform/storage/customer-document-store.js";
import { OrderMailOrigins } from "../../domain/ports/order-mail-origins.js";
import { OrderSheetLogoSource } from "../../domain/ports/order-sheet-logo.source.js";
import { handoverUrlOf } from "../../domain/services/handover-url.js";
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
 * ## À la passation, ou au premier téléchargement — réécrit le 2026-10-09
 *
 * Ce paragraphe disait « on écrit à la demande » : fabriquer à la passation
 * aurait produit un document par commande, que presque personne ne demande.
 * Le plan `documentation/order/plan-bon-public.md` (§2.4, §5, Hugo,
 * 2026-10-09) renverse la décision : le bon part **joint au courriel de
 * confirmation**, donc chaque commande en écrit un (~50 Ko, logo 16 Ko).
 * C'est l'expéditeur de `customer.order-placed` qui le demande ici ; le
 * téléchargement relit alors l'archive, ou la refabrique si le rangement avait
 * échoué.
 *
 * Deux demandes simultanées entrent toutes les deux dans la branche
 * « la clé manque » et écrivent toutes les deux — et le port du stockage dit
 * qu'« une même clé écrase ». **C'est sans conséquence à une condition, et elle
 * est tenue : le rendu est déterministe.** Deux rendus de la même révision
 * produisent les mêmes octets, le second `save` écrase le premier par un objet
 * identique, et peu importe qui gagne. Pas de verrou, rien à coordonner.
 */
@Injectable()
export class OrderSheetArchive {
  private readonly logger = new Logger(OrderSheetArchive.name);

  constructor(
    private readonly documents: CustomerDocumentStore,
    private readonly logo: OrderSheetLogoSource,
    private readonly origins: OrderMailOrigins,
  ) {}

  /**
   * L'archive de cette feuille, ou le rendu neuf — rangé au passage.
   *
   * `handoverToken` arrive À CÔTÉ de la feuille, jamais dedans : c'est le rendu
   * qui décide de le dessiner (retrait seulement).
   *
   * 🔴 Un bon de RETRAIT sans jeton n'est ni lu dans l'archive, ni archivé : le
   * jeton manque parce que la commande n'est pas réglée
   * (`exposedHandoverToken`), et archiver ce rendu figerait un bon sans QR que
   * l'accusé au paiement joindrait ensuite (plan
   * `documentation/order/plan-carte-reglee-avant-tout.md`, §2.5). Le
   * téléchargement avant paiement reste permis : il rend un bon sans QR,
   * fabriqué à chaque demande. Ne pas relire l'archive empêche aussi d'y
   * reprendre le QR d'une commande remboursée avant son retrait.
   *
   * @throws {OrderSheetLogoUnavailableError} le logo manque sur le disque.
   */
  async pdfOf(sheet: ClientSheet, handoverToken: string | null): Promise<OrderSheetPdf> {
    const key = orderSheetPdfKey(sheet);
    const fileName = orderSheetPdfFileName(sheet);

    if (awaitsItsQr(sheet, handoverToken)) {
      return { bytes: await this.render(sheet, handoverToken), fileName };
    }

    const archived = await this.readArchived(key);
    if (archived !== null) {
      return { bytes: archived, fileName };
    }

    const bytes = await this.render(sheet, handoverToken);
    await this.archive(key, bytes);
    return { bytes, fileName };
  }

  private async render(sheet: ClientSheet, handoverToken: string | null): Promise<Buffer> {
    return renderOrderSheetPdf(sheet, {
      logo: await this.logo.load(),
      handoverUrl: this.handoverUrlFor(sheet, handoverToken),
    });
  }

  /**
   * L'URL du QR — la même fabrique que les courriels. Un retrait avec jeton
   * mais sans origine admin rend un bon SANS QR, et ce bon est gelé : il n'en
   * aura jamais. Le journal le dit, pour qu'on sache pourquoi.
   */
  private handoverUrlFor(sheet: ClientSheet, handoverToken: string | null): string {
    const admin = this.origins.adminBaseUrl();
    if (sheet.fulfillment.method === "pickup" && handoverToken !== null && admin === null) {
      this.logger.warn(
        `Bon de commande ${sheet.reference} rendu sans QR de retrait : l'origine du back-office n'est pas configurée. Ce bon archivé n'en portera jamais.`,
      );
    }
    return handoverUrlOf(admin, handoverToken);
  }

  /**
   * L'archive si elle existe, `null` si elle n'existe pas **ou si le stockage
   * est en panne** — et la différence entre les deux est dans le journal.
   *
   * ⚠️ **Le `catch` est INDISPENSABLE et ne doit pas être retiré au nom de la
   * propreté** : `R2_CUSTOMERS_EU_*` peut être absent, et `readIfPresent` lève
   * alors. Sans lui, chaque téléchargement de bon rendrait 500 pour un défaut
   * de configuration qui ne regarde pas le client. Il est étroit — il ne
   * rattrape QUE l'indisponibilité du stockage, et l'adaptateur l'a déjà
   * journalisée en ERREUR avant de lever.
   *
   * 🔴 **Ce n'était pas une hypothèse : les quatre noms étaient ABSENTS de la
   * production** — ni secrets, ni variables — jusqu'au 2026-09-21, où la
   * vérification les a nommés un par un. Aucun bon n'a donc jamais été archivé,
   * et chaque téléchargement le refabriquait. Le bucket `lfc-customers-eu` a
   * été créé dans la foulée ; le `catch` reste, parce que l'absence redevient
   * possible au prochain déploiement mal configuré.
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

/**
 * Un bon de retrait dont le QR manque parce que le jeton n'est pas montrable —
 * cf. {@link OrderSheetArchive.pdfOf}. Une livraison ne porte jamais de QR :
 * son bon s'archive comme avant.
 */
function awaitsItsQr(sheet: ClientSheet, handoverToken: string | null): boolean {
  return sheet.fulfillment.method === "pickup" && handoverToken === null;
}
