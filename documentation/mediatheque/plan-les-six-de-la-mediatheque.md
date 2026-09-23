# Plan — les six de la médiathèque

> Ouvert le **2026-09-23**. Six lots — cinq demandés d'un bloc (« fais tout »),
> le sixième ajouté dans la foulée : « un batch import, pour en importer plein,
> mais garder un historique de failure avec le nom de celle qui a échoué ».
> Chacun est indépendant des autres **sauf mention contraire** ; l'ordre ci-dessous
> est celui du coût de ne pas les faire.
>
> ⚠️ **Ce plan n'affirme de l'existant que ce qui a été ouvert.** Chaque fait
> porte son fichier et sa ligne, vérifiés le 2026-09-23.

---

## Lot 1 — La recherche côté serveur

### Ce qui est vrai aujourd'hui

- `GET /media` ne prend que `limit` et `offset`
  (`media/http/media-library.controller.ts`).
- L'écran charge 60 par page et **ne filtre rien** :
  `mediatheque-page.ts:19` (`PAGE_SIZE = 60`), aucune occurrence de recherche
  dans le fichier.
- Le **sélecteur** charge 100 (`library-picker.ts`, `PAGE_SIZE = 100`) et filtre
  dans le navigateur (`shown = computed(...)`).
- L'index GIN sur `tags` existe depuis
  `20260923120000_les_tags_de_la_mediatheque` et **n'est lu par personne**.

🔴 **Le sélecteur a donc un défaut, pas un manque** : l'image nᵒ 101 est
introuvable quoi qu'on tape. Le filtre porte sur ce qui est chargé, et rien ne
le dit à l'écran.

### Ce qu'on fait

1. `BrowseMediaLibrary` prend `q?: string` et `tags?: readonly string[]`.
2. `q` vise l'**étiquette** et les **tags**, jamais le nom de fichier — c'est
   déjà la règle du sélecteur (`library-picker.ts`), on la remonte au serveur.
3. `tags` filtre par `hasEvery` (ET, pas OU) : cocher deux mots-clés restreint.
4. `total` reste le total **du filtre**, pas du fonds — sinon « charger plus »
   promet des pages qui n'existent pas.
5. Les deux écrans envoient leur recherche ; le sélecteur perd son `computed`
   de filtrage.

### Ce qu'il faut décider

- ⚠️ **`q` sur les tags, en base, ne peut pas se faire par l'index GIN.** Le GIN
  sert `hasEvery`/`hasSome` sur des valeurs **exactes**. Une recherche par
  préfixe (« choc » → « chocolat ») ne l'utilise pas. Deux options :
  - (a) `q` cherche en préfixe sur `name` seulement, et les tags se choisissent
    **dans une liste** (ce que la palette montre déjà) — l'index sert, et rien
    ne ment ;
  - (b) `q` cherche aussi en préfixe sur les tags, par `unnest` — et l'index ne
    sert pas.

  ⚠️ **Et (a) telle qu'écrite était une RÉGRESSION**, non nommée. Le sélecteur
  filtre aujourd'hui par `includes` — une **sous-chaîne** — sur `name` **et**
  sur chaque tag (`library-picker.ts:97`). Passer au préfixe sur `name` seul
  perd donc deux choses d'un coup, et « on remonte la règle du sélecteur au
  serveur » était faux.

  ⚠️ **L'argument « l'index sert » ne tenait pas non plus** : le GIN est sur
  `tags`. Il ne sert pas une recherche sur `name`, qui n'a **aucun index**.

  **Recommandation révisée** : `q` cherche en **sous-chaîne insensible à la
  casse** sur `name` (comportement conservé), `tags` filtre par `hasEvery` via
  le GIN (nouveau, et c'est là que l'index sert), et la palette reste la façon
  de trouver un tag. Le `name` non indexé est assumé : le fonds se compte en
  milliers, pas en millions, et un index trigram se pose le jour où la mesure
  le demande — pas avant.

---

## Lot 2 — Donner un lecteur au point focal

### Ce qui est vrai aujourd'hui

