import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { DocumentStore } from "../../../../platform/storage/document-store.js";
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
    private readonly documents: DocumentStore,
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

    const archived = await this.readOrNull(key);
    if (archived !== null) {
      return { bytes: archived, fileName };
    }

    const bytes = renderOrderSheetPdf(sheet);
    await this.archive(key, bytes);
    return { bytes, fileName };
  }

  /** Une pièce absente et un stockage muet se traitent pareil : on refabrique. */
  private async readOrNull(key: string): Promise<Buffer | null> {
    try {
      return await this.documents.read(key);
    } catch {
      return null;
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
