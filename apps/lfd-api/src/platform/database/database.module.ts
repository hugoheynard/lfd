import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";

/**
 * Couche infrastructure : accès base de données.
 * Global pour que `PrismaService` soit injectable partout sans réimport.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
