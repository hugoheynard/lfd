import { Injectable } from "@nestjs/common";

import { Clock } from "../../../../platform/time/clock.js";
import { ExportReaderKeyLookup } from "../../domain/ports/export-reader-key.lookup.js";
import { hashExportKeySecret } from "../../domain/value-objects/export-key-secret.js";

/**
 * **Admettre un lecteur de l'export** à partir du secret présenté et de
 * l'adresse vue (plan de l'export des ventes, § 6.1, § 6.5).
 *
 * Rend l'id de la clé qui admet l'appel, ou `null` — sans dire pourquoi :
 * qui présente une clé n'a pas à apprendre si elle existe. Relit la base à
 * chaque appel (la révocation est immédiate) et n'écrit rien : une lecture
 * ne laisse pas de « dernière utilisation ».
 */
@Injectable()
export class ExportReaderAdmission {
  constructor(
    private readonly keys: ExportReaderKeyLookup,
    private readonly clock: Clock,
  ) {}

  async admit(secret: string, ip: string): Promise<string | null> {
    const key = await this.keys.findBySecretHash(hashExportKeySecret(secret));
    if (key === null || !key.admits(this.clock.now(), ip)) {
      return null;
    }
    return key.id;
  }
}
