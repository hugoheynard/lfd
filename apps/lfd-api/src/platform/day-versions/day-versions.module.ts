import { Module } from "@nestjs/common";

import { CallDeadline, NodeCallDeadline } from "../cache-calls/call-deadline.js";
import { personStampedFetch } from "../cache-calls/served-person.js";
import { AppConfig } from "../config/app-config.js";
import { DayVersionsCache } from "./day-versions-cache.js";
import { VersionsController } from "./versions.controller.js";
import { DurableObjectDayVersionsCache } from "./durable-object-day-versions-cache.js";
import { GetVersionsHandler } from "./get-versions.handler.js";
import { NoDayVersionsCache } from "./no-day-versions-cache.js";
import { ResilientDayVersionsCache } from "./resilient-day-versions-cache.js";
import { ScopeVersions } from "./scope-versions.js";
import { DurableObjectVersionedContentCache } from "./durable-object-versioned-content-cache.js";
import { NoVersionedContentCache } from "./no-versioned-content-cache.js";
import { VersionedContentCache } from "./versioned-content-cache.js";
import { VersionedContents } from "./versioned-contents.js";
import { DayContents } from "./day-contents.js";
import { DayContentsCache } from "./day-contents-cache.js";
import { DurableObjectDayContentsCache } from "./durable-object-day-contents-cache.js";
import { NoDayContentsCache } from "./no-day-contents-cache.js";

/**
 * La porte des versions — `admin/versions`. Le registre qu'elles lisent (`VersionRegistry`)
 * n'est PAS fourni ici : `platform` ne connaît aucun
 * bloc, et c'est `appBootstrap/day-version-sources.module.ts` (global) qui le
 * construit à partir des sources des blocs.
 *
 * L'objet des journées est un fait de déploiement : le Durable Object quand la
 * configuration le nomme (le Worker pose `DAY_VERSIONS_CACHE_URL`), sinon
 * « sans objet » — chaque question relit la base.
 */
@Module({
  controllers: [VersionsController],
  providers: [
    {
      provide: DayVersionsCache,
      inject: [AppConfig],
      useFactory: (config: AppConfig): DayVersionsCache => {
        const url = config.dayVersionsCacheUrl();
        return url === null
          ? new NoDayVersionsCache()
          : new DurableObjectDayVersionsCache(
              url,
              config.revision(),
              personStampedFetch(config.cachePersonSalt()),
            );
      },
    },
    {
      provide: VersionedContentCache,
      inject: [AppConfig],
      useFactory: (config: AppConfig): VersionedContentCache => {
        const url = config.dayVersionsCacheUrl();
        return url === null
          ? new NoVersionedContentCache()
          : new DurableObjectVersionedContentCache(
              url,
              config.revision(),
              personStampedFetch(config.cachePersonSalt()),
            );
      },
    },
    VersionedContents,
    {
      provide: DayContentsCache,
      inject: [AppConfig],
      useFactory: (config: AppConfig): DayContentsCache => {
        const url = config.dayVersionsCacheUrl();
        return url === null
          ? new NoDayContentsCache()
          : new DurableObjectDayContentsCache(
              url,
              config.revision(),
              personStampedFetch(config.cachePersonSalt()),
            );
      },
    },
    DayContents,
    { provide: CallDeadline, useClass: NodeCallDeadline },
    ResilientDayVersionsCache,
    ScopeVersions,
    GetVersionsHandler,
  ],
  // Les contenus versionnés (`le-cache-du-back-office.md`, § 4.5) : la
  // porte générique que les blocs appellent ; et les contenus des écrans de
  // journée (§ 3.1).
  exports: [VersionedContents, DayContents],
})
export class DayVersionsModule {}
