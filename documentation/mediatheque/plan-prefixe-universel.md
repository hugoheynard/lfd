# Plan — le préfixe universel de la médiathèque

> **État (2026-10-13) : D0 commité (`659a34661`) ; D1 réduit au changement de
> préfixe des dépôts neufs, bâti, non déployé.** Demande de Hugo du même
> jour : le préfixe de clé `products` « sert tout porteur », on le renomme
> « pour avoir enfin quelque chose d'universel ».
>
> **Méthode changée le même jour par Hugo** : les images de production ne sont
> **pas** migrées par SQL. Elles sont redéposées à la main, par l'écran, après
> le déploiement du préfixe. La migration, sa table de correspondance, son
> inverse au runbook et les outils `dev-toolbox` de la première version ont
> été retirés avant tout déploiement (ils n'avaient tourné qu'en local).
>
> Point de départ : [`mediatheque.md`](mediatheque.md), points à faire, n° 1.

## Décisions de Hugo (2026-10-13)

| #   | Question                                | Décision                                                                                                       |
| --- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Q1  | Le nom du préfixe                       | **`images`**                                                                                                   |
| Q2  | Réécrire l'existant ?                   | **Non** (révisée le même jour) : seuls les dépôts neufs prennent `images/` ; l'existant est redéposé à l'écran |
| Q3  | Déduplication indépendante du préfixe ? | **Oui, en D0**, déployé seul et avant le reste                                                                 |
| Q4  | Le sort des images `products/`          | **Détachées puis supprimées à l'écran par Hugo**, après le déploiement du préfixe                              |

---

## 1. Ce qui existe

| Quoi                    | Où                                                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **La seule définition** | `MEDIA_KEY_PREFIX` de `apps/lfd-api/src/media/application/deposit-image.ts`, passé à `MediaStore.put` (`images` depuis D1)                                        |
| Construction de la clé  | `contentAddressedKey(prefix, bytes, type)` de `@lfd/storage`, appelée par `apps/lfd-api/src/platform/storage/r2-media-store.ts` → `{préfixe}/{sha256}.{ext}`      |
| Lecture du préfixe      | **Aucune** en production. `mediaFileName()` garde le dernier segment                                                                                              |
| Redépôt                 | **D0** : `MediaLibrary.holdingContent(contentAddressOf(storageKey))` — la ligne dont la clé finit par `/{sha256}.{ext}`, préfixe ignoré                           |
| Suppression d'objet     | `DiscardMedia` (`apps/lfd-api/src/media/application/discard-media.ts`) : refuse une image encore portée, retire l'objet puis les lignes, quel que soit le préfixe |

L'identité d'une image est son **URL** (`media_asset.url @unique`), recopiée
en entier par chaque porteur. Une image `products/` reste donc servie et juste
tant que personne ne la supprime : les deux préfixes cohabitent sans risque.

## 2. Les lots

- **D0** — le redépôt retrouve une image par son **contenu**, plus par son
  URL. Déployable seul : sous `products`, il se comporte comme avant.
- **D1** — `MEDIA_KEY_PREFIX = "images"`. Tout dépôt neuf est rangé sous
  `images/`. Aucune migration, aucune ligne existante touchée.
- **Après le déploiement de D1, à l'écran (Hugo)** — pour chaque image
  `products/` : la détacher de ses porteurs, la supprimer, puis redéposer le
  fichier et le rattacher.

## 3. Pourquoi l'ordre compte : D0 retrouve les mêmes octets

D0 cherche par `{sha256}.{ext}`, préfixe ignoré. Conséquences :

- **Redéposer avant le déploiement de D1** ne sert à rien : la clé calculée
  est encore `products/…`, et D0 rend la ligne existante.
- **Redéposer après D1 un fichier identique alors que l'ancienne ligne existe
  encore** rend aussi l'ancienne ligne, sous son URL `products/` : D0 est fait
  pour ça. Une image ne passe sous `images/` que si sa ligne `products/` a
  d'abord été **supprimée** (et donc détachée : le fonds refuse de supprimer
  une image portée).

L'ordre qui marche est donc : déployer D1 → détacher → supprimer → redéposer
→ rattacher. Entre la suppression et le redépôt, le porteur est sans image.

## 4. Pourquoi pas la migration

La première version réécrivait en place toutes les références vivantes par une
migration SQL gardée, avec copie R2, correspondance permanente et inverse au
runbook. Hugo a préféré le geste à l'écran : le volume est petit, le geste
existe déjà, et il n'y a plus ni migration de données ni outillage à tenir.

Ce que le redépôt ne réécrit pas, et c'est accepté : les **photographies
figées** (`pim.catalog_content.payload`, les snapshots de livraison, les
versions du catalogue, les faits du journal) gardent l'URL `products/` ; elle
répond 404 une fois l'objet ramassé. Elles disent ce qui a été servi tel jour.