- On l'**écrit** : `image-panel.ts:104` (`point()`), stocké par
  `PUT /media`, colonne `focal` du `media_asset`.
- `FocalPoint` est documenté dans `packages/pim-contracts/src/media.ts:37` —
  « décidé, pas mesuré », `null` = personne ne s'est prononcé.
- **Aucun lecteur.** Le chemin jusqu'à la boutique perd le champ à la
  **première** étape : `CatalogueImage`
  (`pim/channels/media/image-catalogue.ts`) ne le porte pas.

### Le chemin complet, étape par étape

| #   | Étage          | Fichier                                      | Ce qui manque                    |
| --- | -------------- | -------------------------------------------- | -------------------------------- |
| 1   | port           | `pim/channels/media/image-catalogue.ts`      | `focal` sur `CatalogueImage`     |
| 2   | adaptateur     | l'implémentation côté `media/`               | le lire                          |
| 3   | lecture PIM    | `product/domain/ports/editorial-reader.ts`   | `focal` sur `ProductMediaRecord` |
| 4   | canal          | `channels/b2b-platform/products/showcase.ts` | le passer dans `heroOf`          |
| 5   | contrat de fil | `packages/catalog-sync/src/snapshot.ts`      | `focal` sur `syncMediaSchema`    |
| 6   | boutique       | `product-sheet.html` + `.scss`               | `object-position`                |

### 🔴 Le point qui demande le plus d'attention — CORRIGÉ après contradiction

Le plan disait « `focal` entre optionnel et nullable » sur le fil, et laissait
la mécanique « non vérifiée ». Les deux étaient fautifs.

**Ce que le code dit** (vérifié le 2026-09-23) :

- `snapshot.ts:381` — `version: z.literal(CATALOG_SNAPSHOT_VERSION)`, valant
  **9**. Le fil refuse toute autre version, **inférieure comprise** ;
- `snapshot.ts:421` — `storedCatalogSnapshotSchema` relit les `jsonb` de
  l'inbox avec `version: z.union([5,6,7,8,9])` ;
- `snapshot.ts:430` — et il **réutilise** `syncMediaSchema` :
  `image: syncMediaSchema.nullable().optional()`.

🔴 **Donc un `focal` requis sur `syncMediaSchema` rendrait illisible toute
livraison en attente portant une image** — elle disparaîtrait de l'écran de
revue sans rien casser visiblement au déploiement. C'est exactement la panne
que le JSDoc de `storedCatalogSnapshotSchema` dit vouloir éviter.

Et « optionnel sur le fil » est l'autre faute, inverse : le fichier pose que
« le schéma du fil reste **strict** — un émetteur qui oublie un champ doit
échouer à l'émission, pas produire une arrivée dégradée ».

**La mécanique juste, en quatre gestes** (celle de la v9, qui a le même profil —
`publicTtcCents` est un ajout optionnel côté stocké et a produit un bump) :

1. `focal` **requis-nullable** sur `syncMediaSchema` — l'émetteur doit se
   prononcer, et `null` est une prononciation ;
2. `CATALOG_SNAPSHOT_VERSION` passe à **10** ;
3. `z.literal(10)` rejoint l'union du schéma stocké ;
4. le schéma stocké **redéfinit l'image** avec `focal` en `.optional()`, comme
   il le fait déjà pour `note`, `id` et `publicTtcCents`.

Sans le bump, deux formes de fil porteraient le même numéro, et le schéma
stocké n'aurait plus aucun moyen de distinguer un v9-sans-focal d'un
v9-avec.

### L'effet

`object-position: calc(x * 100%) calc(y * 100%)` sur l'image de la fiche. Sans
focal, rien n'est posé — le défaut CSS est déjà `center`, et c'est exactement ce
que `null` veut dire.

---

## Lot 3 — « Où sert cette image ? »

### Ce qui est vrai aujourd'hui

- `LibraryMediaView.uses` est **un nombre**
  (`packages/pim-contracts/src/media.ts:81`).
- Le refus de suppression le nomme (409), et on ne peut pas savoir **lesquels**.
- Le canal `media/channels/carriers/media-carriers.ts` déclare
  `usesOf(urls): Promise<ReadonlyMap<string, number>>` — il compte, il ne nomme
  pas.

