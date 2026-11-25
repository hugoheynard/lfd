import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  FunctionSheetReader,
  type FunctionSheetLocation,
} from "../domain/ports/function-sheet.reader.js";

/** Adaptateur Prisma : une fiche en vigueur, par son événement et son identifiant. */
@Injectable()
export class PrismaFunctionSheetReader extends FunctionSheetReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  locate(eventId: string, sheetId: string): Promise<FunctionSheetLocation | null> {
    return this.prisma.functionSheet.findFirst({
      where: { id: sheetId, eventId, archivedAt: null },
      select: { fileName: true, storageKey: true, contentType: true },
    });
  }
}
