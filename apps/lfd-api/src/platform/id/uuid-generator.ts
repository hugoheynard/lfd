import { Injectable } from "@nestjs/common";
import { v7 as uuidV7 } from "uuid";

/**
 * Port des identifiants **UUID v7** — ceux des tables du référentiel et de la
 * médiathèque.
 *
 * **Règle R1** : l'identifiant est assigné par la commande, jamais par la base
 * (pas de séquence, pas de `default gen_random_uuid()`). La caisse,
 * l'historique de commandes et les porteurs d'images pointent sur ces
 * identifiants ; un replay qui les régénérerait romprait ces références.
 *
 * UUID **v7** : préfixé par l'horodatage, donc ordonné — les insertions restent
 * localisées dans l'index B-tree, là où un v4 les disperse.
 *
 * Distinct d'`IdGenerator` (ULID) et ce n'est pas un doublon : les colonnes
 * déjà écrites portent des UUID, et un identifiant change de forme par
 * migration, pas par injection.
 *
 * Il vivait deux fois, en jumeaux exacts (`PimIdGenerator`,
 * `MediaIdGenerator`) ; fondus ici le 2026-10-10 — une brique technique ne
 * s'emprunte pas à un bloc métier, et ne se recopie pas dans chacun.
 */
export abstract class UuidGenerator {
  abstract next(): string;
}

@Injectable()
export class UuidV7Generator extends UuidGenerator {
  next(): string {
    return uuidV7();
  }
}
