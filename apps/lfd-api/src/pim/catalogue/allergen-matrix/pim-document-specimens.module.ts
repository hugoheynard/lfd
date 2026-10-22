import { Module } from "@nestjs/common";

import { BrandModule } from "../../../platform/brand/brand.module.js";
import { GetAllergenMatrixSpecimenHandler } from "./application/queries/get-allergen-matrix-specimen.handler.js";
import { AdminAllergenMatrixSpecimenController } from "./http/admin-allergen-matrix-specimen.controller.js";

/**
 * **Les exemplaires que le référentiel sert à la planche des documents**
 * (`documentation/comptabilite/planche-des-documents.md`).
 *
 * Un module à part, et c'est tout son objet : `PimModule` ne le range PAS dans
 * son arbre de routes, donc sa route reste `/admin/document-specimens/…`, sous
 * le préfixe commun que chaque bloc partage pour la planche — au lieu de
 * `/pim/admin/document-specimens/…`, que l'écran ne demanderait jamais.
 */
@Module({
  imports: [BrandModule],
  controllers: [AdminAllergenMatrixSpecimenController],
  providers: [GetAllergenMatrixSpecimenHandler],
})
export class PimDocumentSpecimensModule {}
