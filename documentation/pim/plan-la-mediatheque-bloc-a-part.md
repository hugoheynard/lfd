# La médiathèque devient un bloc — plan B

> **Plan**, écrit le 2026-09-23. Chaque affirmation sur l'existant a été
> vérifiée en ouvrant le fichier, la migration ou la porte citée.
>
> Décision Hugo : « on avait dit que c'était à part et que ça discutait par
> port, genre /mediatheque, et pim discute par port ».
>
> 🔴 **Il porte une migration de données. `vitruve` est donc dû avant qu'il
> serve** (`CLAUDE.md` §9 bis). Il n'a pas encore été contredit.

Il fait suite à [`plan-la-mediatheque.md`](plan-la-mediatheque.md), dont les
lots 1 et 2 sont livrés (`054e9d09b`, `2839b0c65`).

---

## 1. Ce que « à part » veut dire, d'après la porte qui le tient

`lint:prisma-model-ownership` ne se contente pas de ranger :

> « Le propriétaire d'un modèle est le bloc qui l'**ÉCRIT**. […] un modèle a UN
> propriétaire, et lui seul le lit. »

Donc un bloc `media/` qui possède `media_asset` **interdit au référentiel
d'écrire dedans**. Ce n'est pas une conséquence à absorber plus tard : c'est la
condition d'entrée.

### Qui écrit la bibliothèque aujourd'hui — les quatre fichiers

| Fichier                                                           | Ce qu'il fait                                                  |
| ----------------------------------------------------------------- | -------------------------------------------------------------- |
| `product/infrastructure/prisma-editorial.repository.ts`           | **crée** un actif par visuel, à chaque enregistrement de fiche |
| `category/infrastructure/prisma-category-editorial.repository.ts` | idem, pour une famille                                         |
| `product/infrastructure/prisma-media-library.ts`                  | inscrit un dépôt, compte, ramasse les orphelins                |
| `shared/infrastructure/prisma-media-library-reader.ts`            | lit, groupé par URL (lot 1)                                    |

_(Inventaire fait le 2026-09-23 : ce sont les seuls, hors client Prisma généré.)_

🔴 **Les deux premiers sont le sujet du plan.** Les deux autres déménagent tels
quels.

---

## 2. La vraie bascule : le référentiel cesse de fabriquer des actifs

Aujourd'hui, `replaceMedia` détache tout puis **recrée un `MediaAsset` neuf par
visuel**. C'est ce qui fait qu'une image n'a aucune identité qui traverse deux
sauvegardes, et c'est pourquoi le lot 1 a dû grouper par URL.

Sous B, le rattachement ne crée plus rien : il **désigne** une image de la
bibliothèque.

|                                             | Avant                                  | Après                          |
| ------------------------------------------- | -------------------------------------- | ------------------------------ |
| `product_media` référence                   | `media_asset.id`, recréé à chaque fois | l'**URL**, stable              |
| Enregistrer une fiche                       | écrit dans la bibliothèque             | n'y touche pas                 |
| Une image sans dépôt (URL saisie à la main) | crée un actif au passage               | doit être **inscrite** d'abord |

