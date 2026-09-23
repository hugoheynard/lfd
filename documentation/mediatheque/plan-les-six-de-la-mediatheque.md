# Ce que le fonds d'images sait faire

> ⚠️ **Le nom de ce fichier ne peut pas changer.** Deux migrations appliquées le
> citent (`20260923190000`, `20260923200000`), et une migration ne se retouche
> pas — même un commentaire change son empreinte.
>
> Il a été écrit comme un **plan** le 2026-09-23, contredit par `vitruve`
> (3 BLOQUANT, 8 SÉRIEUX), corrigé, puis exécuté. Il est devenu ce qu'il décrit :
> **des capacités**, à l'affirmatif. Ce qui n'est pas fait est nommé à la fin, et
> nulle part ailleurs.

---

## 0. Le journal appartient à la plateforme

`platform/journal/scoped-journal.ts` porte le **laissez-passer d'écriture** :
`trace`, `untraced`, et le symbole privé qui frappe le ticket. Un dépôt exige ce
ticket en paramètre ; on ne peut l'obtenir qu'en traçant. **Écrire sans tracer ne
se refuse pas en revue : ça ne compile pas.**

Le **vocabulaire** reste chez celui qui le prononce. `media/journal/` nomme les
trois faits du fonds — `deposited`, `described`, `discarded` — et n'a **aucune
portée** : une image déposée ne touche rien, et on refuse de retirer celle qui
sert.

🔴 Ce fichier portait sa propre règle : « promouvoir en `platform/` au troisième
bloc émetteur ». Le troisième n'a pas été celui qu'on attendait — c'est la
médiathèque, qui importait `PimJournal`. Un bloc indépendant tenait sa garantie
d'écriture d'un bloc voisin.

⚠️ **Un seul symbole de ticket pour tous les blocs**, assumé : un ticket frappé
par le référentiel satisfait la signature d'un dépôt de la médiathèque. S'en
prémunir demanderait un type générique de plus sur chaque port de dépôt, contre
un handler qui injecterait le journal d'un AUTRE bloc — ce que la matrice des
frontières refuse déjà.

**Ce que la porte a appris ce jour-là** : `lint:journal-tracked` cherchait
littéralement `PimJournal`, y compris dans la zone `media`. Le nom du journal est
devenu un paramètre de zone — sans quoi elle aurait exigé de la médiathèque le
journal du bloc dont on venait de la détacher.

---

## 1. La recherche cherche dans le fonds

`GET /media?q=&tags=`. Le texte vise l'**étiquette**, en sous-chaîne, casse
ignorée. Les mots-clés filtrent par `hasEvery` — **tous**, pas au moins un :
cocher un second tag est le geste de quelqu'un qui a trop de résultats, et un
« ou » ferait l'inverse de ce qu'il demande. C'est là que sert l'index GIN.

⚠️ **Jamais le nom de fichier** : personne ne se souvient de `a3f9….png`, et
c'est précisément pour ça que les étiquettes et les tags existent.

🔴 C'était un **défaut** avant d'être un manque. Les deux écrans filtraient ce
qu'ils avaient chargé — la médiathèque par soixante, le sélecteur par cent.
L'image cent-unième était introuvable quoi qu'on tape, et **rien ne le disait** :
ça ne cassait pas, ça cachait.

Trois pièges que l'écriture a fait apparaître :

- **la bande de tags cumule** son vocabulaire au lieu de le réécrire. Sans ça,
  filtrer faisait disparaître de la bande les tags absents du résultat — donc
  plus moyen d'élargir une fois qu'on avait filtré ;
- `total` est le total **du filtre**, sinon « charger plus » promet des pages qui
  n'existent pas ;
- **fonds vide ≠ recherche infructueuse**, des deux côtés : l'un demande de
  déposer, l'autre d'élargir.

---

## 2. Le compteur d'emplois mène quelque part

Le canal des porteurs nomme : `carriersOf(url)` rend les fiches et les familles
qui affichent une image, avec un lien vers chacune. `GET /media/carriers?url=`.

🔴 `uses` était un **nombre**. Le refus de suppression disait « 3 fiches
l'affichent » et s'arrêtait là : on empêchait le geste sans donner de quoi le
débloquer, ce qui transforme un garde-fou en **mur** — et pousse à insister
plutôt qu'à comprendre.

**Distinct de `usesOf`, et ce n'est pas un doublon** : compter s'applique à des
centaines d'URL à la fois (le ramassage balaie des pages), nommer s'applique à
UNE, celle qu'on regarde. Faire rendre des libellés au balayage lui ferait
charger des milliers de noms pour n'en lire aucun.

⚠️ **Les deux peuvent donc diverger.** La règle est côté écran : **un seul nombre
à la fois**, et celui de la liste fait foi quand elle est ouverte — c'est le seul
vérifiable à l'œil. Afficher « 3 » à côté d'une liste de 2 ferait conclure que le
compteur ment.

Un porteur qui donne **deux rôles** à la même image n'apparaît qu'une fois : la
clé primaire est `(porteur, url, rôle)`, et la question posée est « qui affiche
cette image », pas « à combien de places ».

---

## 3. Le fonds a son propre droit

`media_library`. `GET` demande `read`, tout le reste `write`.

🔴 **Ce détachement retire un accès, et c'est voulu.** La bibliothèque était murée
par `pim_catalog` : qui lisait le catalogue pouvait supprimer du fonds. Seuls
`admin` et `communication` l'obtiennent désormais ; `commercial`, `comptabilite`
et `dev` le perdent, **lecture comprise**. Sur une fiche produit, « Choisir dans
la médiathèque » leur rend 403.

