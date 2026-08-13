import { Injectable } from "@nestjs/common";
import { S3StorageService } from "@lfd/storage";

import { DocumentStorageUnavailableError } from "../../shared/errors/storage-errors.js";
import { AppConfig } from "../config/app-config.js";
import { DocumentStore, type StoredDocument } from "./document-store.js";

/**
 * Adaptateur **R2/S3** du stockage de pièces (`@lfd/storage`).
 *
 * Le service S3 n'est construit qu'à la première pièce, et seulement si le
 * bucket est configuré ; sinon `service()` refuse **clairement** plutôt que
 * d'échouer sur une erreur AWS obscure. Le reste de l'app démarre sans stockage
 * — seules les pièces sont indisponibles (cf. `AppConfig.storageConfig`).
 */
@Injectable()
export class S3DocumentStore extends DocumentStore {
  private cached: S3StorageService | null = null;

  constructor(private readonly config: AppConfig) {
    super();
  }

  async save(key: string, document: StoredDocument): Promise<string> {
    await this.service().upload(key, document.bytes, document.contentType);
    return key;
  }

  read(key: string): Promise<Buffer> {
    return this.service().downloadToBuffer(key);
  }

  /** Le service S3, construit à la demande, ou un refus explicite si non configuré. */
  private service(): S3StorageService {
    if (this.cached !== null) {
      return this.cached;
    }
    const config = this.config.r2Storage("kbis");
    if (config === null) {
      throw new DocumentStorageUnavailableError(
        "Le stockage des pièces n'est pas configuré (R2_KBIS_BUCKET / R2_KBIS_ACCESS_KEY_ID / R2_KBIS_SECRET_ACCESS_KEY).",
      );
    }
    this.cached = new S3StorageService(config);
    return this.cached;
  }
}
