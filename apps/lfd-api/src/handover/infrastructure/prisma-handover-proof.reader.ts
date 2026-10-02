import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import type { StoredDocument } from "../../platform/storage/document-store.js";
import { ProductionDocumentStore } from "../../platform/storage/production-document-store.js";
import { HandoverProofReader } from "../channels/commerce/handover-proof.reader.js";
import { HandoverProof } from "../domain/entities/handover-proof.js";
import { OrderHandover } from "../domain/entities/order-handover.js";
import { HandoverProofImageUnreadableError } from "../domain/errors/handover-proof-errors.js";
import {
  type HandoverProofExhibit,
  handoverProofExhibit,
} from "../domain/services/handover-proof-exhibit.js";
import {
  type HandoverProofPiece,
  handoverProofImageContentType,
} from "../domain/value-objects/handover-proof-image.js";
import { handoverViaOf } from "./handover-via.mapper.js";

/**
 * **Ce que le retrait montre au commerce de ses preuves de remise**
 * (`production.order_handover_proof`, `order_handover`, `order_departure`).
 *
 * Un adaptateur à part du dépôt qui grave (`PrismaHandoverProofRepository`) :
 * un écran de consultation ne dépend pas du port qui écrit des preuves (ISP).
 * Il lit aussi le stockage, parce que la clé ne doit pas sortir d'ici — c'est
 * la seule façon de garantir qu'une image servie est celle de CETTE commande.
 *
 * Rien n'est journalisé : nom et clés sont des données personnelles.
 */
@Injectable()
export class PrismaHandoverProofReader extends HandoverProofReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: ProductionDocumentStore,
  ) {
    super();
  }

  async ofOrder(orderId: string): Promise<HandoverProofExhibit | null> {
    const [handover, proof, departure] = await Promise.all([
      this.prisma.orderHandover.findUnique({ where: { orderId } }),
      this.prisma.orderHandoverProof.findUnique({ where: { orderId } }),
      this.prisma.orderDeparture.findUnique({ where: { orderId } }),
    ]);
    if (handover === null) {
      return null;
    }
    return handoverProofExhibit({
      handover: OrderHandover.rehydrate(
        handover.orderId,
        handover.reference,
        handover.handedOverAt,
        handover.handedOverBy,
        handoverViaOf(handover.handedOverVia),
      ),
      proof: proof === null ? null : HandoverProof.rehydrate(proof),
      departedWithRound: departure !== null && departure.returnedAt === null,
    });
  }

  async image(orderId: string, piece: HandoverProofPiece): Promise<StoredDocument | null> {
    const proof = await this.prisma.orderHandoverProof.findUnique({
      where: { orderId },
      select: { photoKey: true, signatureKey: true },
    });
    const key = proof === null ? null : piece === "photo" ? proof.photoKey : proof.signatureKey;
    if (key === null) {
      return null;
    }
    // Absente au stockage : une purge en cours retire les images AVANT la ligne.
    const bytes = await this.store.readIfPresent(key);
    if (bytes === null) {
      return null;
    }
    const contentType = handoverProofImageContentType(bytes);
    if (contentType === null) {
      throw new HandoverProofImageUnreadableError();
    }
    return { bytes, contentType };
  }
}
