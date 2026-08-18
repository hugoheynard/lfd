import { Module } from "@nestjs/common";

import { OpsLogsController } from "./ops-logs.controller.js";

/**
 * La lecture des journaux de l'instance.
 *
 * Pas de provider : le tampon est un singleton de module, rempli par le logger
 * posé au tout début du démarrage — bien avant que l'injection n'existe (cf.
 * `log-buffer.ts`). Ce module n'apporte que la porte.
 */
@Module({
  controllers: [OpsLogsController],
})
export class LoggingModule {}