Le rôle **`communication`** est ouvert pour un métier qu'aucun rôle ne portait :
« la personne qui va alimenter et tagger la médiathèque n'est pas forcément celle
qui va faire les fiches ». Il a `media_library:write` pour raison d'être, et
`pim_catalog:read` — pas une largesse : sans lui, le panneau des porteurs liste
des fiches dont les liens mènent à un 403. On saurait qu'une image sert sans
pouvoir aller voir.

⚠️ **Aucun backfill des dérogations individuelles**, et c'est délibéré. Le
précédent (2026-09-01) en posait un parce qu'il fallait RECONDUIRE des accès ;
ici c'est l'inverse.

⚠️ **Deux migrations qui ne se séparent pas** : Postgres refuse d'utiliser une
valeur d'enum dans la transaction qui l'ajoute.

---

## 4. Les dépôts refusés survivent au rechargement

`media.media_upload_failure` garde le **nom**, la **raison française**, le
**code**, ce qu'on a pu constater des octets, **qui** déposait et **quand**.
`GET /media/failures`.

🔴 Le dépôt en lot existait déjà — il enchaîne, ne s'arrête **jamais** sur un
refus, et sait rejouer les refusés. Ce qui manquait était le mot **historique** :
tout vivait dans un signal, et fermer l'onglet l'effaçait. Sur cinquante
fichiers, « lequel n'est pas passé hier » n'avait aucune réponse.

🔴 **Ce n'est pas le journal.** Le journal raconte la vie des images qui
EXISTENT ; ces lignes racontent des **tentatives**, dont le sujet n'existe pas.
Les y verser donnerait un `subjectId` qui ne désigne rien.

🔴 **Le refus s'inscrit dans sa propre unité de travail.** Il est levé avant que
la transaction du dépôt s'ouvre ; l'y ranger la ferait emporter par le rollback,
et l'historique serait vide précisément les jours où il sert.

⚠️ **On ne rejoue pas depuis l'historique, et l'écran le dit.** Un fichier refusé
n'a pas été stocké : il n'y a pas d'octets à renvoyer. Seule la file en mémoire,
qui détient les `File`, peut le faire. Un bouton « Réessayer » sur une ligne
d'historique promettrait l'impossible.

**Rétention : 90 jours**, ramassée par le même cron que les orphelines. Au-delà,
le fichier n'existe plus sur le disque de personne, et le nom gardé ne désigne
plus rien.

---

## Ce qui n'est PAS fait

### Le point focal n'a aucun lecteur

On l'écrit, on le stocke, **personne ne le lit**. Chaque recadrage de la boutique
est encore centré par défaut.

⚠️ **Et il attend une décision qui n'est pas la sienne.** Le faire voyager
demande de toucher `syncMediaSchema`, le contrat de fil **versionné** — donc un
bump en v10, une entrée de plus dans l'union du schéma stocké, et la redéfinition
de l'image côté stocké. Or ce tuyau est remis en cause : changer une image ne
devrait pas demander de republier le catalogue. Tant que ce point n'est pas
tranché, le bump serait payé pour rien.

🔴 **Un `focal` REQUIS sur le fil rendrait illisible toute livraison en attente
portant une image** — le schéma stocké réutilise celui du fil. Elle
disparaîtrait de l'écran de revue sans rien casser visiblement au déploiement.

### Remplacer une image

L'adressage par contenu le rend structurellement dur : retoucher une photo
produit d'autres octets, donc une autre URL, donc tous les porteurs restés sur
l'ancienne.

Ce qui est **acquis** pour le faire : l'atomicité traverse les deux blocs — un
seul client Prisma, fourni en `useExisting` des deux côtés, et `PrismaUnitOfWork`
route par AsyncLocalStorage. Une unité déjà ouverte est **rejointe**, pas
imbriquée.

Ce qu'il faudra tenir :

- le **dépôt des octets reste hors transaction** — une transaction ne tient pas
  un appel réseau, et derrière le pooler elle tient une des cinq connexions ;
- le repointage **fusionne** plutôt qu'il n'écrit : un porteur qui affiche déjà
  les deux images produirait deux lignes identiques ;
- **repointer le référentiel ne repointe pas la boutique**, qui garde sa copie de
  l'URL par snapshot ;
- un remplacement **se journalise**, et la porte ne le rattrapera pas : son audit
  ne se déclenche que sur un nom de dépendance parmi `*Repository |
MediaLibraryWriter | MediaLibrary`. Un port nommé `MediaCarriers` passe
  dessous.

### Deux emprunts au référentiel

`localized-text.ts` et `json-readers.ts` vivent encore sous `pim/`. Ils
n'appartiennent pas au référentiel, mais les monter en `platform/` lui ferait
importer `@lfd/pim-contracts` — et la plateforme n'importe **aucun contrat
métier**. Tant que ce point n'est pas tranché, la frontière `media→pim` reste
large, et elle dit pourquoi.

### Les ratios

Écrits dans `documentation/pim/images-du-catalogue.md`, vérifiés **nulle part**.
La décision est prise — « à l'affectation, pas au dépôt » — et les deux moitiés
du calcul existent : `describe(urls)` rend déjà les dimensions.

⚠️ Mais un ratio n'est **pas un invariant**, et le point focal en est la preuve :
s'il fallait refuser une image mal proportionnée, le focal n'aurait aucune raison
d'exister. Il existe précisément pour que **recadrer soit correct**. Le signaler
vaut mieux que le refuser tant que le fonds n'a pas été déposé sous discipline.