⚠️ **Le troisième cas est le piège du plan.** Le dépôt admet aujourd'hui des
visuels par simple URL, et c'est le seul chemin par lequel une image entre sans
passer par `POST /mediatheque`. Sous B il faut choisir, et le choix se dit :
soit l'URL saisie inscrit une entrée de bibliothèque (une écriture de plus, mais
le modèle reste un), soit elle est refusée (plus simple, et ferme une porte
qu'on utilise encore). **Non tranché.**

---

## 3. Ce que le port doit porter

`media/` ne peut pas lire `product_media` : ce sont les tables des porteurs, et
elles restent chez eux. Il déclare donc ce dont il a besoin, et les blocs
porteurs l'implémentent — motif `production/channels/commerce/`.

```ts
/** Ce qu'un bloc porteur sait des images qu'il affiche. */
export abstract class MediaCarriers {
  /** Combien des siens portent chacune de ces URL. */
  abstract usesOf(urls: readonly string[]): Promise<ReadonlyMap<string, number>>;
}
```

🔴 **Le sens de la dépendance compte.** C'est `media/` qui DÉCLARE et `pim/` qui
IMPLÉMENTE, jamais l'inverse : un bloc qui publie un port ne doit pas connaître
ceux qui le branchent, sinon la dépendance revient par l'autre bout. C'est
`appBootstrap/` qui les relie.

⚠️ Le comptage cesse donc d'être une requête et devient **N ports** — un par
famille de porteurs. Le lot 1 le fait en une requête groupée ; sous B, la
médiathèque additionne ce que chaque bloc lui rend. C'est plus de code pour le
même chiffre, et c'est le prix de la frontière.

---

## 4. 🔴 La règle de suppression descend d'un barreau

> Hugo : « on ne peut pas supprimer une image qui a été mappée quelque part ».

Elle est aujourd'hui tenue par **Postgres** — `product_media_media_id_fkey` et
`category_media_media_id_fkey` sont en `ON DELETE RESTRICT`. Sans clé étrangère
vers un actif, la base ne peut plus rien refuser.

|                            | Aujourd'hui | Sous B                                |
| -------------------------- | ----------- | ------------------------------------- |
| Qui refuse                 | Postgres    | le code de `media/`                   |
| Ce qu'il faut pour refuser | rien        | interroger tous les porteurs, d'abord |
| Ce qui arrive si on oublie | impossible  | une image qui sert disparaît          |

**C'est la seule chose que ce déménagement dégrade, et il faut la payer
explicitement** : un test qui supprime une image portée et attend un refus, écrit
AVANT la bascule et vert après. Sans lui, la règle n'existe plus qu'en intention.

⚠️ Mon carnet dit qu'un garde-fou qui n'existe que contre un problème créé par
ma découpe révèle une mauvaise découpe. Ici, ce n'est pas le cas — la frontière
est bonne, c'est la **protection** qui doit changer de nature. Mais la phrase
mérite d'être opposée au plan par qui le relira.

---

## 5. Les trois déploiements

Additif, réversible, jamais une colonne supprimée dans le même passage
(`CLAUDE.md` §0).

### ① Étendre

- Schéma `media`, table `media.asset`, avec les colonnes d'aujourd'hui.
- `product_media` et `category_media` gagnent une colonne `media_url`,
  **nullable**, remplie en double écriture à chaque enregistrement.
- Recopie de `pim.media_asset` vers `media.asset`, **dédoublonnée par URL** —
  c'est le moment où le journal de lignes redevient une bibliothèque.
- Rien ne lit encore la nouvelle table.

### ② Basculer

- Le bloc `media/` naît, avec son module, sa route `/mediatheque` sans préfixe
  `pim`, son port `MediaCarriers`, et l'implémentation côté `pim/`.
- Les lectures passent sur `media_url` ; `replaceMedia` cesse de créer des
  actifs.
- L'ancienne route et l'ancienne colonne vivent encore.

### ③ Resserrer

- `media_url` devient obligatoire, `media_id` et sa clé étrangère tombent.
- `pim.media_asset` est supprimée — **après un comptage**, et par un geste
  proposé, jamais exécuté d'autorité.

---

## 6. Ce que le plan ne tranche pas

| Sujet                               | Pourquoi c'est ouvert                                                                                                                                                                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Les visuels saisis **par URL** (§2) | les inscrire, ou les refuser. Le second est plus propre et ferme une porte qu'on utilise                                                                                                                                                        |
| Le **texte alternatif**             | il est sur le lien, et c'est juste (« c'est ainsi que CE produit décrit l'image »). Il ne déménage pas — mais il vit sur `media_asset`, donc il doit descendre sur `product_media` au passage. **C'est une seconde migration dans la première** |
| Le **journal**                      | une propriété de bibliothèque n'a pas de sujet à nommer. Déposer, taguer, pointer ne laisseront aucune trace                                                                                                                                    |
| Qui possède le bloc `media/`        | il n'a pas de ressource de permission à lui : l'écran est gardé par `pim_catalog:read`, ce qui redeviendra faux le jour où la vitrine y entrera                                                                                                 |

🔴 **La ligne « texte alternatif » est celle que je n'avais pas vue avant
d'ouvrir le schéma.** `alt` est une colonne de `media_asset`, alors que le
repository affirme qu'il appartient à la fiche — et c'est la recréation par
enregistrement qui rendait les deux compatibles : chaque fiche avait _sa_ ligne
d'actif. Supprimer la recréation casse cet accord silencieux. **Aucune bascule
n'est possible sans déplacer `alt` en même temps.**
