import { Injectable } from '@nestjs/common';
import { v7 as uuidV7 } from 'uuid';

/**
 * Génération des identifiants — **règle R1**.
 *
 * Les identifiants sont assignés par la **commande**, jamais par la base (pas de séquence,
 * pas de `default gen_random_uuid()`). C'est la seule règle vraiment irrattrapable du modèle :
 * la caisse, Shopify et l'historique de commandes pointent sur ces identifiants, et un replay
 * qui les régénérerait romprait toutes ces références.
 *
 * UUID **v7** : préfixé par l'horodatage, donc **ordonné** — les insertions restent localisées
 * dans l'index B-tree, là où un v4 les disperse.
 *
 * C'est un **port** : le domaine dépend de l'interface, l'infrastructure fournit l'horloge.
 */
export abstract class IdGenerator {
  abstract next(): string;
}

@Injectable()
export class UuidV7Generator extends IdGenerator {
  next(): string {
    return uuidV7();
  }
}