### Ce qu'on fait

1. Le canal gagne `carriersOf(url): Promise<readonly Carrier[]>`, avec
   `{ kind: "product" | "category", id, label }`.
2. `GET /media/carriers?url=` rend la liste.
3. L'écran : cliquer le compteur ouvre un panneau qui liste les porteurs, avec
   un lien vers chacun.

### 🔴 La règle qui ne doit pas se dédoubler

`usesOf` **reste** ce que la suppression consulte. `carriersOf` ne la remplace
pas : compter et nommer sont deux questions, et faire décider la suppression sur
une liste nommée ferait dépendre un refus de la capacité à produire un libellé.

⚠️ Et le contrat du silence est le même : **un porteur qui ne répond pas doit
faire échouer**, jamais rendre une liste courte. Un écran qui affiche « aucun
porteur » là où un bloc s'est tu invite à supprimer ce qui sert.

### 🔴 Ce que le plan promettait sans le tenir : l'ACCORD des deux

Deux méthodes, deux requêtes, une seule vérité attendue. Un porteur listé sans
libellé, une jointure qui perd une ligne, et l'écran annonce « 3 porteurs » en
en listant 2 — le lecteur conclut alors que **le compteur ment**, et insiste
pour supprimer. Le garde-fou devient l'argument contre lui-même.

L'accord se tient par construction, pas par discipline : `usesOf` est
**dérivé** de `carriersOf` côté implémentation — compter, c'est mesurer la
liste. Les deux restent deux questions à l'extérieur ; elles n'ont qu'une
source à l'intérieur.

---

## Lot 4 — Remplacer une image

### Pourquoi c'est structurellement dur

La clé de stockage est le **SHA-256 du contenu**
(`documentation/mediatheque/la-mediatheque.md`, §1). Retoucher une photo produit
d'autres octets, donc une autre URL, donc :

- une image de plus dans le fonds ;
- tous les porteurs restés sur l'ancienne ;
- aucun geste pour les faire passer à la neuve.

C'est le prix de l'adressage par contenu, et il n'est payé nulle part.

### Ce qu'on fait

`POST /media/replace` — multipart : l'URL **remplacée** + les octets neufs.

1. Dépose les octets (même chemin que le dépôt normal : idempotent).
2. **Repointe** tous les porteurs de l'ancienne URL vers la neuve, en gardant
   **rôle et position**.
3. Reporte l'étiquette, les tags, l'alternative et le focal sur la neuve —
   **seulement si elle n'en a pas déjà** : les mêmes octets peuvent déjà être
   dans le fonds, décrits par quelqu'un d'autre.
4. Ne supprime PAS l'ancienne. Elle devient orpheline, et le ramassage
   quotidien s'en charge — qui a déjà toutes les gardes.

### 🔴 Le point le plus dangereux du plan

**Repointer, c'est ÉCRIRE dans `product_media` et `category_media`** — deux
tables du schéma `pim`, que `media/` ne possède pas et ne doit pas atteindre.
`lint:prisma-model-ownership` le refusera, et il aura raison.

Donc : le repointage est un geste que **le référentiel implémente**, exposé par
le canal `media/channels/carriers/` — qui existe déjà et est déjà implémenté par
le PIM. Le canal gagne `repoint(from, to): Promise<number>`.

### ✅ L'atomicité : la question a une réponse, et c'est « oui »

Vérifié : `MediaPrismaService` n'est **pas** un second client. Son module le
fournit en `useExisting: PrismaService`
(`media/infra/database/media-database.module.ts:18`), et `PimPrismaService`
suit la même mécanique. Le client unique est enveloppé par
`transactionalPrisma(countedPrisma(raw))`, et `PrismaUnitOfWork.run` route par
AsyncLocalStorage.

Donc une commande de `media/` **peut** ouvrir une transaction dans laquelle un
adaptateur de `pim/` écrit, et une unité déjà ouverte est **rejointe**, pas
imbriquée. La forme du lot tient.

