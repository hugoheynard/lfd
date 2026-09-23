# La médiathèque devient un bloc — plan B

> **Plan**, écrit le 2026-09-23, **contredit par `vitruve` le même jour** et
> réécrit contre ses seize objections. Ce que j'ai affirmé sans l'ouvrir est
> nommé au §8 plutôt qu'effacé.
>
> Décisions Hugo, dans l'ordre où elles sont tombées :
>
> - « on avait dit que c'était à part et que ça discutait par port, genre
>   /mediatheque, et pim discute par port » ;
> - « plus de visuel par simple URL » ;
> - « pour les alts il faut tout rapatrier dans médiathèque, le PIM devient
>   juste un mapper pour les images » ;
> - « plus d'alt dans le PIM, **un seul point dans la médiathèque** ».
>
> 🔴 **Il porte une migration de données.** Les trois comptages qu’il exigeait
> ont été faits le 2026-09-23 et rendent 0, 0 et 0 (§6) — à relire avant
> d’écrire la migration, pas après.

Suite de [`plan-la-mediatheque.md`](plan-la-mediatheque.md), dont **les six
lots sont livrés** (2026-09-23).

## 0. Où on en est

|                             | État                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Le nom                      | `media` partout dans le code et l'API (`38a996794`) ; l'écran garde `mediatheque`, le français vivant là où des humains lisent |
| Le journal                  | **fait** (`d518dd464`) — trois faits, sujet = l'URL, et le port d'écriture exige un laissez-passer                             |
| Déploiement ① — **étendre** | **fait** (`65661acf0`) — `media_url` nullable sur les deux rattachements, reportée, écrite en double, lue par personne         |
| Déploiement ② — basculer    | à faire, §5                                                                                                                    |
| Déploiement ③ — resserrer   | à faire, §5                                                                                                                    |

### 🔴 Ce que ① a appris, et qui retourne l'ordre du plan

J'ai voulu sortir `src/media/` d'abord, en laissant la table où elle est. **C'est
impossible**, et la raison est la porte que ce plan invoquait déjà :
`lint:prisma-model-ownership` dérive la propriété d'un modèle de **qui
l'écrit**. Or `prisma-editorial.repository.ts` CRÉE des `MediaAsset` à chaque
enregistrement de fiche. Deux blocs écriraient le même modèle, et la porte
tire — à raison.

➡️ L'ordre n'est donc pas « déménager puis nettoyer » mais **« faire cesser le
PIM d'écrire, ce qui libère le déménagement »**. Le code bouge en conséquence,
jamais en premier.

### ✅ Une simplification trouvée en écrivant ①

Le plan prévoyait de **recopier** `pim.media_asset` vers une table neuve.
Inutile : `ALTER TABLE "pim"."media_asset" SET SCHEMA "media"` est
**instantané et ne copie rien** — Postgres ne déplace que le catalogue. Le ②
s'allège d'autant, et le risque d'une copie partielle disparaît avec elle.

---

## 1. Qui touche la bibliothèque — l'inventaire CORRIGÉ

⚠️ Ma première version disait « quatre fichiers, ce sont les seuls ». **C'était
faux**, et par une faute de méthode : j'ai cherché le nom du modèle
(`mediaAsset`). Les lecteurs qui passent par la **relation** —
`productMedia.findMany({ include: { media: true } })` — n'écrivent jamais ce
nom, donc aucun grep sur le modèle ne les voit.

### Ceux qui ÉCRIVENT

| Fichier                                                              | Ce qu'il fait                                                  |
| -------------------------------------------------------------------- | -------------------------------------------------------------- |
| `product/infrastructure/prisma-editorial.repository.ts:82`           | **crée** un actif par visuel, à chaque enregistrement de fiche |
| `category/infrastructure/prisma-category-editorial.repository.ts:75` | idem, pour une famille                                         |
| `media/infrastructure/prisma-media-library.ts`                       | inscrit un dépôt, compte, **supprime** (`forget`)              |

### Ceux qui LISENT — dont quatre par la relation

