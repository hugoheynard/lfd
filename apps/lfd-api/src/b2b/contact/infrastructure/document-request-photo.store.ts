import { Injectable } from "@nestjs/common";

import { DocumentStore } from "../../../platform/storage/document-store.js";
import { RequestPhotoStore, type RequestPhotoObject } from "../domain/ports/request-photo.store.js";

/**
 * Les photos de demandes dans le stockage des pièces — le port `DocumentStore`,
 * celui des photos d'étapes de livraison et des notes du commercial (relu le
 * 2026-10-09), parce qu'il SAIT supprimer.
 *
 * ⚠️ Le plan voulait le bucket `customers` (§7). Son port,
 * `CustomerDocumentStore`, n'a pas de `delete` par décision d'Hugo (on ne
 * supprime pas une pièce qu'un client peut nous opposer), et la purge RGPD
 * en exige un. Arbitrage remonté à Hugo ; le changer ne touche que cette
 * classe.
 */
@Injectable()
export class DocumentRequestPhotoStore extends RequestPhotoStore {
  constructor(private readonly store: DocumentStore) {
    super();
  }

  async save(key: string, photo: RequestPhotoObject): Promise<void> {
    await this.store.save(key, photo);
  }

  read(key: string): Promise<Buffer> {
    return this.store.read(key);
  }

  delete(key: string): Promise<void> {
    return this.store.delete(key);
  }
}