### 🔴 Mais le dépôt des octets reste HORS de la transaction

Le plan enchaînait « ① dépose ② repointe » en invoquant « une seule
transaction ». `unit-of-work.ts` l'interdit en toutes lettres — « jamais un
appel réseau tiers, qui tiendrait la transaction ouverte » — et derrière le
pooler, une transaction tient une des cinq connexions.

`DepositImageHandler` respecte déjà cette borne : `store.put` est **hors** du
`uow.run`. Le périmètre transactionnel du remplacement est donc **repointage +
report des attributs + trace**, jamais le dépôt.

### ⚠️ Repointer le référentiel ne repointe PAS la boutique

`catalog.prisma:231` — l'article vendu porte `imageUrl String?`, une **copie**
obtenue par snapshot. Un remplacement réussi laisse donc la vitrine sur
l'ancienne image **jusqu'au prochain push de catalogue**.

Le geste tient sa promesse dans le back-office et ne la tient pas là où le
client regarde. À trancher : est-ce que le remplacement déclenche un push, ou
est-ce qu'il le **dit** à l'écran ? Ne rien dire est la seule option exclue.

### 🔴 Un remplacement est un fait du fonds, et il doit se journaliser

Le plan décrivait quatre effets et zéro ligne de journal. `media/` est une zone
de `lint:journal-tracked` depuis le 2026-09-23, et les trois handlers existants
tracent (`media_asset.deposited`, `.described`, `.discarded`).

⚠️ **Et la porte ne rattrapera pas cet oubli** : son audit ne se déclenche que
sur un nom de dépendance parmi `*Repository | MediaLibraryWriter |
MediaLibrary`. Un port nommé `MediaCarriers` passe **dessous**. C'est une
écriture non tracée que rien n'arrêterait — il faut donc la tracer parce qu'on
l'a décidé, pas parce qu'une porte l'exige.

⚠️ **Un conflit de clé primaire est possible** : si un porteur affiche DÉJÀ les
deux images, repointer produirait deux lignes identiques
`(porteur, url, rôle)`. Le repointage doit donc **fusionner** plutôt qu'écrire,
et la position du doublon disparaît.

## Lot 5 — Une ressource de permission à elle

### Ce qui est vrai aujourd'hui

- `media/http/media-library.controller.ts:65` porte
  `@AdminSurface("pim_catalog")`.
- Donc **qui lit le catalogue peut supprimer du fonds**.
- `staffResourceSchema` décrit encore `pim_catalog` comme couvrant
  « produits, familles, **médias**, allergènes, ingrédients »
  (`packages/contracts/src/staff-access.ts:60`).

### Le précédent à copier — et ce qu'il dit VRAIMENT

⚠️ **Le plan se trompait de précédent.** Il présentait `pim_tax` comme un
détachement de `pim_catalog`, gardé par un test. Vérifié :
`20260901200000_ressources_par_outil/migration.sql:38` fait
`WHEN 'tax' THEN 'pim_tax'` — c'est un **renommage** d'une ressource `tax` qui
existait déjà, pas un détachement. Un renommage ne redistribue aucun droit, et
n'a donc rien à rattraper. Le nom du test (`staff-access.spec.ts:58`) emploie
« détachant » au sens large.

**Le vrai précédent est dans la même migration, §2** (lignes 64-70) : quand
`pim_catalog` a réellement été éclaté vers `pim_channels`, `pim_settings` et
`b2b_catalog`, il a fallu un **backfill SQL des dérogations individuelles** —
`INSERT … FROM staff_permission_overrides o CROSS JOIN (VALUES …) WHERE
o.resource = 'pim_catalog' … ON CONFLICT DO NOTHING`.

### 🔴 Ce que ça change pour ce lot : il y a TROIS couches, pas une

Le plan n'en décrivait qu'une (les préréglages du code). Il y en a trois, et
chacune tient des droits réels :

