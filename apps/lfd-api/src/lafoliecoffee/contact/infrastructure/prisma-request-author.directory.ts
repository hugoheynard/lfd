import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { RequestAuthor } from "../domain/customer-request.js";
import { RequestAuthorDirectory } from "../domain/ports/request-author.directory.js";

/**
 * Adaptateur Prisma : le nom, l'e-mail et le téléphone du COMPTE. Un compte
 * sans prénom ni nom est nommé par son e-mail plutôt que par une valeur
 * inventée — l'agrégat refuserait un nom vide.
 */
@Injectable()
export class PrismaRequestAuthorDirectory extends RequestAuthorDirectory {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async of(userId: string): Promise<RequestAuthor | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, email: true, phone: true },
    });
    if (user === null) {
      return null;
    }
    const name = `${user.firstName} ${user.lastName}`.trim();
    return { name: name === "" ? user.email : name, email: user.email, phone: user.phone };
  }
}
