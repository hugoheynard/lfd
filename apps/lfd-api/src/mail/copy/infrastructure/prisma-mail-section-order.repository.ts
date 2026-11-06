import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { MailSectionOrderRepository } from "../domain/ports/mail-section-order.repository.js";
import { MailSectionOrderChangedError } from "../domain/mail-copy-errors.js";
import { MailSectionOrder } from "../domain/mail-section-order.js";
import { toOrderColumns, toOrderState } from "./mail-section-order-rows.js";

/**
 * Adaptateur Prisma de l'ordre des sections d'un e-mail. Même verrou que les
 * textes, en un seul ordre SQL par cas : création sans doublon à la révision
 * 0, sinon mise à jour sur `revision = chargée`.
 */
@Injectable()
export class PrismaMailSectionOrderRepository extends MailSectionOrderRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(mail: string): Promise<MailSectionOrder> {
    const row = await this.prisma.mailSectionOrderEntry.findUnique({ where: { mail } });
    return row === null
      ? MailSectionOrder.untouched(mail)
      : MailSectionOrder.reconstitute(toOrderState(row));
  }

  async save(order: MailSectionOrder): Promise<void> {
    const state = order.snapshot();
    const loaded = state.revision - 1;
    const columns = toOrderColumns(state);
    const written =
      loaded === 0
        ? await this.prisma.mailSectionOrderEntry.createMany({
            data: [{ mail: state.mail, ...columns }],
            skipDuplicates: true,
          })
        : await this.prisma.mailSectionOrderEntry.updateMany({
            where: { mail: state.mail, revision: loaded },
            data: columns,
          });
    if (written.count === 0) {
      throw new MailSectionOrderChangedError(state.mail);
    }
  }
}