| Couche                | Où                                       | Ce qu'il faut faire                                                                             |
| --------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Les **préréglages**   | `packages/contracts/src/staff-access.ts` | ajouter `media_library` partout où `pim_catalog` figure                                         |
| Les **rôles en base** | table `staff_role_definitions`           | un `UPDATE` du `jsonb` — la migration de 2026-09-01 y repose les cinq rôles de référence en SQL |
| Les **dérogations**   | table `staff_permission_overrides`       | le `CROSS JOIN` ci-dessus, sur `pim_catalog`                                                    |

⚠️ Et l'avertissement de cette migration vaut encore : « **un rôle créé par un
opérateur n'est PAS touché** ». Un rôle maison qui porte `pim_catalog` ne
recevra pas `media_library` — il faut soit l'`UPDATE` généralisé sur toutes les
lignes de la table, soit l'assumer et le dire.

### 🔴 Le test actuel ne garde pas ce qu'on croit

`staff-access.spec.ts:58` n'itère que `staffRoleSchema.options`, c'est-à-dire
les **préréglages du code**. Il ne voit ni la table des rôles, ni les
dérogations. Dire « un test garde le détachement » est faux au niveau qui
compte, et le lot doit donc apporter sa propre garantie côté SQL — pas se
reposer sur lui.

### ⚠️ La mesure qui décide du coût

Hugo seul peut la lancer :

```sql
SELECT resource, action, count(*)
FROM public.staff_permission_overrides
WHERE resource = 'pim_catalog'
GROUP BY resource, action;
```

Zéro ligne ⇒ le lot est du code et un `UPDATE` de rôles. Sinon, c'est une
bascule de données, et le §0 du `CLAUDE.md` impose alors trois déploiements.

## Lot 6 — L'historique des dépôts refusés

### Ce qui est vrai aujourd'hui, et c'est plus que je ne croyais

Le dépôt en lot **existe déjà** (`mediatheque/batch-upload.ts`, 130 lignes) et
fait la moitié de la demande :

- il enchaîne les fichiers **séquentiellement**, et la raison est écrite : le
  serveur lit les octets en mémoire pour les mesurer, avec une garde de
  transport à 25 Mo ;
- il **ne s'arrête jamais** sur un refus — « un fichier mal formé ne doit pas
  priver les dix-neuf autres de leur dépôt » ;
