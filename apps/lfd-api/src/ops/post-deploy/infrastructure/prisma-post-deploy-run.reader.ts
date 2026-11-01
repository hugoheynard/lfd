import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { PostDeployRunSnapshot } from "../domain/post-deploy-run.js";
import { PostDeployRunReader } from "../domain/post-deploy-run.reader.js";
import { toSnapshot } from "./post-deploy-run.rows.js";

/** La lecture des passages pour l'écran. */
@Injectable()
export class PrismaPostDeployRunReader extends PostDeployRunReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async latestOf(
    operationKeys: readonly string[],
  ): Promise<ReadonlyMap<string, PostDeployRunSnapshot>> {
    // Le plus récent par opération ; une opération a quelques passages par déploiement.
    const rows = await this.prisma.postDeployRun.findMany({
      where: { operationKey: { in: [...operationKeys] } },
      orderBy: [{ operationKey: "asc" }, { simulatedAt: "desc" }, { id: "desc" }],
      distinct: ["operationKey"],
    });
    return new Map(rows.map((row) => [row.operationKey, toSnapshot(row)]));
  }

  async byId(id: string): Promise<PostDeployRunSnapshot | null> {
    const row = await this.prisma.postDeployRun.findUnique({ where: { id } });
    return row === null ? null : toSnapshot(row);
  }
}
