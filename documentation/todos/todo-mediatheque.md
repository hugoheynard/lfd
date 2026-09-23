# TODO — la médiathèque

> Ce qui reste après le chantier du **2026-09-23**, qui a sorti le fonds
> d'images du référentiel et lui a donné son bloc, son schéma et ses deux
> canaux. L'état du système est décrit dans
> [`../mediatheque/la-mediatheque.md`](../mediatheque/la-mediatheque.md).
>
> Rangé par ce que ça coûte de ne PAS le faire, pas par difficulté.

---

## 🔴 Ce qui mordra

### Le journal doit monter en `platform/`

`CLAUDE.md` le dit déjà, et nomme son propre déclencheur :

> « **Quand promouvoir le journal en `platform/`** : au troisième bloc
> émetteur. À deux, un port et un binding de racine coûtent moins qu'un
> déménagement de 43 fichiers ; à trois, la fiction "la croissance possède le
> journal" ne tient plus. »

**Nous y sommes.** `media/` émet trois faits (`media_asset.deposited`,
`.described`, `.discarded`) en important `PimJournal` — le port du
RÉFÉRENTIEL. C'est aujourd'hui la plus grosse entorse à l'indépendance du
bloc : la bibliothèque dépend du catalogue pour une brique qui n'a rien de
métier.

⚠️ Tant que ce n'est pas fait, la matrice de `CLAUDE.md` §3 autorise
`media → pim` plus largement qu'elle ne le devrait — la surface déclarée est
`pim/` entier, là où elle devrait être le seul canal.

### Le texte localisé et les lecteurs de colonnes JSON aussi

Même nature, même remède : `localized-text.ts` et `json-readers.ts` sont des
utilitaires **transverses** (i18n, lecture de `jsonb`), pas du vocabulaire de
catalogue. Le `CLAUDE.md` §1 admet explicitement un type partagé « s'il est
vraiment transverse (stockage, utilitaires) ».

La médiathèque les emprunte à `pim/catalogue/shared/`. Deux blocs les
emploieront, puis trois.

### Le générateur d'identifiants est dupliqué

`MediaIdGenerator` est le jumeau exact de `PimIdGenerator` — vingt lignes,
deux fois. La duplication est **assumée et datée** (emprunter celui du PIM
aurait été pire : une dépendance de bloc pour un service technique), mais sa
place est dans `platform/`, avec les deux autres.

### `lint:journal-tracked` reconnaît les dépôts par leur NOM

La porte cherche `*Repository` dans les paramètres d'un handler. Elle ne voyait
donc pas `MediaLibraryWriter`, qui EST un dépôt : c'est Hugo qui a réclamé le
journal de la médiathèque, pas elle. On lui a ajouté deux noms en dur
(`MediaLibraryWriter`, `MediaLibrary`).

➡️ Une liste de noms en dur est ce que cette porte reproche aux autres. Le
critère juste serait « ce paramètre est-il un port d'ÉCRITURE » — reste à
savoir le dire sans lire tout le graphe de types.

---

## ⚠️ Ce qui se verra

### La médiathèque n'a pas de ressource de permission à elle

L'écran et les routes sont gardés par `pim_catalog:read` / `:write` — le droit
du **référentiel**. C'était juste tant que la bibliothèque y vivait ; ça
deviendra faux le jour où un communicant devra gérer le fonds sans toucher au
catalogue, et **franchement** faux quand les visuels de la vitrine y entreront.

### La recherche ne cherche que ce qui est chargé

La bande de tags et le sélecteur de la fiche filtrent **en mémoire**, sur la
page déjà reçue (60 images, ou 100 dans le sélecteur). Au-delà, une image
existe mais reste introuvable — et rien à l'écran ne le dit.

Il faut une recherche **serveur** : `GET /media?q=…&tags=…`, l'index GIN sur
`tags` est déjà posé pour ça.

### `countUrls()` compte en ramenant tout

Un `groupBy` sans plafond, qui rend une ligne par URL pour n'en compter que le
nombre. Tenable en milliers, pas au-delà. Le jour venu : compte approximatif,
ou pagination sans total.

### Le module d'activité range les faits d'image sous « PIM »

