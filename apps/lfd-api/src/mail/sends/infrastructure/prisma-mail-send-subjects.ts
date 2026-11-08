import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { MailSendSubjects, type MailSendSubject } from "../domain/ports/mail-send-subjects.js";

/** Le modèle et l'espace d'un envoi — sans son adresse. */
@Injectable()
export class PrismaMailSendSubjects extends MailSendSubjects {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async subjectOf(sendId: string): Promise<MailSendSubject | null> {
    const row = await this.prisma.mailRequest.findUnique({
      where: { id: sendId },
      select: { template: true, brand: true },
    });
    return row === null ? null : { template: row.template, space: row.brand };
  }
}
