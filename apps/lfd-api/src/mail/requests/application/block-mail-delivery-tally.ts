import { Injectable } from "@nestjs/common";

import {
  type MailDeliveryFigures,
  MailDeliveryTally,
} from "../../../platform/mailer/delivery-tally/mail-delivery-tally.js";
import { MailProbeTemplates } from "../../sends/domain/ports/mail-probe-templates.js";
import { MailDeliveryCountsReader } from "../domain/ports/mail-delivery-counts.reader.js";

/**
 * Le décompte des retours que la carte de santé lit (T1b), servi par le bloc
 * sur le port que `platform` déclare. La sonde de déploiement n'y entre pas
 * (règle 10) : elle part à chaque déploiement et gonflerait « Envoyés ».
 */
@Injectable()
export class BlockMailDeliveryTally extends MailDeliveryTally {
  constructor(
    private readonly reader: MailDeliveryCountsReader,
    private readonly probes: MailProbeTemplates,
  ) {
    super();
  }

  async read(since: Date): Promise<MailDeliveryFigures> {
    const criteria = { since, exceptTemplates: this.probes.keys() };
    const [counts, rejections] = await Promise.all([
      this.reader.counts(criteria),
      this.reader.rejections(criteria),
    ]);
    return { ...counts, mostRejectedTemplate: rejections[0]?.template ?? null };
  }
}