| Fichier                                                          | Ce qu'il lit                                             |
| ---------------------------------------------------------------- | -------------------------------------------------------- |
| `media/infrastructure/prisma-media-library-reader.ts`            | la bibliothèque, groupée par URL (lot 1)                 |
| `product/infrastructure/prisma-editorial-reader.ts:71`           | `alt`, `name`, dimensions — **par `include`**            |
| `category/infrastructure/prisma-category-editorial.reader.ts:43` | idem — **par `include`**                                 |
| `revision/infrastructure/prisma-catalog-revision.source.ts:106`  | `alt`, qui entre dans le **payload figé d'une révision** |
| `channels/b2b-platform/products/showcase.ts:60`                  | `alt` du `hero`, servi à la vitrine B2B                  |

Plus deux registres tenus **à la main**, hors de tout bloc :
`platform/database/schema-ops.counter.ts:197` (`MediaAsset: "pim"`) et
`prisma/schema/datasource.prisma` (la liste des schémas).

🔴 **Les deux dernières lignes de lecture sont le vrai sujet du plan** : `alt`
ne sert pas qu'à la fiche. Il est **hashé dans une empreinte de révision** et
**comparé dans le diff de livraison B2B**. Toute bascule sur `alt` produit donc
un événement de catalogue, pas seulement un changement de texte (§4).

---

## 2. La bascule : le référentiel cesse de fabriquer des actifs

`replaceMedia` détache tout puis **recrée un `MediaAsset` neuf par visuel**
(`prisma-editorial.repository.ts:59-96`, vérifié). C'est ce qui fait qu'une
image n'a aucune identité traversant deux sauvegardes — et c'est pourquoi le lot
1 a dû grouper par URL.

Sous B, le rattachement ne crée plus rien : il **désigne**.

### 🔴 Le visuel par simple URL disparaît

> « plus de visuel par simple URL ».

C'était le seul chemin par lequel une image entrait sans dépôt, donc le seul qui
obligeait le rattachement à fabriquer un actif. Le fermer **est ce qui rend
cette section possible** : tant qu'une fiche peut nommer une adresse
quelconque, le référentiel doit pouvoir inscrire ce qu'il nomme.

Ce qu'on perd : illustrer depuis une banque distante sans copier l'octet. Ce
qu'on gagne : toute image du catalogue est chez nous, mesurée, adressée par son
contenu, et ne disparaît pas parce qu'un tiers a rangé son serveur.

⚠️ Les images **déjà** saisies ainsi sont inscrites telles quelles à l'étape ①,
sans `storageKey`, mesures vides — ce que le modèle appelle déjà « ce qu'on
n'héberge pas ». C'est d'en saisir de **nouvelles** qui est refusé. **Tranché**,
et retiré des questions ouvertes.

### 🔴 La clé primaire, et le risque d'échec de migration

`@@id([productId, mediaId])` (`editorial-media.prisma`), idem pour les
familles. Rien n'interdit aujourd'hui d'attacher **la même URL deux fois au même
produit** — deux actifs distincts, deux rôles. Aucune garde d'unicité d'URL
n'existe dans `media.ts`, ni dans `set-product-media.ts`, ni dans le magasin du
front.

Quand `media_id` tombe, la clé devient `(product_id, media_url)` : **collision
de clé primaire, migration en échec sur la base de production.**

### ✅ Mesuré : zéro doublon — et pourquoi ça ne suffit pas

`emplois_en_double` rend **0** (2026-09-23). Aucune URL n'est attachée deux fois
au même produit, donc la migration ne plantera pas sur la donnée existante.

🔴 **Il ne faut surtout pas en conclure que le cas n'existe pas.** Il est à zéro
parce qu'**aucun écran ne permettait de désigner un rôle autre que `hero`**
jusqu'au 2026-09-23 — le geste livré ce jour-là est le premier. Or l'inventaire
des rôles décrit précisément le cas : une même photo en `hero` **et** en
`thumbnail`. Le jour où ce geste existe, la collision arrive.

➡️ **L'identité d'un emploi est donc `(produit, url, rôle)`.** C'est une
décision, pas une issue conditionnelle au comptage : le zéro dit que la
migration passe, il ne dit pas que l'identité est bonne.

⚠️ `product_media.updatedAt` doit survivre à la refonte de la clé :
`ProductReadiness` le lit pour dire si une fiche a changé depuis sa signature.

---

## 3. Le port, et les deux sens

`media/` ne peut pas lire `product_media` : ce sont les tables des porteurs.
Il **déclare**, les blocs porteurs **implémentent** — motif
`production/channels/commerce/`.

```ts
/** Ce qu'un bloc porteur sait des images qu'il affiche. */
export abstract class MediaCarriers {
  /** Combien des siens portent chacune de ces URL. */
  abstract usesOf(urls: readonly string[]): Promise<ReadonlyMap<string, number>>;
}
```

