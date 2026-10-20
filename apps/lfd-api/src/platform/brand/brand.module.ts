import { Module } from "@nestjs/common";

import { BrandLogoSource } from "./brand-logo.source.js";
import { DiskBrandLogoSource } from "./disk-brand-logo.source.js";

/** La marque imprimée — un seul lecteur du logo pour tous les papiers. */
@Module({
  providers: [{ provide: BrandLogoSource, useClass: DiskBrandLogoSource }],
  exports: [BrandLogoSource],
})
export class BrandModule {}
