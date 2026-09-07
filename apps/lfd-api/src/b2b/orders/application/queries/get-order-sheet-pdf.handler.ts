import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { DocumentStorageUnavailableError } from "../../../../platform/shared/errors/storage-errors.js";
import { CustomerDocumentStore } from "../../../../platform/storage/customer-document-store.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { ensureOrderVisible } from "../../domain/services/order-access.js";
import {
  orderSheetPdfFileName,
  orderSheetPdfKey,
  renderOrderSheetPdf,
} from "../../domain/services/order-sheet-pdf.js";
import { clientSheetOf } from "../../domain/services/order-sheet.js";
import { GetOrderSheetPdfQuery } from "./get-order-sheet-pdf.query.js";

/** Le fichier servi : ses octets et le nom qu'on proposera au téléchargement. */
export interface OrderSheetPdf {
  readonly bytes: Buffer;
  readonly fileName: string;
}

/**
 * Sert le bon de commande en PDF — **et le range au premier téléchargement**.
 *
 * ## Pourquoi ranger, plutôt que rendre à chaque fois
 *
 * Le papier qui est parti du comptoir est un **fait**, au même titre qu'un prix
 * figé sur une ligne. Un avenant appliqué le lendemain, un libellé corrigé, un
 * taux rectifié : recalculer donnerait un PDF qui ne ressemble plus à celui que
 * le client a dans la poche — et c'est exactement la situation où il appelle.
 * Les octets rangés sont donc rendus tels quels, à jamais.
 *
 * ## Pourquoi au premier téléchargement, et pourquoi la course est inoffensive
 *
 * Fabriquer à la passation produirait un document pour chaque commande, dont
 * l'immense majorité ne sera jamais demandée. On écrit donc à la demande.
 *
 * Deux onglets simultanés entrent alors tous les deux dans la branche « la clé
 * manque » et écrivent tous les deux — et le port du stockage dit qu'« une même
 * clé écrase ». **C'est sans conséquence à une condition, et elle est tenue :
 * le rendu est déterministe.** Deux rendus de la même révision produisent les
 * mêmes octets, le second `save` écrase le premier par un objet identique, et
 * peu importe qui gagne. Pas de verrou, pas de réservation, rien à coordonner.
 *
 * ## Dans quel bucket
 *
 * `CustomerDocumentStore`, et pas `DocumentStore` : le second sert les pièces
 * que le CLIENT nous remet (KBIS, mandat), avec **ses propres clés**. Écrire un
 * bon de commande là-dedans défaisait l'isolation que la configuration
 * établit — « un jeton n'ouvre que le sien ». C'est ce que faisait la première
 * version de ce handler, faute d'avoir vérifié quel bucket le port ouvrait.
 *
 * ## Une pièce absente n'est pas une panne
 *
 * 🔴 Ce handler enveloppait `read` dans un `catch` qui rendait `null` — « une
 * pièce absente et un stockage muet se traitent pareil : on refabrique ». C'était
 * faux deux fois. L'absence est le cas COURANT (rien n'est archivé avant le
 * premier téléchargement), donc chaque premier passage journalisait une erreur
 * pour un chemin sain. Et surtout ce `catch` avalait les VRAIES pannes : bucket
 * mal nommé, clé refusée, signature invalide devenaient « pas encore archivé »,
 * et l'API refabriquait en silence pour toujours — le symptôme d'un stockage
 * cassé était l'absence de symptôme.
 *
 * `readIfPresent` rend l'absence comme une **réponse** (`null`, sans journal) et
 * laisse la panne lever. Ce handler rattrape cette panne — un client ne doit pas
 * payer un secret manquant — mais elle est journalisée en ERREUR par
 * l'adaptateur avant d'arriver ici, donc elle se voit. C'est toute la différence
 * avec l'ancien `catch` muet.
 *
 * ## Ce qu'un stockage indisponible ne doit pas coûter
 *
 * Le rangement est **best-effort**. Un R2 en panne ne doit pas empêcher un
 * client de télécharger son bon : on lui rend les octets qu'on vient de
 * fabriquer, et le rangement retentera au téléchargement suivant. L'inverse —
 * refuser le document parce qu'on n'a pas su l'archiver — ferait payer au client
 * une panne qui ne le regarde pas.
 */
@QueryHandler(GetOrderSheetPdfQuery)
export class GetOrderSheetPdfHandler implements IQueryHandler<
  GetOrderSheetPdfQuery,
  OrderSheetPdf
> {
  constructor(
    private readonly guard: OrderGuardReader,
    private readonly orders: OrderReader,
    private readonly documents: CustomerDocumentStore,
  ) {}

  async execute(query: GetOrderSheetPdfQuery): Promise<OrderSheetPdf> {
    const owned = await this.orders.findById(query.orderId);
    if (owned === null) {
      throw new OrderNotFoundError(query.orderId);
    }
    const role =
      owned.companyId === null ? null : await this.guard.roleOf(query.actorUserId, owned.companyId);
    ensureOrderVisible(owned, query.actorUserId, role, query.orderId);

    const sheet = clientSheetOf(owned.view);
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
   * est en panne** — et la différence entre les deux est désormais dans le
   * journal, pas seulement dans le code.
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

  /** Le rangement ne fait pas échouer le téléchargement — cf. l'en-tête. */
  private async archive(key: string, bytes: Buffer): Promise<void> {
    try {
      await this.documents.save(key, { bytes, contentType: "application/pdf" });
    } catch {
      // Silence volontaire : le prochain téléchargement retentera, et le client
      // a déjà son document.
    }
  }
}
