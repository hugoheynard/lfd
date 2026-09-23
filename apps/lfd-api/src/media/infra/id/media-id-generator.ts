import { Injectable } from "@nestjs/common";
import { v7 as uuidV7 } from "uuid";

/**
 * Génération des identifiants de la médiathèque — **même règle R1** que le
 * référentiel : l'identifiant est assigné par la commande, jamais par la base.
 *
 * UUID **v7** : préfixé par l'horodatage, donc ordonné — les insertions restent
 * localisées dans l'index B-tree là où un v4 les disperse.
 *
 * ⚠️ C'est le jumeau de `MediaIdGenerator`, à l'identique. La duplication est
 * assumée le temps qu'il faudra : un générateur d'identifiants est une brique
 * TECHNIQUE, sa place est dans `platform/`, et l'y déplacer demande de toucher
 * tous les dépôts du référentiel. Emprunter celui du PIM aurait été pire — la
 * médiathèque aurait dépendu d'un bloc pour un service qui n'a rien de métier.
 */
export abstract class MediaIdGenerator {
  abstract next(): string;
}

@Injectable()
export class UuidV7MediaIds extends MediaIdGenerator {
  next(): string {
    return uuidV7();
  }
}
