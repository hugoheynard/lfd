import { Module } from "@nestjs/common";

import { PimCapabilitiesController } from "./publication.controller.js";

/**
 * Contexte **publication** — le drapeau qui décide si le catalogue sort d'ici.
 *
 * Il ne porte aucune donnée : une lecture de configuration, et le garde qui la
 * fait respecter (monté en `APP_GUARD` par la racine de composition, parce
 * qu'il doit s'appliquer aux routes de deux canaux et du catalogue).
 */
@Module({
  controllers: [PimCapabilitiesController],
})
export class PublicationModule {}
