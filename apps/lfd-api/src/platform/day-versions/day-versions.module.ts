import { Module } from "@nestjs/common";

import { CallDeadline, NodeCallDeadline } from "../cache-calls/call-deadline.js";
import { AppConfig } from "../config/app-config.js";
import { DayVersionsCache } from "./day-versions-cache.js";
import { DayVersionsController } from "./day-versions.controller.js";
import { DurableObjectDayVersionsCache } from "./durable-object-day-versions-cache.js";
import { GetDayVersionsHandler } from "./get-day-versions.handler.js";
import { NoDayVersionsCache } from "./no-day-versions-cache.js";
import { ResilientDayVersionsCache } from "./resilient-day-versions-cache.js";

/**
 * La porte des versions de journée. Le registre qu'elle lit
 * (`DayVersionRegistry`) n'est PAS fourni ici : `platform` ne connaît aucun
 * bloc, et c'est `appBootstrap/day-version-sources.module.ts` (global) qui le
 * construit à partir des sources des blocs.
 *
 * L'objet des journées est un fait de déploiement : le Durable Object quand la
 * configuration le nomme (le Worker pose `DAY_VERSIONS_CACHE_URL`), sinon
 * « sans objet » — chaque question relit la base.
 */
@Module({
  controllers: [DayVersionsController],
  providers: [
    {
      provide: DayVersionsCache,
      inject: [AppConfig],
      useFactory: (config: AppConfig): DayVersionsCache => {
        const url = config.dayVersionsCacheUrl();
        return url === null
          ? new NoDayVersionsCache()
          : new DurableObjectDayVersionsCache(url, config.revision());
      },
    },
    { provide: CallDeadline, useClass: NodeCallDeadline },
    ResilientDayVersionsCache,
    GetDayVersionsHandler,
  ],
})
export class DayVersionsModule {}
