# Plan — le préfixe universel de la médiathèque

> **État (2026-10-13) : D0 commité (`659a34661`), D1 bâti, rien de déployé ; D2 décrit, non exécuté
> par ce lot.** Demande de Hugo du même jour : le préfixe de clé `products` « sert
> tout porteur », on le renomme « pour avoir enfin quelque chose
> d'universel ». Migration de données, et un runbook : passé par `vitruve`
> avant Hugo (§9).
>
> Point de départ : [`mediatheque.md`](mediatheque.md), points à faire, n° 1.

## Décisions de Hugo (2026-10-13)

| #   | Question                                             | Décision                                                                                                                                                                                           |
| --- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Le nom du préfixe                                    | **`images`**                                                                                                                                                                                       |
| Q2  | Réécrire l'existant, ou seulement les dépôts neufs ? | **Réécrire** les références vivantes                                                                                                                                                               |
| Q3  | Déduplication indépendante du préfixe ?              | **Oui, en D0**, déployé seul et avant tout le reste                                                                                                                                                |
| Q4  | Le sort des objets `products/`                       | **Gardés le temps de vérifier, PUIS supprimés** — plus tard, en **D2**, sur un ordre écrit de Hugo (ajout du même jour : « on pourra les supprimer, ajoute-le »). Aucune suppression dans D0 ni D1 |
| Q5  | Geler les dépôts pendant la fenêtre ?                | **Oui** : aucun dépôt de la copie à la fin des contrôles d'après D1                                                                                                                                |
| O1  | Les textes alternatifs qui valent l'URL en repli     | **Réécrits** avec les autres colonnes, par égalité exacte ; un texte écrit à la main qui contient `/products/` reste intact (Hugo, 2026-10-13)                                                     |

Toutes les affirmations sur l'existant ont été **ouvertes le 2026-10-13**.
Ce qui n'a pas pu l'être est marqué 🔍.

---

## 1. Ce qui existe

### 1.1 Où le préfixe vit dans le code

| Quoi                    | Où                                                                                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **La seule définition** | `MEDIA_KEY_PREFIX` de `apps/lfd-api/src/media/application/deposit-image.ts`, passé à `MediaStore.put` (`images` depuis D1)                                                        |
| Construction de la clé  | `contentAddressedKey(prefix, bytes, type)` de `@lfd/storage`, appelée par `apps/lfd-api/src/platform/storage/r2-media-store.ts` → `{préfixe}/{sha256}.{ext}`                      |
| Construction de l'URL   | même fichier : `${baseUrl}/${storageKey}` — origine `https://media.lafoliecoffee.info`, bucket R2 `lfc-media`                                                                     |
| Cache                   | `IMMUTABLE_CACHE` posé à l'écriture : l'URL est immuable parce que la clé est le hachage                                                                                          |
| Variantes               | Aucune stockée. La boutique fabrique `{origine}/cdn-cgi/image/width=…{chemin}` (`apps/lfc-ecommerce-frontend/src/app/client/shop/media-source.ts`) — aucun code ne lit le préfixe |
| Lecture du préfixe      | **Aucune** en production. `mediaFileName()` garde le dernier segment                                                                                                              |
| Redépôt                 | **D0** : `MediaLibrary.holdingContent(contentAddressOf(storageKey))` — la ligne dont la clé finit par `/{sha256}.{ext}`, préfixe ignoré                                           |
| Suppression d'objet     | Le seul `MediaStore.remove` est le ramassage des orphelines, qui lit `media_asset.storage_key` : il ne peut pas atteindre un objet `products/` déréférencé                        |

### 1.2 Ce qui est stocké en base — l'URL complète, pas la clé

L'identité d'une image est son **URL** (`media_asset.url @unique`) : tout
porteur la recopie en entier, origine comprise. Aucune clé étrangère.

**Références vivantes — réécrites par D1** (noms relus dans le schéma) :

