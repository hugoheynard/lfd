import { Injectable } from "@nestjs/common";
import { S3StorageService } from "@lfd/storage";

import { AppConfig } from "../../infra/config/app-config.js";
import { KbisStorageUnavailableError } from "../domain/errors/account-errors.js";
import { KbisStore } from "../domain/ports/kbis-store.js";
import type { KbisFile } from "../domain/value-objects/kbis-file.js";

/**
 * Adaptateur **R2/S3** du stockage KBIS (`@lfd/storage`).
 *
 * Le service S3 n'est construit que si le bucket est configuré ; sinon
 * `service()` refuse **clairement** plutôt que d'échouer sur une erreur AWS
 * obscure. Le reste de l'app démarre sans stockage — seul le KBIS est
 * indisponible (cf. `AppConfig.storageConfig`).
 *
 * Convention de clé **ancrée sur l'entreprise** : `companies/{id}/kbis.pdf`. Un
 * KBIS par entreprise, la clé ne vient JAMAIS du client — le mur de tenancy est
 * dans le chemin, un dépôt ne peut pas écrire hors de son entreprise, et un
 * remplacement écrase à la même clé.
 */
@Injectable()
export class S3KbisStore extends KbisStore {
  private cached: S3StorageService | null = null;

  constructor(private readonly config: AppConfig) {
    super();
  }

  async save(companyId: string, file: KbisFile): Promise<string> {
    const key = keyFor(companyId);
    await this.service().upload(key, file.bytes, file.contentType);
    return key;
  }

  read(storageKey: string): Promise<Buffer> {
    return this.service().downloadToBuffer(storageKey);
  }

  /** Le service S3, construit à la demande, ou un refus explicite si non configuré. */
  private service(): S3StorageService {
    if (this.cached !== null) {
      return this.cached;
    }
    const config = this.config.storageConfig();
    if (config === null) {
      throw new KbisStorageUnavailableError(
        "Le stockage des KBIS n'est pas configuré (STORAGE_BUCKET / STORAGE_ACCESS_KEY_ID / STORAGE_SECRET_ACCESS_KEY).",
      );
    }
    this.cached = new S3StorageService(config);
    return this.cached;
  }
}

/** Clé de stockage d'un KBIS — ancrée sur l'entreprise, jamais sur une entrée client. */
function keyFor(companyId: string): string {
  return `companies/${companyId}/kbis.pdf`;
}
