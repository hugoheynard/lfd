# La médiathèque — plan

> **Plan**, écrit le 2026-09-23. Chaque affirmation sur l'existant a été
> vérifiée en ouvrant le fichier ou la migration citée.
>
> Décision Hugo : « on fait la médiathèque accessible depuis le menu primary »,
> « son seul but serait de faire du batch import et du tag de contenu, ensuite
> dans le pim on ferait recherche et attribution ».

---

## 1. Ce qui manque n'est pas un écran, c'est une IDENTITÉ

`replaceMedia` (`prisma-editorial.repository.ts:60`) supprime les liens puis
**recrée un `MediaAsset` neuf par visuel**, identifiant neuf compris, à chaque
enregistrement de la section Visuels.

🔴 **`media_asset` n'est donc pas une bibliothèque : c'est un journal de lignes
recréées à chaque sauvegarde.** Rien à rechercher, rien à taguer, rien à
réutiliser — un actif n'a pas d'existence qui traverse deux enregistrements.

Ce qui traverse, c'est l'**URL**, parce qu'elle est adressée par contenu
(`products/{sha256}.{ext}`) : les mêmes octets donnent toujours la même adresse.
Le dépôt s'appuie déjà dessus — `factsFor(url)` reporte largeur, hauteur, poids
d'une ligne à la suivante, et depuis le 2026-09-23 le point focal aussi.

➡️ **La bibliothèque existe en creux : l'identité d'une image est son URL.** La
médiathèque ne l'invente pas, elle la rend visible — et lui donne enfin un
endroit où poser ce qui appartient aux octets plutôt qu'à une fiche.

⚠️ **Conséquence sur toute liste** : une requête naïve sur `media_asset`
montrerait la même image autant de fois qu'elle a été enregistrée. Toute lecture
de la médiathèque **groupe par URL**.

---

## 2. 🔴 La règle : on ne supprime pas une image qui sert

> Hugo, 2026-09-23 : « seule règle à noter, on ne peut pas supprimer une image
> qui a été mappée quelque part ».

**Elle est déjà tenue, et au meilleur niveau possible — par la base.** Les deux
clés étrangères vers `media_asset` sont en `ON DELETE RESTRICT` :

| Contrainte                     | Migration                                     |
| ------------------------------ | --------------------------------------------- |
| `product_media_media_id_fkey`  | `20260820160000_schema_pim`                   |
| `category_media_media_id_fkey` | `20260827090000_textes_et_visuels_de_famille` |

Postgres refuse la suppression d'un actif porté, quel que soit le code qui la
demande. C'est le deuxième barreau de l'échelle — refusé en base — et il n'y a
rien à ajouter pour obtenir la règle.

### ⚠️ Mais la règle a un angle mort, et il vient du §1

Puisque plusieurs lignes partagent une URL, « supprimer l'image » de la
médiathèque voudrait dire supprimer **toutes** les lignes portant cette URL. Or
elles ne sont pas dans le même état : les anciennes ne sont portées par
personne, la dernière l'est.

Une suppression ligne à ligne verrait donc les copies orphelines partir et la
dernière être refusée — **une image à moitié supprimée**, et une médiathèque qui
dit « échec » après avoir détruit quelque chose.

➡️ La suppression doit être **décidée sur l'URL, pas sur la ligne** : on compte
d'abord les emplois de cette URL, on refuse en entier, et on ne supprime rien
tant qu'un seul emploi existe. Le `RESTRICT` reste le filet ; il ne doit pas
être le premier à parler.

### Ce que ça ne concerne pas

Le **ramassage des orphelins** (`sweep-orphan-media`) ne touche déjà que ce que
personne ne porte, et rejoue la vérification juste avant chaque suppression. Il
obéit à la règle de Hugo sans modification.

---

## 3. Où elle vit : au premier niveau

Le menu primaire, et pas une vue du PIM.

Le précédent est écrit dans `app.html` à propos des **Outils agent** : « l'atelier
qui PILOTE le référentiel, pas un écran du référentiel : sa route est de premier
niveau ». La médiathèque est dans le même cas, avec un argument de plus :

🔴 **Elle n'appartient à aucun référentiel.** Les produits en portent, les
familles aussi (`CategoryMedia`), et les visuels de maison ou d'opération
viendront. La ranger sous « PIM » affirmerait que le référentiel produit possède
la bibliothèque — ce que le domaine dit déjà être faux :

> « Ces règles vivaient sous `product/`, du temps où une fiche était le seul
> porteur possible. […] ni l'un ni l'autre ne possède la bibliothèque. »
> — `shared/domain/value-objects/media.ts`

---

## 3 bis. 🔴 En base : `pim` aujourd'hui, un bloc à elle à terme