| Schéma.table                | Colonne(s)                                         | Note                                         |
| --------------------------- | -------------------------------------------------- | -------------------------------------------- |
| `media.media_asset`         | `url` (unique), `storage_key`                      | `storage_key` NULL = URL saisie : hors sujet |
| `pim.product_media`         | `media_url` — **dans la clé primaire**             | `(product_id, media_url, role)`              |
| `pim.category_media`        | `media_url` — **dans la clé primaire**             | idem                                         |
| `pim.operations`            | `image_url`                                        |                                              |
| `public.catalog_items`      | `image_url`, `thumbnail_url`                       | le miroir du commerce                        |
| `public.catalog_operations` | `image_url`                                        |                                              |
| `public.storefront_page`    | `pickup_door_image_url`, `delivery_door_image_url` | les portes de l'accueil                      |
| `public.storefront_content` | `image_url`                                        | les tuiles de la vitrine                     |

**Photographies figées — jamais réécrites** (§3.3) : `pim.catalog_content.payload`,
`public.catalog_delivery.snapshot`, `public.catalog_versions.items` /
`operations`, `platform.outbox.payload`, `growth.activity_events.payload` /
`subject_id` / `idempotency_key`. (Le corps d'origine écrivait
`outbox_message` et `activity_event` : les tables s'appellent `outbox` et
`activity_events`, relevé du recensement sur une base de dev, 2026-10-13.)

**Textes alternatifs — réécrits aussi (O1)** : `media.media_asset.alt`
(chaque valeur du jsonb), `public.catalog_items.image_alt` et `thumbnail_alt`
portent l'URL quand personne n'a écrit de description (repli de `imageAlt`) ;
trouvés par le recensement sur la base de dev le 2026-10-13. Ils suivent quand
ils valent **exactement** l'ancienne URL ; un texte écrit à la main qui la
contient n'est jamais touché. La migration les lit dans la correspondance
permanente : la rejouer rattrape les textes d'images déjà déplacées.

Le recensement qui fait foi est `dev-toolbox/media-prefix/census.mjs` : il part
**des données**, sur tous les schémas lus dans
`apps/lfd-api/prisma/schema/datasource.prisma`.

### 1.3 Ce qui est parti hors de chez nous

Aucun canal tiers (plus de Shopify), aucun courriel ni PDF n'embarque d'image
du fonds. Le seul dehors : les pages déjà servies, en cache chez les
navigateurs, Cloudflare et les moteurs. Elles restent justes **tant que les
objets `products/` existent** — jusqu'à D2.

### 1.4 Combien d'objets

Illisible d'ici ; quelques centaines (carte OPS, seuil à 1 000). Le compte
réel est la première ligne du recensement.

---

## 2. Le nom

**`images`** (Q1). Le fonds n'accepte que des images, et le mot dit la nature
de l'objet, ni l'emploi ni le porteur.

---

## 3. La méthode

### 3.1 Copier, réécrire en place, retirer plus tard

1. **Copier** chaque objet `products/{h}.{ext}` vers `images/{h}.{ext}`, même
   bucket, même `Content-Type`, même `Cache-Control`.
2. **Réécrire en place** les références vivantes (§1.2) : même ligne
   `media_asset`, nouvelle `url` et nouvelle `storage_key`.
3. **Garder les objets `products/`** le temps de vérifier et de laisser les
   caches tourner ; puis **D2** les retire, sur ordre écrit de Hugo (Q4).

### 3.2 Pourquoi pas le geste « remplacer »

`ReplaceMediaHandler` travaille **entre deux lignes** : l'ancienne devient
orpheline et le ramassage supprime son objet. Réécrire en place évite cette
destruction par construction.

### 3.3 Pourquoi les photographies ne se réécrivent pas

