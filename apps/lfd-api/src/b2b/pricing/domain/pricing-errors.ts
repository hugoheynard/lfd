/**
 * **Les refus de la tarification** — un fichier par agrégat, réunis ici.
 *
 * ## Pourquoi ce fichier ne porte plus que des ré-exports
 *
 * Il portait **56 classes sur 964 lignes**, et c'est ce qui a permis à R18 de
 * vivre : le même refus — introuvable, scellé, recouvrement — n'avait pas la
 * même catégorie selon l'agrégat, donc pas le même statut HTTP, et deux
 * agrégats sur cinq répondaient **400** là où les autres répondaient 404 et 409.
 *
 * L'incohérence n'était invisible pour personne en particulier : elle était
 * invisible parce que la comparer demandait de tenir six familles en tête sur
 * un seul défilement. Rangées par agrégat, les trois catégories d'une famille
 * tiennent dans un écran, et la suivante se compose en regardant sa voisine.
 *
 * ## L'adresse ne bouge pas, et c'est délibéré
 *
 * Quarante-deux fichiers importent d'ici. Les faire tous pointer ailleurs
 * aurait mêlé un déplacement mécanique à une correction de comportement, dans
 * le diff où l'on veut relire la seconde. Le chemin d'import est une adresse ;
 * la ranger est un autre sujet que ce qu'on range (2026-09-09, R18).
 */

export * from "./errors/rule-errors.js";
export * from "./errors/floor-errors.js";
export * from "./errors/volume-ladder-errors.js";
export * from "./errors/volume-commitment-errors.js";
export * from "./errors/price-template-errors.js";
export * from "./errors/mercuriale-errors.js";
export * from "./errors/shared-errors.js";