`activity-module.ts` déclare le préfixe `media_asset.` dans la liste du PIM.
C'était vrai le matin du 2026-09-23 ; ça ne l'est plus. Un module `media`
demanderait de le porter aussi côté écran (`MODULE_LABELS`).

### `catalog_item.image_alt` côté B2B

La colonne existe et est alimentée par la projection. Elle vient désormais de
l'image — une seule par image — et plus de la ligne d'actif propre à chaque
fiche. Les trois comptages du 2026-09-23 disaient que rien ne changeait
**alors** ; ça mérite d'être revérifié avant la première publication qui suit
le chantier.

---

## 🔵 Ce qui attend une décision

### Les ratios ne sont vérifiés nulle part

Les cinq rôles ont un ratio écrit
([`../pim/images-du-catalogue.md`](../pim/images-du-catalogue.md) §2), et rien
ne les fait respecter. La vérification doit se faire **à l'affectation**, pas
au dépôt : un même fichier peut servir de `hero` ici et de `lifestyle`
ailleurs.

### Le point focal n'est lu par aucun canal

Il se saisit (clic sur l'aperçu, en fractions) et se range. Personne ne
l'utilise encore : la fiche boutique applique `aspect-ratio: 3 / 2` en CSS et
recadre au centre. Le brancher, c'est un `object-position` calculé — et c'est
là que les deux cartes de l'accueil (« Je passe la prendre », l'opération
datée) trouveront enfin leur réponse, elles qui n'ont pas de forme fixe.

### Les visuels de maison et d'opération

Ils vivent aujourd'hui hors de la bibliothèque : une variable CSS dans
`accueil-public.scss` pour les portes, une URL Unsplash en dur dans
`mock-event.ts` pour l'opération. Les y faire entrer est un **troisième
porteur**, à côté du produit et de la famille — décision non prise.

### Le déploiement de ce chantier

`POST /pim/catalogue/media` a disparu **sans alias** : il n'était pas
transposable hors du préfixe du référentiel. Le back-office et l'API doivent
donc se déployer ensemble ; le dépôt d'image est le seul geste concerné, et la
fenêtre est celle d'un déploiement.

---

## Ce que le chantier du 2026-09-23 laisse ouvert

### 🔴 « Le défaut du défaut » — le rôle `gallery` ne voyage nulle part

Une image affectée à une fiche **sans qu'on choisisse son rôle** prend
`gallery`. Or seuls `hero` et `thumbnail` traversent le canal vers le
commerce : une photo posée sans décision n'apparaît donc **jamais** en
boutique, et rien à l'écran ne le dit. C'est exactement ce qui a fait croire à
une panne le jour de la livraison (le croissant était en `gallery`).

Les trois sorties sont écrites, avec leur coût, dans
[`../pim/images-du-catalogue.md`](../pim/images-du-catalogue.md) §« Le rôle PAR
DÉFAUT ne voyage nulle part » :

- **A** — le premier visuel d'une fiche devient `hero` d'office ;
- **B** — l'écran dit qu'un `gallery` n'est pas publié (recommandé) ;
- **C** — `gallery` voyage en repli.

C'est un **choix de produit**, pas une correction : il appartient à Hugo. B,
éventuellement doublé de A, est ce que je recommande — A seul déciderait à la
place de la personne qui photographie.

### Un push écrase une projection, et c'est voulu

Deux écrivains sur `catalog_items.image_*` / `thumbnail_*` : l'ingestion d'un
instantané (le push) et la projection vive (l'abonné
`on-product-media-changed`). Les deux lisent la **même** source — le
référentiel — donc un push ne peut que réécrire la même valeur, ou réparer une
projection perdue.

C'est la sémantique voulue (**la projection fait la fraîcheur, le push fait la
réparation**), elle est figée par un e2e — et elle **se lira comme un défaut**
le jour où quelqu'un verra une image « revenir » après une publication. La
noter ici, c'est éviter qu'on la corrige en croyant bien faire.

### Remplacer une image sur place (lot 4)

Toujours au plan
[`../mediatheque/plan-les-six-de-la-mediatheque.md`](../mediatheque/plan-les-six-de-la-mediatheque.md),
avec le lecteur de point focal. L'identité étant l'empreinte du contenu,
« remplacer » est en vérité **déposer, puis réaffecter tous les porteurs** —
c'est ce que le lot doit rendre atomique et visible.
