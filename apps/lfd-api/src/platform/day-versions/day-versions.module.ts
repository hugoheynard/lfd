import { Module } from "@nestjs/common";

import { DayVersionsController } from "./day-versions.controller.js";
import { GetDayVersionsHandler } from "./get-day-versions.handler.js";

/**
 * La porte des versions de journée. Le registre qu'elle lit
 * (`DayVersionRegistry`) n'est PAS fourni ici : `platform` ne connaît aucun
 * bloc, et c'est `appBootstrap/day-version-sources.module.ts` (global) qui le
 * construit à partir des sources des blocs.
 */
@Module({
  controllers: [DayVersionsController],
  providers: [GetDayVersionsHandler],
})
export class DayVersionsModule {}