⚠️ **Il faut un SECOND port, dans l'autre sens**, et je l'avais manqué : le
rattachement doit vérifier qu'une URL est **inscrite** (§2). C'est `pim → media`
en lecture, pas seulement en implémentation.

### Ce que les portes exigent, et que le plan taisait

- `lint:context-boundaries` **échoue** sur un dossier de premier niveau inconnu.
  Il faut donc ajouter `media` à sa carte **et** la ligne correspondante à la
  matrice du `CLAUDE.md` §3, bornée à une surface (`media/channels/pim/`),
  comme `b2b→production` l'est à `production/channels/commerce/`.
- 🔴 `lint:prisma-model-ownership` a un `BLOCKS` **en dur**
  (`prisma-model-ownership.mjs:63`) : `staff, pim, b2b, production, handover,
platform`. Un dossier `src/media/` y serait **ignoré** — ni écrivain, ni
  lecteur. J'avais présenté cette porte comme « la condition d'entrée » du
  plan : **en l'état, le déménagement la désarme au lieu de l'invoquer.**
  Ajouter `media` à `BLOCKS` fait partie du lot, et sans ça rien ne tient la
  frontière qu'on vient de dessiner.
- Cette même porte lit `prisma.<modèle>.<méthode>` par expression régulière :
  les lectures par `include: { media: true }` lui sont **invisibles**. La
  propriété qu'elle garantit ne couvre donc pas le cas principal ici.
- 🔴 `lint:journal-tracked` s'applique à `src/pim/**`. Le journal de la
  médiathèque **existe depuis le 2026-09-23** (décision Hugo : « on le fait ») ;
  sortir du dossier le ferait donc sortir du périmètre de la porte **sans rien
  casser** — les faits resteraient écrits, et plus rien ne garantirait que le
  prochain geste le soit. Le lot ② doit **étendre le périmètre de la porte à
  `src/media/**`**, sinon on perd une garantie qu'on vient d'acquérir.
- ⚠️ Cette porte cherche les handlers qui injectent un `*Repository`. Les ports
  de la médiathèque s'appellent `MediaLibrary*` : elle **ne les voyait pas**, et
  c'est Hugo qui a réclamé le journal, pas elle. L'étendre au dossier ne suffit
  donc pas — il faudra aussi qu'elle reconnaisse ces noms-là.
- ⚠️ **Cinq registres tenus à la main** doivent connaître `media`, et aucun
  n'échoue si on l'oublie : `BLOCKS` (porte de propriété), la carte de
  `context-boundaries`, `datasource.prisma`, `schema-ops.counter.ts`
  (`MediaAsset: "pim"`), et le préfixe `media_asset.` d'`activity-module.ts`
  (posé le 2026-09-23 — il range les faits par module, et un fait sans module
  fait échouer un test).

---

## 4. 🔴 Un seul point pour le texte alternatif

> « plus d'alt dans le PIM, un seul point dans la médiathèque ».

`alt` est **déjà** une colonne de `media_asset`. Ce qui change, c'est ce qu'elle
affirme — et la décision contredit une justification écrite dans le dépôt, qu'il
faut citer plutôt que contourner :

> « Une ligne par lien, et non une ligne partagée : le `alt` appartient à la
> FICHE (c'est ainsi que CE produit décrit l'image), et partager la ligne ferait
> qu'en corriger un changerait silencieusement l'autre. »
> — `prisma-editorial.repository.ts`

**Cette phrase ne devient pas fausse : elle devient assumée.** Corriger
l'alternative d'une image changera ce que toutes les fiches en disent. C'est le
sens de « un seul point » : une image, une description, corrigée une fois.

⚠️ **J'avais avancé un troisième argument — « le panneau ne saisit l'alternative
qu'au dépôt, donc la personnalisation par fiche est un mécanisme sans usage ».
Il est FAUX**, et je l'avais écrit sans ouvrir le fichier : `visuals-form.ts:108`
appelle `setMediaAltText(index, …)` depuis **l'éditeur de fiche**, indexé par
emploi, et le même mécanisme existe côté familles. Je le retire au lieu de le
corriger : la décision tient sur ses deux autres appuis, pas sur celui-là.

### 🔴 Ce que « un seul point » VIDE, et que personne n'a encore dit