> Hugo, 2026-09-23 : « mais si on a une médiathèque elle va sûrement aussi
> contenir les contenus du site vitrine sur les cartes et tout » — puis, sur les
> trois issues : « B plus long terme ».

**Les tables sont dans `pim`** (`media_asset`, `product_media`,
`category_media`, toutes en `@@schema("pim")`), et elles y restent pour ce
chantier.

### Pourquoi ça ne peut pas durer

Le contenu de la vitrine n'est **pas** dans `pim` : `PlatformContent` est en
schéma `public`, servi par `b2b/content/` (vérifié le 2026-09-23). Dès qu'un
visuel de carte ou de page entre dans la bibliothèque, **deux blocs l'écrivent**
— et la matrice du `CLAUDE.md` ne laisse `b2b` atteindre `pim` que par un canal.

Faire lire la bibliothèque du référentiel à la vitrine pour ses propres photos
serait à l'envers : une photo de devanture n'est pas une donnée de catalogue.

### ⚠️ L'argument qui semblait tenir, et qui ne tient pas

« Sortir la bibliothèque casserait `lint:cross-schema-join`, puisque le comptage
des emplois joint `media_asset` à `product_media`. »

C'est **circulaire** : ça défend le schéma par une requête qu'on est en train
d'écrire. L'en-tête de la porte donne elle-même la sortie — « le franchissement
passe par un port ». Chaque bloc répond « combien des miens portent cette
URL », et il n'y a plus une seule jointure.

### 🔴 La ROUTE et le SCHÉMA ne coûtent pas la même chose

Hugo, 2026-09-23 : « mais là tu es toujours catalogue, on avait dit à part non ?
schéma et routes ? » — et les deux moitiés n'ont pas le même prix.

|                            | État                   | Pourquoi                                                                                                                     |
| -------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `catalogue/` dans la route | **parti** (2026-09-23) | rien ne le retenait : la surface est `mediatheque`, et le segment affirmait une propriété que le référentiel produit n'a pas |
| `/pim` dans la route       | reste                  | monté par le BLOC (`pim.module.ts`), et le code y vit encore                                                                 |
| `@@schema("pim")`          | reste                  | migration de données                                                                                                         |

➡️ **Le préfixe `/pim` et le schéma Postgres tomberont ENSEMBLE**, au même
déclencheur, parce qu'ils disent la même chose : dans quel bloc ce code vit.
Le segment `catalogue/`, lui, ne disait rien d'autre qu'une propriété — il
partait pour zéro.

⚠️ `POST /pim/catalogue/media` survit en **alias déprécié**, et pas par
timidité : le back-office et l'API se déploient séparément, donc un front encore
en ligne appelle encore ce chemin pendant quelques minutes. Un contrat déjà
servi ne se casse pas dans le même déploiement (`CLAUDE.md` §0). Il se supprime
au déploiement suivant — c'est écrit au-dessus de la route.

### La cible (B), et ce qu'elle coûte

Un bloc `media/`, son schéma, et le lien par **identifiant opaque** — l'URL,
adressée par contenu, qui est déjà la seule identité survivant à un
enregistrement (§1). C'est le motif que le dépôt applique partout entre blocs.

🔴 **Le prix est la règle de suppression.** Elle est aujourd'hui tenue par
Postgres (`ON DELETE RESTRICT`, §2). Sans clé étrangère, la base ne peut plus
refuser : la règle descend d'un barreau, du « refusé en base » au « refusé par
le code ». Ce n'est pas un détail — c'est la seule chose que ce déménagement
dégrade.

### Le déclencheur, écrit pour ne pas devenir un « à voir »

➡️ **B devient dû le jour où le PREMIER visuel de vitrine entre dans la
bibliothèque.** Pas « quand on aura le temps ».

La raison de ne pas le faire maintenant est mesurable et non pas prudente : la
bibliothèque n'a **aucun** écran, aucune route de lecture, aucun tag. Déménager
maintenant, c'est payer une migration pour un fonds vide ; déménager après le
contenu vitrine, c'est la payer pleine. Le créneau est entre les deux, et le
déclencheur le nomme.

⚠️ B est une **migration de données** : `vitruve` d'office avant de soumettre
son plan (`CLAUDE.md` §9 bis).

---

## 4. Le renversement : taguer à la source, attribuer à l'usage

| Aujourd'hui                                         | Avec la médiathèque                    |
| --------------------------------------------------- | -------------------------------------- |
| une image entre **par** une fiche                   | une image entre par la bibliothèque    |
| elle n'est nommée que si quelqu'un y pense          | elle est nommée et taguée **une fois** |
| son rôle se choisit… nulle part (sauf `hero`)       | son rôle se choisit à l'attribution    |
| la retrouver = se souvenir de quelle fiche la porte | la retrouver = chercher                |