- il garde le **nom** et la **raison française** de chaque refus
  (`UploadEntry.reason`, lu de l'enveloppe et non de `message`) ;
- il sait **rejouer** les seuls refusés, sans risque de doublon.

🔴 **Ce qui manque est le mot « historique ».** Tout cela vit dans un `signal`
du navigateur. On ferme l'onglet, on recharge, et le compte rendu n'a jamais
existé. Personne ne peut dire demain ce qui n'est pas entré hier.

⚠️ **Le JSDoc du fichier cite `POST /pim/mediatheque`** — route qui n'existe
plus depuis le déménagement du 2026-09-23. À corriger dans ce lot.

### 🔴 Le compromis qu'il faut nommer avant d'écrire

Un historique persistant peut garder le **nom**, la **raison**, l'**instant** et
**qui** déposait. Il ne peut pas garder les **octets** : ils vivent dans le
navigateur, et un fichier refusé n'a, par définition, pas été stocké.

**Conséquence : un refus relu depuis l'historique ne se rejoue pas.** Il dit
quoi retrouver et pourquoi ça a échoué ; il ne remplace pas la file en mémoire,
qui reste le seul endroit d'où « Réessayer » est possible.

Les confondre serait la faute : un écran qui proposerait « réessayer » sur une
ligne d'historique promettrait un geste qu'il ne peut pas tenir.

### Ce qu'on fait

1. Le serveur **enregistre le refus** au lieu de se contenter de le renvoyer :
   `media_upload_failure` dans le schéma `media` — `{ id, fileName, bytes,
contentType, reason, code, at, by }`.
2. Ce n'est **pas** le journal : un refus n'est pas un fait survenu au fonds,
   c'est un fait survenu à une **tentative**. Le journal raconte la vie des
   images qui existent ; celles-ci n'existent pas.

   ⚠️ **Ce n'est PAS `lint:journal-tracked` qu'il faut craindre** : son audit
   ne se déclenche que sur un nom de dépendance parmi `*Repository |
MediaLibraryWriter | MediaLibrary`. Un `@sans-journal` posé là serait une
   exception sans objet — du bruit dans un mécanisme dont toute la valeur est
   qu'il se relit.

   🔴 **C'est `lint:prisma-schema-layout` qui mord** : la table doit être
   déclarée sous `prisma/schema/media/` **et** porter `@@schema("media")`. Le
   plan ne disait ni l'un ni l'autre. `lint:prisma-model-ownership`, lui,
   l'acceptera — `media` est dans `BLOCKS` depuis le déménagement.

3. `GET /media/failures?limit=` — les derniers refus, les plus récents d'abord.
4. L'écran : un volet « Refusés » sous le compte rendu du lot, qui survit au
   rechargement, avec nom · raison · quand · par qui.

   🔴 **La trace du refus s'écrit dans sa PROPRE unité de travail.** Le refus
   est levé **avant** le `uow.run` du dépôt (`deposit-image.ts:46`) ; la ranger
   dans l'unité de la commande la ferait emporter par le rollback, et
   l'historique serait vide précisément les jours où il sert.

5. Une **rétention** : les refus de plus de 90 jours sont ramassés par le même
   cron que les orphelines. Une table qui ne se vide jamais devient une dette
   silencieuse, et un refus de l'an dernier n'apprend plus rien.

### ⚠️ Ce qui reste à vérifier

- Le **nom de fichier est une donnée d'utilisateur**. Le plafonner (255) et ne
  jamais l'interpoler dans un message d'erreur sans échappement.
- **Combien de refus une rafale peut-elle produire ?** Cinquante fichiers mal
  formés déposés trois fois de suite font cent cinquante lignes. Faut-il
  dédoublonner sur `(fileName, reason)` dans une fenêtre courte ? Non tranché.
- ⚠️ **`bytes` et `contentType` peuvent être INDÉTERMINÉS** : un refus pour type
  non supporté n'a, par construction, pas de type constaté. Trois états à ne pas
  confondre — mesuré, mesuré-nul, pas mesurable.

---

## L'ordre, et ce qui dépend de quoi

| Lot                      | Dépend de                                          | Peut se déployer seul      |
| ------------------------ | -------------------------------------------------- | -------------------------- |
| 1 — recherche            | rien                                               | ✅                         |
| 2 — focal                | rien                                               | ✅ mais front+API ensemble |
| 3 — porteurs             | rien                                               | ✅                         |
| 4 — remplacer            | **lot 3** (le canal doit déjà nommer les porteurs) | ✅                         |
| 5 — permission           | rien                                               | ❌ **à trancher d'abord**  |
| 6 — historique des refus | rien                                               | ✅                         |

Les lots 1, 2, 3 et 6 sont additifs et sans risque de données. Le lot 4 écrit.
Le lot 5 touche des droits.

---

## Les JSDoc que ces lots vont lire, et qui sont FAUX

Deux justifications fondent des mécanismes que les lots 3 et 4 touchent, et
elles parlent d'un état révolu :

- `media/channels/carriers/media-carriers.ts` affirme que la règle « est encore
  tenue par Postgres » et « passera au code quand `media_id` tombera
  (déploiement ③) ». **`media_id` est tombé** ;
- `media/http/media-library.controller.ts` dit que « le préfixe `/pim` reste »,
  alors que le contrôleur est en `@Controller("media")`.

Les corriger fait partie des lots, pas d'un nettoyage séparé : un lot qui
s'appuie sur une phrase fausse la recopie.

---

## Ce que ce plan N'A PAS vérifié

- **Le compte de dérogations `pim_catalog` en production.** Il décide si le lot
  5 coûte une migration ou un `SELECT` à zéro ligne, et il ne se lit qu'en prod.
- **Ce que la boutique fait d'un `object-position`** — `product-sheet.html` et
  son `.scss` n'ont pas été rouverts pour le lot 2, étape 6.
- **La clé du fait de journal d'un remplacement** (`media_asset.replaced` ?) :
  rien dans `pim-journal.ts` ne le prévoit, et aucune convention de nommage n'a
  été cherchée.
