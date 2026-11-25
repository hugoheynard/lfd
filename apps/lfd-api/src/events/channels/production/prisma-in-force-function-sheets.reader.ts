import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  type InForceFunctionSheet,
  InForceFunctionSheetsReader,
} from "../../../production/channels/events/index.js";
import { inForceSheetsOn } from "./in-force-function-sheets.query.js";

/** Les fiches en vigueur d'un jour, sans le stockage : la fenêtre d'impression. */
@Injectable()
export class PrismaInForceFunctionSheetsReader extends InForceFunctionSheetsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async inForceOn(serviceDay: string): Promise<readonly InForceFunctionSheet[]> {
    const rows = await inForceSheetsOn(this.prisma, serviceDay);
    return rows.map(({ sheetId, fileName, eventName }) => ({ sheetId, fileName, eventName }));
  }
}