C'est la même règle que l'inventaire des rôles avait déjà énoncée sans la
nommer : **le ratio se vérifie à l'affectation, pas au dépôt.** Un même fichier
peut servir de `hero` ici et de `lifestyle` ailleurs ; ce qui est vrai des
octets se décide au dépôt, ce qui est vrai d'un emploi se décide à l'emploi.

### Le tri, une fois pour toutes

| Appartient aux OCTETS (bibliothèque) | Appartient à l'EMPLOI (le lien) |
| ------------------------------------ | ------------------------------- |
| l'étiquette (`name`)                 | le **rôle**                     |
| les tags                             | la **position**                 |
| le **point focal**                   | le **texte alternatif**         |
| largeur, hauteur, poids, type        |                                 |

⚠️ Le texte alternatif est du côté de l'emploi, et le repository dit pourquoi :
« c'est ainsi que CE produit décrit l'image ». Ne pas le déménager dans la
médiathèque par symétrie — deux fiches n'ont pas à décrire la même photo avec
les mêmes mots.

---

## 5. Les lots

### Lot 1 — la bibliothèque se lit

`GET /catalogue/media` — la liste, **groupée par URL**, avec pour chacune :
l'étiquette, les faits mesurés, le point focal, et le **nombre d'emplois**.

Le compte d'emplois n'est pas décoratif : c'est lui qui permet à l'écran de dire
« cette image sert dans 3 fiches » **avant** de proposer de la supprimer, plutôt
que d'essuyer un refus.

### Lot 2 — l'écran, et son entrée de premier niveau

Route `/mediatheque`, entrée dans le rail primaire, grille d'aperçus.
Droit : `pim_catalog:read` pour voir, `pim_catalog:write` pour déposer.

### Lot 3 — le dépôt en lot

`POST /catalogue/media` existe et prend **un** fichier. Le lot, c'est l'écran
qui les enchaîne et rend compte fichier par fichier — l'adressage par contenu
rend le redépôt idempotent, donc une reprise après échec partiel ne duplique
rien.

### Lot 4 — nommer, taguer, pointer

L'étiquette existe déjà en base (`name`), le point focal aussi. Les **tags** sont
neufs.

#### 🔴 Vocabulaire LIBRE, et à plat

> Hugo, 2026-09-23 : « non pas de hiérarchie texte libre ». Un tag racine a été
> envisagé puis écarté dans la foulée — « oublie le concept racine ».

**Aucune hiérarchie, aucune racine.** Pas d'arbre, pas de parent, pas de chemin,
pas de mot imposé à l'entrée — une liste plate de mots que quelqu'un écrit.

C'est un choix contre le précédent des catégories d'allergènes, qui sont un
arbre déplaçable, et il se défend : un vocabulaire fermé ou structuré se garde
par le type et ne se remplit jamais ; un vocabulaire libre se remplit vraiment.
Pour retrouver une photo, ce qui compte est qu'il y ait des mots dessus, pas
qu'ils soient bien rangés.

⚠️ **La contrepartie est assumée** : rien ne rapprochera « croissant » de
« viennoiserie ». La recherche rendra ce qu'on a écrit, et une image mal taguée
sera introuvable jusqu'à ce que quelqu'un la retague. C'est le prix d'un champ
que les gens remplissent.

**Normalisation** — la seule règle, et elle n'est pas négociable : découpé, mis
en minuscules, dédoublonné. Deux personnes qui écrivent « Croissant » et
« croissant » doivent retrouver les mêmes images, sinon le vocabulaire libre
devient un vocabulaire à doublons, ce qu'on lui reproche à juste titre.

➡️ Un `String[]` sur l'actif, et pas une table : sans hiérarchie ni propriétés,
une table de tags n'apporterait qu'une jointure. Le jour où un tag devra porter
autre chose que son nom, ce sera une décision à prendre, pas un regret.

#### La BANDE, et pourquoi ce n'est pas un panneau par image

> Hugo, 2026-09-23 : « sur médiathèque faire une bande pour ajouter des tags en
> mémoire, on devra drag and drop les tags, avec une recherche de tag pour quand
> il y en aura trop ».

Un panneau par image ferait ouvrir, saisir, fermer — **trois gestes par
photo**. La bande inverse : le mot se fabrique une fois, puis se **pose** sur
autant d'images qu'on veut. C'est le geste d'un fonds, pas celui d'une fiche.

