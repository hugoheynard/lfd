import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PrincipalStampReader } from "../domain/ports/principal-stamp.reader.js";

/** L'identifiant de l'unique ligne de `principal_stamp` (migration `20261104120000`). */
export const PRINCIPAL_STAMP_ROW = 1;

/**
 * Lit la ligne unique de `public.principal_stamp`. Aucun code ne l'écrit :
 * trois déclencheurs d'instruction la font monter
 * (`20261104120000_l_estampille_du_principal`).
 */
@Injectable()
export class PrismaPrincipalStampReader extends PrincipalStampReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async read(): Promise<bigint | null> {
    const row = await this.prisma.principalStamp.findUnique({
      where: { id: PRINCIPAL_STAMP_ROW },
      select: { value: true },
    });
    return row?.value ?? null;
  }
}