`alt` est déjà sur l'actif ; il n'y a donc **aucune donnée à déplacer**. Mais la
décision a une conséquence d'écran que le plan taisait.

Aujourd'hui, le texte alternatif se saisit **depuis la fiche produit** — le
panneau `alt-text-panel` porte les trois langues, et c'est son nom même. Ce
texte arrive dans la bibliothèque parce que `replaceMedia` recrée un actif à
chaque enregistrement, en y recopiant ce que l'écran lui passe.

➡️ Au ②, le PIM cesse d'écrire des actifs. **La saisie de l'alternative depuis
la fiche n'a donc plus où aller**, et elle doit déménager dans la médiathèque —
qui ne la propose pas encore (le lot 4 y a mis l'étiquette, les mots-clés et le
point focal, pas l'alternative).

| Écran               | Avant ②                                 | Après ②              |
| ------------------- | --------------------------------------- | -------------------- |
| Panneau de la fiche | nom, **alternative ×3**, usage, retrait | usage, retrait       |
| Médiathèque         | étiquette, mots-clés, point focal       | + **alternative ×3** |

⚠️ **Le panneau de la fiche perd sa raison d'être principale.** Il s'appelle
« texte alternatif » et n'en portera plus. À renommer au même passage, sinon le
prochain lecteur cherchera longtemps ce qu'il décrit.

C'est cohérent avec la décision — une alternative décrit l'image, pas ce que la
fiche en fait — mais ça se paie en gestes : qui rédige une fiche devra aller
décrire l'image ailleurs. **Le dire avant de le faire.**

### Le critère de fusion — inopérant, puis sans objet

J'avais écrit « la plus récente **non vide** ». Or `media.ts:90` :

```ts
alt: localizedText("texte alternatif", input.alt ?? { [SOURCE_LOCALE]: url }),
```

🔴 **`alt` n'est JAMAIS vide** — sans saisie, on y met l'URL, et
`prisma-media-library.ts:38` fait pareil au dépôt en le disant. Mon critère se
réduisait donc à « la plus récente », c'est-à-dire celle du dernier produit
enregistré : il aurait remplacé une phrase humaine par `https://cdn/…/a.png`,
sur toutes les fiches, sans filet.

### ✅ Mesuré le 2026-09-23 : la fusion ne choisit rien

Les trois comptages du §6 rendent **0, 0 et 0** en production.

| Question                                                         | Réponse   |
| ---------------------------------------------------------------- | --------- |
| Des images portent-elles des alternatives humaines divergentes ? | **non**   |
| Une URL est-elle attachée deux fois au même produit ?            | **non**   |
| Combien d'emplois verraient leur alternative changer ?           | **aucun** |

➡️ Pour chaque image, **toutes ses lignes disent déjà la même chose**. « Un seul
point » ne fusionne rien, ne choisit rien, ne perd rien.

**Et donc rien ne part.** Ni empreinte de révision recalculée
(`prisma-catalog-revision.source.ts:106`), ni diff de livraison annonçant « l'image
a changé » (`delivery-diff.ts:184`). L'objection qui portait sur ce point est
sans objet **en l'état du fonds**, pas en principe : le critère corrigé — « la
plus récente dont l'alternative diffère de l'URL » — reste celui à écrire, parce
qu'il devra tenir le jour où quelqu'un aura édité deux fiches différemment entre
la mesure et la migration.

⚠️ **Ces trois zéros datent du 2026-09-23.** Les relire avant d'écrire la
migration, pas après : ils décrivent un fonds, et un fonds bouge.

---

## 5. 🔴 La suppression : la base ne refuse plus, et le BALAYEUR ne sait plus

> Hugo : « on ne peut pas supprimer une image qui a été mappée quelque part ».

Tenue aujourd'hui par Postgres — `ON DELETE RESTRICT` sur les deux FK (vérifié
dans les deux migrations). Sans clé étrangère vers un actif, plus rien ne refuse
tout seul.

⚠️ **Ma première version nommait la règle sans la payer.** Elle promettait « un
test qui supprime une image portée et attend un refus ». Un test ne couvre pas
le **ramasseur d'orphelins**, qui a sa propre voie de suppression et son propre
critère :

```ts
where: { storageKey: { not: null }, products: { none: {} }, categories: { none: {} } }
```

