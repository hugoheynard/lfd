import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { BrandLogoSource } from "../../../../../platform/brand/brand-logo.source.js";
import { Clock } from "../../../../../platform/time/clock.js";
import { renderAllergenMatrixPdf } from "../../domain/allergen-matrix-pdf.js";
import { specimenAllergenMatrixPaper } from "../document-specimens/specimen-matrix.js";
import type { AllergenMatrixPdfFile } from "../export-allergen-matrix-pdf.js";

/**
 * **La matrice des allergènes d'EXEMPLE** — la planche des documents de la
 * Comptabilité (`documentation/comptabilite/planche-des-documents.md`).
 *
 * Aucun filtre en paramètre : la matrice est rendue à partir de données
 * fixes. Une lecture : aucune fiche n'est lue, rien n'est écrit.
 */
export class GetAllergenMatrixSpecimenQuery {}

/**
 * **Rend la matrice d'exemple** par le rendu même de la vraie
 * (`renderAllergenMatrixPdf`), datée par le `Clock`, le logo lu par le port de
 * la marque — comme l'export, sans le référentiel ni le catalogue.
 *
 * Colocalisé avec sa requête, au style du référentiel (`CLAUDE.md` §4) ; rangé
 * sous `queries/` parce que la porte `lint:pdf-specimens` y cherche les
 * handlers d'exemple de tous les blocs.
 *
 * @throws {BrandLogoUnavailableError} le logo manque sur le disque.
 */
@QueryHandler(GetAllergenMatrixSpecimenQuery)
export class GetAllergenMatrixSpecimenHandler implements IQueryHandler<
  GetAllergenMatrixSpecimenQuery,
  AllergenMatrixPdfFile
> {
  constructor(
    private readonly logo: BrandLogoSource,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<AllergenMatrixPdfFile> {
    const paper = specimenAllergenMatrixPaper(this.clock.now());
    const bytes = await renderAllergenMatrixPdf(paper, await this.logo.load());
    return { bytes, fileName: "exemple-matrice-allergenes.pdf" };
  }
}