`catalog_content` est adressé par contenu (le hash ment si l'URL change) ; un
snapshot ou un fait dit ce qui a été livré tel jour. Garder l'ancienne URL ne
coûte rien tant que l'objet est servi ; **après D2, ces URL répondent 404** —
c'est l'un des prix de D2, accepté par Hugo.

**Conséquence visible** : après D1, chaque fiche illustrée diffère de sa
dernière révision (mêmes octets, autre URL). Une publication suivie d'un push
la réaligne.

### 3.4 D0 — la déduplication par le contenu

Le dépôt retrouvait une image par son URL. Avec un préfixe changé, les mêmes
octets auraient fait une seconde ligne. D0 retrouve par `{sha256}.{ext}`
(`contentAddressOf`, `MediaLibrary.holdingContent`) et rend **l'URL de la ligne
existante** — palette déduite comprise. D0 est déployable seul : sous
`products`, il se comporte exactement comme avant.

### 3.5 La migration SQL (D1)

`apps/lfd-api/prisma/migrations/20261013500000_le_prefixe_universel_des_images/migration.sql` :

- crée `media.media_prefix_move(old_url, new_url, old_storage_key,
new_storage_key, moved_at)`, **permanente** (S4), et son modèle Prisma ;
- calcule la correspondance des lignes **encore** sous `products/` en
  remplaçant le segment de chemin, sans toucher l'origine ;
- **quatre gardes nommées avant tout UPDATE** (S3) : URL qui ne finit pas par
  sa clé, URL neuve déjà au fonds, collision de clé primaire sur
  `product_media` ou `category_media` ;
- `UPDATE` par égalité exacte sur l'URL, `media_asset` en dernier ;
- **idempotente** : rejouée, elle ne traite que ce qui reste sous `products/`
  (B2 : le runbook la fait rejouer si un dépôt s'est glissé).

### 3.6 Les outils (`dev-toolbox/media-prefix/`)

| Outil                  | Ce qu'il fait                                                                                                               | Défaut        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `census.mjs`           | recense les colonnes qui portent `/products/{sha256}.` ; code 1 sur une inconnue                                            | lecture seule |
| `copy-objects.mjs`     | copie `products/{h}` → `images/{h}` pour chaque clé lue **en base** (avant et après D1) ; ne remplace ni ne supprime jamais | **à blanc**   |
| `verify-urls.mjs`      | `HEAD` public de chaque URL du fonds (`--images` : les jumelles, avant D1) ; compte les clés hors `images/`                 | lecture seule |
| `purge-old-prefix.mjs` | **D2** : supprime une clé `products/` listée dans `media_prefix_move` si sa jumelle existe et répond 200                    | **à blanc**   |

Règles pures et tests : `dev-toolbox/media-prefix/prefix-rules.mjs`,
`node --test dev-toolbox/__tests__/media-prefix.test.mjs`. Éprouvés le
2026-10-13 contre le MinIO local (copie réelle, métadonnées et ETag
identiques), jamais contre R2.

🔍 Recopie de `Cache-Control` sur R2 et CORS des URL `images/` : à constater
sur un objet le jour J (runbook, étape 3).

### 3.7 Ce que ça coûte ailleurs

- **Transformations Cloudflare Images** : chaque nouvelle URL recompte une
  transformation par largeur servie ; quota gratuit de 5 000 par mois
  ([`../ops/cloudflare-images.md`](../ops/cloudflare-images.md) §5). À
  regarder le jour J.
- **Cache** : froid une fois, aucune purge.
- **Stockage** : les octets doublent entre D1 et D2 (de l'ordre de 100 Mo).

---

## 4. Les lots et les déploiements

| Lot | Contenu                                                                                                                          | Déploiement                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| D0  | Redépôt retrouvé par le contenu (`contentAddressOf`, `holdingContent`), tests domaine, application, e2e                          | seul, **avant tout**                                           |
| D1  | `MEDIA_KEY_PREFIX = "images"`, la migration, `MediaPrefixMove`, les quatre outils, le runbook, l'inverse (non appliquée), la doc | après copie + outbox vide + gel                                |
| D2  | Retrait des objets `products/` par `purge-old-prefix.mjs --pour-de-bon`                                                          | aucun déploiement ; ordre écrit de Hugo, des semaines après D1 |

---

## 5. Runbook

Les gestes de production, dans l'ordre (recensement, gel, copie, outbox, D1,
contrôles, publication, fin du gel, puis D2), la migration inverse et les
conditions de D2 sont dans [`../ops/runbook.md`](../ops/runbook.md), section
« Le préfixe universel de la médiathèque ». Le runbook fait foi ; ce plan ne
le recopie pas.

---

## 6. Retour arrière

- **Avant D1** : rien à défaire, les copies `images/` ne sont lues par personne.
- **Après D1, le code** : revenir au commit précédent remet `products` ; D0
  reste, le redépôt retrouve donc par contenu.
- **Après D1, la base** : la migration inverse du runbook, qui ne lit **que**
  `media.media_prefix_move` (S4). Une image déposée après D1 n'y figure pas :
  elle garde son URL `images/…`, qui reste servie. Jouée sur la base jetable
  (`apps/lfd-api/test/media-prefix-move.e2e-spec.ts` lit le bloc du runbook
  tel quel).
- **Après D2 : plus de retour arrière** par la correspondance — les objets
  qu'elle désigne n'existent plus.

---

## 7. Tests et doc

- Domaine : `content-address.spec.ts`. Application : `deposit-image.spec.ts`
  (« retrouve l'image par son CONTENU, même rangée sous un autre préfixe » ;
  « le fonds range sous un préfixe qui ne nomme aucun porteur »).
- E2E : `media-deposit-by-content.e2e-spec.ts` (D0) ;
  `media-prefix-move.e2e-spec.ts` (D1 : chaque porteur réécrit, même ligne,
  journal intact, idempotence, URL saisie intacte, garde avant tout UPDATE,
  inverse).
- Doc : `../ops/architecture-stockage-r2.md`, `../ops/cloudflare-images.md`,
  JSDoc de `media-library-reader.ts`. `mediatheque.md` (§2, point n° 1) reste à
  mettre à jour au déploiement de D1.

---

## 8. Ce qui reste ouvert

Rien. O1 est tranché (en tête du plan).

--- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| O1 | Les colonnes de texte alternatif qui portent l'URL en repli (§1.2) : les réécrire avec l'URL, ou les tenir pour du texte et les ranger parmi les figées ? | le recensement sort en code 1 : **D1 ne part pas** |

---

## 9. Contradiction par `vitruve` (2026-10-13) et sort de chaque objection

Le corps ci-dessus a été refondu après les décisions de Hugo ; il ne contredit
plus ce tableau.

| #   | Niveau   | Objection                                                                              | Sort                                                                              |
| --- | -------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| B1  | BLOQUANT | `catalog_items.thumbnail_url` oubliée ; la table de `storefront.prisma:138` non nommée | **Corrigé** : §1.2 (`storefront_content`), et `census.mjs` écrit                  |
| B2  | BLOQUANT | La migration tourne AVANT la bascule du Worker                                         | **Corrigé** : D0 déployé seul et avant, gel (Q5), migration idempotente rejouable |
| S1  | SÉRIEUX  | `MediaAssetDescribedFact` porte l'URL dans l'outbox                                    | **Accepté** : contrôle « outbox vide pour `media.*` » au runbook, avant le merge  |
| S2  | SÉRIEUX  | Requête de recensement non écrite, schémas recopiés                                    | **Corrigé** : `census.mjs` lit `datasource.prisma`                                |
| S3  | SÉRIEUX  | UPDATE de PK : une collision fait échouer toute la migration                           | **Corrigé** : quatre gardes nommées avant tout UPDATE                             |
| S4  | SÉRIEUX  | Retour arrière non bijectif                                                            | **Corrigé** : `media.media_prefix_move` permanente ; l'inverse ne lit qu'elle     |
| S5  | SÉRIEUX  | Remettre la dédup à plus tard, c'est accepter B2                                       | **Accepté** (= D0)                                                                |
| M1  | MINEUR   | `lint:cross-schema-join` ne lit pas les migrations                                     | Tranché : il ne lit que `apps/lfd-api/src`                                        |
| M2  | MINEUR   | Le ramassage ne peut pas atteindre les `products/` déréférencés                        | Confirmé ; c'est pourquoi D2 est un outil à part, piloté par la correspondance    |

**Reste non vérifié** : jsonb `delivery.content` et `pim.revisions.header`
(le recensement tranchera) ; recopie de `Cache-Control` et CORS sur R2 ; le
volume de production ; les tables `photo_key`, supposées dans un autre bucket.