🔴 Quand `media_id` et sa FK tombent, `products` et `categories` **n'existent
plus comme relations**. Le balayeur conclurait « orphelin » sur **tout le
fonds** et supprimerait de R2 des images affichées — automatiquement, sans
personne devant un écran, et sans que Postgres puisse refuser puisque le
`RESTRICT` vient de partir.

➡️ Ce que le plan doit porter, et qui manquait :

1. `findOrphanKeys` **et** `isStillOrphan` passent par `MediaCarriers` ;
2. le balayeur **s'abstient** quand un porteur ne répond pas — sinon une panne
   du port devient une suppression de masse ;
3. la suppression manuelle compte les emplois d'abord, et refuse en entier.

⚠️ `forget()` supprime par `storageKey`, donc plusieurs lignes à la fois : même
aujourd'hui, le « impossible » du `RESTRICT` est en réalité un « refusé après
coup ».

---

## 6. Les trois comptages — faits

Ils se lisent en **production**, et c'est Hugo qui les a lancés. Les résultats
sont plus bas.

```sql
-- Combien d'images portent des alternatives HUMAINES divergentes.
-- Le `IS DISTINCT FROM a.url` écarte le repli automatique : sans lui, le
-- chiffre compte des URL et ne veut rien dire.
SELECT count(*) AS urls_divergentes FROM (
  SELECT a.url FROM pim.media_asset a
  WHERE a.alt->>'fr' IS DISTINCT FROM a.url
  GROUP BY a.url HAVING count(DISTINCT a.alt->>'fr') > 1
) t;
```

```sql
-- Une même URL attachée DEUX FOIS au même produit (§2). Si > 0, la clé
-- primaire `(product_id, media_url)` échoue à la migration.
SELECT count(*) AS emplois_en_double FROM (
  SELECT pm.product_id, a.url FROM pim.product_media pm
  JOIN pim.media_asset a ON a.id = pm.media_id
  GROUP BY pm.product_id, a.url HAVING count(*) > 1
) t;
```

```sql
-- Combien d'emplois verraient leur alternative CHANGER : ceux qui portent
-- aujourd'hui le repli automatique alors qu'une autre ligne de la même image
-- porte une vraie phrase. C'est ce nombre, et lui seul, qui dit si un diff de
-- livraison part vers les clients pros.
SELECT count(*) AS emplois_qui_changent
FROM pim.product_media pm
JOIN pim.media_asset a ON a.id = pm.media_id
WHERE a.alt->>'fr' = a.url
  AND EXISTS (
    SELECT 1 FROM pim.media_asset b
    WHERE b.url = a.url AND b.alt->>'fr' IS DISTINCT FROM b.url
  );
```

### ✅ Résultats — production, 2026-09-23

| Comptage               | Résultat | Ce qu'il retire du plan                                                       |
| ---------------------- | -------- | ----------------------------------------------------------------------------- |
| `urls_divergentes`     | **0**    | la fusion ne choisit rien, ne perd aucun écrit humain                         |
| `emplois_en_double`    | **0**    | la migration ne plante pas — mais l'identité reste `(produit, url, rôle)`, §2 |
| `emplois_qui_changent` | **0**    | aucune empreinte de révision ne bouge, aucun diff ne part                     |

⚠️ **À relire avant d'écrire la migration**, pas après. Ils décrivent un fonds
au 2026-09-23, et le geste de rôle livré la veille est précisément ce qui peut
le faire bouger.

---

## 7. Les trois déploiements

Additif, réversible, jamais une colonne supprimée dans le même passage
(`CLAUDE.md` §0).

### ① Étendre ✅ 2026-09-23 (`65661acf0`)

- `product_media` et `category_media` gagnent `media_url`, **nullable**,
  reportée sur l'existant et écrite en double.
- Deux index, parce que les lectures de ② chercheront par là.
- **Rien ne la lit.** Un `DROP COLUMN` suffit à revenir.
- Un e2e garde la double écriture sur les DEUX porteurs — c'est son seul
  garde-fou, aucune lecture n'en dépendant encore.

⚠️ Le schéma `media` n'est **pas** créé ici, contrairement à ce que ce plan
disait : la table n'a pas à être recopiée, elle se déplacera d'un
`SET SCHEMA` au ②.

### ② Basculer — le gros morceau, encore réversible

Dans cet ordre, parce qu'il est contraint :

