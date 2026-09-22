import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { LoginSubjectReader } from "../domain/ports/login-subject.reader.js";

/**
 * Adaptateur Prisma : **quel compte un sujet de connexion ouvre-t-il ?**
 *
 * La colonne est unique, d'où le `findUnique` : un sujet n'ouvre qu'un compte,
 * et c'est précisément ce qui rend le rattachement dangereux sans ce contrôle —
 * absorber chez le fournisseur une identité qui en ouvre déjà un autre rendrait
 * cet autre inatteignable.
 *
 * Seul l'identifiant **de chez nous** sort d'ici. Le sujet entre en paramètre
 * et n'est ni rendu, ni journalisé, ni interpolé dans un message.
 */
@Injectable()
export class PrismaLoginSubjectReader extends LoginSubjectReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findUserIdBySubject(subject: string): Promise<string | null> {
    const row = await this.prisma.user.findUnique({
      where: { auth0Sub: subject },
      select: { id: true },
    });
    return row?.id ?? null;
  }
}
