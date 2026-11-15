/**
 * La porte des primitives d'impression (`shared/print/`) : pastilles,
 * camemberts, pages, gabarit de la fiche et du compte, réglages d'affichage,
 * données d'exemple, archive des papiers et fiche de commande (`OrderSheetPaper`), lus par le plan et l'atelier. Tout le reste est privé (on y entre par cet
 * index, qui ne fait que réexporter : `documentation/fournil/architecture-contexte-production.md`, « Les règles de la surface » ; porte
 * `lint:production-subcontexts`). Ce fichier ne fait que réexporter.
 */
export {
  SPECIMEN_ORDER,
  specimenServiceDay,
} from "./application/document-specimens/specimen-data.js";
export {
  OrderSheetPaper,
  atelierSheetSlotOf,
} from "./application/services/order-sheet-paper.service.js";
export type { OrderSheetMarks } from "./application/services/order-sheet-paper.service.js";
export { ProductionPaperArchive } from "./application/services/production-paper-archive.service.js";
export type {
  PaperDraft,
  PaperSlot,
  ProductionPaper,
} from "./application/services/production-paper-archive.service.js";
export { ProductionDisplaySettings } from "./domain/entities/production-display-settings.js";
export type { ProductionDisplaySettingsState } from "./domain/entities/production-display-settings.js";
export { ProductionDisplaySettingsReader } from "./domain/ports/production-display-settings.reader.js";
export { ProductionDisplaySettingsRepository } from "./domain/ports/production-display-settings.repository.js";
export {
  atelierSheetPdfKey,
  productionCountPdfKey,
  renderAtelierSheetPdf,
  renderProductionCountPdf,
} from "./domain/services/atelier-sheet-pdf.js";
export { drawCountPie } from "./domain/services/count-color-pie.js";
export { countColorSharesOf } from "./domain/services/count-color-shares.js";
export type { CountColorShare } from "./domain/services/count-color-shares.js";
export { dossierSheetHeadOf } from "./domain/services/dossier-sheet-head.js";
export type { DossierSheetHead } from "./domain/services/dossier-sheet-head.js";
export { fulfillmentLabelOf } from "./domain/services/fulfillment-method-label.js";
export {
  figureFontSize,
  lineFigure,
  linePieces,
  piecesOfLines,
} from "./domain/services/line-tally.js";
export type { TalliedLine } from "./domain/services/line-tally.js";
export {
  MADE_TO_ORDER_MENTION,
  countPaperRowsOf,
  isMadeToOrder,
} from "./domain/services/made-to-order.js";
export type { CountPaperRow } from "./domain/services/made-to-order.js";
export { drawOrderSwatch } from "./domain/services/order-color-swatch.js";
export { drawRouting } from "./domain/services/order-routing-pdf.js";
export { rootShelvesOf, sectionOrdered } from "./domain/services/root-shelves.js";
export type { ShelfSection } from "./domain/services/root-shelves.js";
export { servePaper } from "./http/production-paper-response.js";
