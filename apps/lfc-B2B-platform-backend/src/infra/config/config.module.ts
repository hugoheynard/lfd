import { Global, Module } from "@nestjs/common";
import { AppConfig } from "./app-config.js";

/**
 * Couche infrastructure : configuration.
 * Global pour que `AppConfig` soit injectable partout sans réimport — et pour
 * qu'aucun module n'ait de prétexte à lire `process.env` lui-même.
 *
 * Nommé `AppConfigModule` (et non `ConfigModule`) pour ne pas se confondre avec
 * celui de `@nestjs/config`, qui ne fait qu'une chose : charger le `.env`.
 */
@Global()
@Module({
  providers: [AppConfig],
  exports: [AppConfig],
})
export class AppConfigModule {}