1. **Le PIM cesse d'écrire des actifs.** `replaceMedia` désigne par `media_url`
   au lieu de créer un `MediaAsset` — c'est ce qui libère tout le reste
   (§0). Le dépôt par simple URL disparaît au même moment (§2).
2. **Les lectures passent sur `media_url`** : les deux `*-editorial.reader`, la
   source des révisions, la vitrine B2B. Les quatre passent par `include: { media }`
   aujourd'hui (§1) — c'est là que se cache le travail.
3. **Dédoublonnage** de `media_asset` par URL : le journal de lignes redevient
   une bibliothèque. Les trois comptages disent que rien n'est perdu (§6).
4. `ALTER TABLE "pim"."media_asset" SET SCHEMA "media"` — instantané.
5. **Le bloc `media/` naît** : module, route `/media` sans préfixe `pim`, les
   deux ports (§3), et le balayeur passe par `MediaCarriers` **avant** que la
   clé étrangère tombe (§5).
6. **Les six registres** : `BLOCKS`, `context-boundaries`, la matrice du
   `CLAUDE.md` §3, `datasource.prisma`, `schema-ops.counter.ts`, et le périmètre
   de `lint:journal-tracked`.
7. **Les écrans** : l'alternative quitte le panneau de la fiche pour la
   médiathèque (§4), et le panneau change de nom.

L'ancienne colonne `media_id` vit encore : on peut revenir.

### ③ Resserrer — IRRÉVERSIBLE

- `media_url` obligatoire, `media_id` et sa clé étrangère tombent, la clé
  primaire devient **`(produit, url, rôle)`** (§2).
- 🔴 **C'est ici que la règle de Hugo change de gardien.** Sans clé étrangère,
  plus de `ON DELETE RESTRICT` : « on ne supprime pas une image mappée » passe
  de Postgres au code. Le test qui l'éprouve doit exister **avant** ce
  déploiement, pas après (§5).

⚠️ **Ce qui est irréversible et ne se mesure pas** : une alternative écrite
**entre** la mesure et ③. Rejouer les trois comptages juste avant, et ne pas
lancer ③ sur un nombre vieux de plusieurs semaines.

---

## 8. Ce que la contradiction a retourné

Pour que ça ne se reperde pas — et parce que trois de ces objections portent sur
des phrases que j'ai écrites **sans ouvrir le fichier**, ce que l'en-tête de la
première version prétendait pourtant avoir fait. `vitruve` l'a relevé :
« cette phrase est plus coûteuse que son absence ».

| Ce que j'affirmais                                    | Ce qui est vrai                                                             |
| ----------------------------------------------------- | --------------------------------------------------------------------------- |
| « quatre fichiers touchent la bibliothèque »          | huit, dont quatre lisent par `include` — invisibles à un grep sur le modèle |
| « la plus récente **non vide** »                      | `alt` n'est jamais vide : sans saisie, c'est l'URL                          |
| « le panneau ne saisit l'alternative qu'au dépôt »    | il est dans l'éditeur de fiche, indexé par emploi                           |
| « la porte de propriété interdit au PIM d'écrire »    | son `BLOCKS` est en dur ; un bloc `media/` y serait **ignoré**              |
| « les deux autres adaptateurs déménagent tels quels » | le balayeur repose sur les relations que ③ supprime                         |
| « §4 paie la règle de suppression »                   | il la nommait ; le balayeur a sa propre voie                                |

**La racine est une seule** : j'ai compté en partant du code que je connaissais,
pas de la ressource. Un `include: { media: true }` ne contient pas le mot que je
cherchais.

---

## 9. Ce qui reste ouvert

| Sujet                            | Pourquoi                                                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Le **journal** de la médiathèque | sortir de `src/pim/` sort ses écritures de `lint:journal-tracked`. À décider, pas à subir (§3)                                           |
| `image_alt` **côté B2B**         | migrer dans le même passage, ou assumer un diff de livraison de masse (§4)                                                               |
| Le droit d'accès                 | le bloc n'a pas de ressource à lui ; l'écran est gardé par `pim_catalog:read`, ce qui redeviendra faux quand la vitrine entrera          |
| Le nom du modèle Prisma          | `media.asset` donnerait `Asset`, qui cohabiterait avec `MediaAsset` pendant tout ②                                                       |
| `countUrls()` sans plafond       | un `groupBy` qui ramène une ligne par URL pour n'en compter que le nombre. Tenable en milliers, pas au-delà — la bascule ne le règle pas |
