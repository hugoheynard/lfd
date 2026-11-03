/**
 * Les lecteurs de charge utile, réexportés DANS le canal du colisage : le bloc
 * `packing` ne lit le fournil que par `production/channels/packing/`
 * (`lint:context-boundaries`), et ses propres faits s'en servent. Ils vivent
 * à la racine des canaux (`../payload-fields.ts`), partagés par tous.
 */
export { instantOf, piecesOf, recordOf, saleUnitOf, textOf } from "../payload-fields.js";
