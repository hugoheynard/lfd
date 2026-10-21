/**
 * **Le canal que le colisage publie POUR le commerce** (réassort, lot R3b,
 * 2026-10-21).
 *
 * | Pièce                    | Nature                        | Ce qu'elle porte                        |
 * | ------------------------ | ----------------------------- | --------------------------------------- |
 * | `PackedResuppliesReader` | port déclaré ET implémenté ici | l'emballé d'un réassort, une fois clos |
 *
 * `lint:context-boundaries` n'autorise `b2b → packing` que par ce dossier ;
 * `packing → b2b` reste interdit : le colisage ne sait pas qui le lit.
 */
export { PackedResuppliesReader, type PackedResupplyLines } from "./packed-resupplies.reader.js";