🔴 **Le vocabulaire est DÉRIVÉ, il n'a pas de table.** La bande montre ce que
les images chargées portent déjà, plus ce que quelqu'un vient d'écrire. Un tag
créé mais jamais posé **ne survit pas** au rechargement — c'est cohérent avec
le modèle (un mot que rien ne porte n'existe pas) et ça évite un second endroit
où un vocabulaire pourrait diverger de son usage.

⚠️ **Le glisser-déposer est doublé d'un clic**, et ce n'est pas du confort : on
ne glisse pas au clavier. Cliquer un tag l'**arme**, cliquer une image le pose.
Une bande utilisable à la seule souris fermerait l'écran à qui navigue
autrement.

La **recherche** n'apparaît qu'au-delà de six mots — avant, elle serait un champ
de plus à ignorer — et cherche **n'importe où** dans le mot : savoir comment un
tag commence est précisément ce qu'on ignore quand on le cherche.

#### 🔴 Les trois écritures partent ENSEMBLE

Le serveur écrit `name`, `tags` et `focal` d'un bloc : c'est un remplacement,
pas une retouche. Poser un mot-clé renvoie donc l'étiquette et le point
**inchangés**, sinon les poser les effacerait.

⚠️ Lecture-modification-écriture : deux personnes qui taguent la même image en
même temps, c'est la dernière qui gagne. Acceptable pour un mot-clé ; ça ne le
serait pas pour une donnée réglementaire.

#### Ce que le report a dû apprendre

Les tags se reportent d'une inscription à la suivante **comme le point focal**,
et par une lecture qui leur est propre : une image peut être taguée sans être
pointée, et l'inverse. Les chercher sur la même ligne ferait perdre celui des
deux qui n'a pas été décidé en dernier. Un e2e le tient — « garde les mots-clés
après un enregistrement de la section ».

⚠️ **Ce qui reste en double écriture** : l'étiquette (`name`) se saisit AUSSI
depuis le panneau de la fiche produit. Deux écrans écrivent donc la même
propriété de bibliothèque, et le dernier gagne. Ça se résout au plan B, quand le
référentiel deviendra un mappeur et cessera d'écrire des propriétés d'image.

### Lot 5 — la recherche et l'attribution, côté fiche ✅ 2026-09-23

Le renversement, enfin visible : la section Visuels gagne « **Choisir dans la
médiathèque** » à côté du dépôt — et non à sa place. Une image neuve entre
toujours par le dépôt ; une image qui existe n'a aucune raison d'être renvoyée.

La recherche du panneau vise **l'étiquette et les mots-clés**, jamais le nom de
fichier : personne ne se souvient de `a3f9….png`, et c'est précisément pour ça
que les tags existent.

⚠️ Les images **déjà portées par la fiche** s'affichent grisées et hors
d'atteinte plutôt que masquées : les cacher ferait chercher une photo qu'on
croit absente alors qu'elle est là.

#### 🔴 Les cinq usages deviennent atteignables

Jusqu'ici, un seul des cinq rôles avait un écran — `hero`, par une case
« Principal ». Le panneau propose désormais les cinq, **avec leur ratio dans le
libellé** : c'est au moment de choisir qu'on a besoin de savoir quelle forme le
canal attend, pas dans une documentation qu'on ira lire un autre jour.

#### ⚠️ Le geste d'unicité était trop large, et ça ne se voyait pas

`setMainVisual` rendait **tous** les autres visuels à `gallery`. C'était sans
conséquence tant qu'aucun écran ne proposait les quatre autres usages — et
aurait effacé une mise en situation et un tirage papier dès qu'on les a ouverts.

`setMediaRole` ne déloge désormais que **le porteur du même rôle unique**
(`hero`, `thumbnail`). Un rôle pluriel ne déloge personne : une fiche peut
porter dix images de galerie et trois mises en situation.

#### 🔴 Un troisième commentaire dangereux, dans le même fichier

Le JSDoc de `VisualsForm` affirmait : « il n'y a ni "principale" ni rôle à
choisir ici […] ni la projection Shopify ni le B2B ne lisent le rôle ». **Les
deux moitiés étaient fausses** — la vitrine B2B cherche précisément le `hero`,
et Shopify est sorti du dépôt le 2026-09-21. C'est le même mensonge que celui
qui gardait `DEFAULT_MEDIA_ROLE`, recopié dans un second fichier. Corrigé.

### Lot 6 — la suppression

Selon §2 : décidée sur l'URL, refusée en entier dès un emploi, avec le compte
dans le message.

---

## 6. Ce que ce plan ne tranche pas

| Sujet                                                                        | Pourquoi c'est ouvert                                                                                                  |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Faut-il **arrêter** de recréer un actif par enregistrement ?                 | ce serait la vraie correction du §1 — mais c'est une bascule de données, donc `vitruve` d'office et trois déploiements |
| Les visuels de **maison** et d'**opération** rejoignent-ils la médiathèque ? | ce serait un troisième porteur ; décision non prise (cf. `plan-ouvrir-le-point-focal.md` §7)                           |
| Le journal                                                                   | une propriété de bibliothèque n'a pas de sujet à nommer ; déposer, taguer et pointer ne laisseront aucune trace        |
