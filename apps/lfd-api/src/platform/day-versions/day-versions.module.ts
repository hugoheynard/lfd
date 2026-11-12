import { Module } from "@nestjs/common";

import { CallDeadline, NodeCallDeadline } from "../cache-calls/call-deadline.js";
import { AppConfig } from "../config/app-config.js";
import { DayVersionsCache } from "./day-versions-cache.js";
import { DayVersionsController } from "./day-versions.controller.js";
import { VersionsController } from "./versions.controller.js";
import { DurableObjectDayVersionsCache } from "./durable-object-day-versions-cache.js";
import { GetDayVersionsHandler } from "./get-day-versions.handler.js";
import { GetVersionsHandler } from "./get-versions.handler.js";
import { NoDayVersionsCache } from "./no-day-versions-cache.js";
import { ResilientDayVersionsCache } from "./resilient-day-versions-cache.js";
import { ScopeVersions } from "./scope-versions.js";
import { DurableObjectVersionedContentCache } from "./durable-object-versioned-content-cache.js";
import { NoVersionedContentCache } from "./no-versioned-content-cache.js";
import { VersionedContentCache } from "./versioned-content-cache.js";
import { VersionedContents } from "./versioned-contents.js";

/**
 * Les portes des versions — `admin/versions`, et `admin/day-versions` le
 * temps d'un déploiement. Le registre qu'elles lisent (`VersionRegistry`)
 * n'est PAS fourni ici : `platform` ne connaît aucun
 * bloc, et c'est `appBootstrap/day-version-sources.module.ts` (global) qui le
 * construit à partir des sources des blocs.
 *
 * L'objet des journées est un fait de déploiement : le Durable Object quand la
 * configuration le nomme (le Worker pose `DAY_VERSIONS_CACHE_URL`), sinon
 * « sans objet » — chaque question relit la base.
 */
@Module({
  controllers: [DayVersionsController, VersionsController],
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
    {
      provide: VersionedContentCache,
      inject: [AppConfig],
      useFactory: (config: AppConfig): VersionedContentCache => {
        const url = config.dayVersionsCacheUrl();
        return url === null
          ? new NoVersionedContentCache()
          : new DurableObjectVersionedContentCache(url, config.revision());
      },
    },
    VersionedContents,
    { provide: CallDeadline, useClass: NodeCallDeadline },
    ResilientDayVersionsCache,
    ScopeVersions,
    GetDayVersionsHandler,
    GetVersionsHandler,
  ],
  // Les contenus versionnés (`plan-catalogue-du-back-office.md`, § 3.5) : la
  // porte générique que les blocs appellent.
  exports: [VersionedContents],
})
export class DayVersionsModule {}
