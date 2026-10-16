# Plan — l'opération passe au commerce

> 📐 **Doc-first, rien n'est bâti** (rédigé le 2026-10-15). Porte une
> **migration de données** (les opérations quittent le schéma `pim`) et touche
> une **frontière** (la plateforme choisit une image de la médiathèque) :
> `vitruve` est obligatoire avant Hugo (CLAUDE.md §9 bis).
>
> Revient sur la décision D1 de
> [`architecture-operations-datees.md`](architecture-operations-datees.md)
> (2026-09-24). Ce plan dit pourquoi, et ce qui a changé depuis.

## 0. La demande (Hugo, 2026-10-15)

> « Tu penses que opérations doit rester domaine du référentiel ? » — puis,
> après la réponse : « écris le plan pour déplacer les opérations ».

## 1. Ce qui existe (ouvert le 2026-10-15)

| Pièce                    | Où                                                                                                                                                                                                                                                           | Ce qu'elle fait                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| L'opération, source      | `pim.operations`, `pim.operation_items` (`prisma/schema/pim/operations.prisma`) ; `src/pim/operations/` (préparer, éditer, replanifier, changer l'audience, choisir la sélection, archiver) ; `@AdminSurface("pim_catalog")`                                 | nom, chapeau, image (URL), fenêtres d'annonce / de commande / de retrait, audience, articles ordonnés                   |
| Le voyage                | `pim/channels/b2b-platform/products/operation-projection.ts` (dans le push) ; `operation-image-changed.fact.ts` (fait durable de l'image)                                                                                                                    | le commerce reçoit l'opération par l'instantané et son image par un fait                                                |
| Le miroir, au commerce   | `public.catalog_operations`, `catalog_operation_items` (`prisma/schema/public/catalog-operations.prisma`)                                                                                                                                                    | même clé (`key`) que le PIM, écrit à la réception                                                                       |
| La surcharge du commerce | `catalog_operation_overrides` ; `set-operation-override.handler.ts`, `effective-operation.ts` ; `@AdminSurface("b2b_catalog")`                                                                                                                               | masquer, fermer plus tôt, restreindre l'audience, retirer des articles — **une seconde décision** sur la même opération |
| Les lecteurs             | `b2b/catalog/*` (vitrine, rayons `op:<key>`, prix en boutique), `b2b/storefront/*` (annonce liée à une opération, `operation-link.ts`), `b2b/orders/*` (`order-operations.service.ts`, `order-operation-guard.ts` : fenêtre de commande et jours de retrait) | tous lisent **le miroir du commerce**, jamais le PIM                                                                    |
| L'exclusivité            | `operationOnly` sur la fiche (`pim.product`) et sur l'article (`catalog_items`)                                                                                                                                                                              | c'est une propriété de **l'article**, pas de l'opération : elle reste au référentiel                                    |
| La production            | `src/production/**`                                                                                                                                                                                                                                          | **ne lit aucune opération** (grep vide sur `operation`, 2026-10-15) : elle voit des commandes                           |
| L'image                  | le PIM porte l'URL et répond à la médiathèque comme porteur ; `b2b → media` est **interdit** par la matrice ; la vitrine, qui a le même besoin, est branchée par `appBootstrap/media-carriers.module.ts` (« faute de droit `b2b → media` »)                  | un précédent existe pour donner une image de la médiathèque au commerce sans ouvrir la matrice                          |

### Pourquoi D1 disait « au référentiel »

Le 2026-09-24 : l'opération « vit dans le catalogue, pour des raisons de
préparation » (choisir les articles, fixer les dates, préparer la
production). Trois choses ont changé :

- **la production ne la lit pas** — elle planifie sur les commandes, qui
  portent leurs articles et leurs dates ;
- **le commerce la décide déjà à moitié** : la surcharge masque, ferme plus
  tôt, restreint l'audience et retire des articles. Deux écrans décident de
  la même opération ;
- **le référentiel a été recentré** aujourd'hui sur ce qu'est un produit, à
  qui il est destiné et combien il coûte
  ([`plan-catalogue-synchronise-par-audience.md`](../pim/plan-catalogue-synchronise-par-audience.md)) ;
  le faire voyager demanderait un lot entier de faits (le lot 4), pour une
  donnée qui ne sert qu'à vendre.

## 2. Décisions proposées

### O1 — Une seule opération, au commerce

`public.catalog_operations` devient **la source**. La surcharge disparaît en
tant que seconde couche : ses champs deviennent les champs de l'opération
elle-même (une opération masquée est une opération archivée ou non
annoncée ; « fermer plus tôt » est sa fenêtre de commande ; « restreindre
l'audience » est son audience ; « retirer un article » est sa sélection).
L'agrégat vit dans `b2b/catalog/` (ou un contexte `b2b/operations/` si
`catalog-operation*` dépasse la taille d'un sous-dossier — à trancher en
bâtissant), avec ses invariants repris du PIM (`Operation` : fenêtres
ordonnées, audience, sélection non vide pour annoncer).

### O2 — La sélection se choisit dans le catalogue du commerce

Les articles se choisissent parmi les SKU que le commerce connaît
(`catalog_items` et `catalog_entries`). Un article retiré du référentiel reste
dans la sélection et n'est simplement plus vendu, comme aujourd'hui.
L'exclusivité (`operationOnly`) reste une propriété de l'article, réglée au
référentiel : l'opération ne la change pas.

### O3 — L'image, par le précédent de la vitrine

Le commerce ne lit pas la médiathèque (matrice inchangée). Comme la vitrine,
l'opération déclare un **port** « choisir une image et la décrire », relié dans
`appBootstrap/` à l'adaptateur de la médiathèque, et se déclare **porteur**
d'image (`media/channels/carriers/`) dans le même module, pour que la
médiathèque sache qui affiche quoi et refuse d'archiver une image utilisée.
Le fait `pim.operation_image_changed` et son abonné disparaissent.

### O4 — La migration

1. Les opérations du PIM sont **déjà** dans le miroir (même `key`). La
   migration applique la surcharge sur l'opération (valeur effective,
   `effective-operation.ts`) puis la vide — un SQL, dans une transaction,
   précédé d'un comptage rendu (opérations, articles, surcharges non nulles).
2. Une opération du PIM **absente** du miroir (jamais poussée) est copiée.
3. Les tables `pim.operations` / `pim.operation_items` restent en base, plus
   lues ni écrites (§0). `catalog_operation_overrides` aussi.
4. ⚠️ Ordre : le PIM cesse d'écrire **avant** la copie (déploiement qui
   ferme les routes PIM), la copie se fait, puis le commerce ouvre son
   écriture. Une opération éditée au PIM entre deux ne doit pas se perdre :
   le comptage avant/après le prouve.

### O5 — Le push ne porte plus les opérations

`operation-projection.ts` sort de la projection ; l'ingestion ne touche plus
aux opérations. C'était le dernier contenu du push après la bascule des
faits : **le lot 4 du plan de synchronisation disparaît**, et le lot 5 peut
retirer le push, l'aperçu et l'écran « Réception » dès la bascule faite.

### O6 — L'écran et le journal

« Opérations » (déjà en Gestion Boutique) écrit au commerce. Les faits de
journal `operation.*` du PIM restent lisibles (le passé ne se réécrit pas) ;
les nouveaux s'écrivent au journal du commerce, avec leurs phrases au
back-office. Le droit : `lfc_operations` (Q2, tranché).

### Corrections après `vitruve` (2026-10-15), qui priment sur O1–O6

**Une seule bascule, rien d'écrit au commerce avant** (BLOQUANT). Le push
réécrit chaque opération reçue et retire celles qui manquent
(`IngestCatalogService.applyOperations`, `ingest-catalog.service.ts:158-185`),
y compris faits ouverts. Ouvrir l'écriture au commerce avant de le couper
ferait effacer ou écraser les opérations créées au commerce. Donc :
le lot 1 bâtit l'agrégat et ses routes **fermées** ; la bascule est **un seul
déploiement** qui, dans l'ordre : sort les opérations de l'ingestion, ferme
les routes du PIM, migre, ouvre l'écriture au commerce.

**La migration repart du PIM** (BLOQUANT). Une opération éditée, replanifiée,
archivée ou dont la sélection a changé au PIM sans push a un miroir périmé.
La source de la migration est donc `pim.operations` / `operation_items`, pas
le miroir : chaque opération du PIM est écrite au commerce (valeurs du PIM),
puis restreinte par la surcharge existante (même calcul que
`effective-operation.ts` : `LEAST` des fenêtres, sélection moins
`hidden_skus`, intersection des audiences). Une clé présente au miroir et
absente du PIM est listée, pas inventée. **Un aperçu rendu avant d'écrire**
(route admin, comme le pré-remplissage du prix pro) compare champ par champ
PIM, miroir et résultat, opération par opération ; un écart inexpliqué
bloque. Le même relevé est rendu après, en production — un e2e ne prouve rien
d'une migration qui ne joue qu'une fois.

**L'image : partir de ce qui existe** (BLOQUANT). Le commerce est **déjà**
porteur d'images (`CatalogCopyMediaCarriers`, `appBootstrap/catalog-copy-media-carriers.ts`,
branché dans `CompositeMediaCarriers`, `media-carriers.module.ts:52-58`), et
son `repoint()` rend 0 parce que le PIM réannonce l'image par
`pim.operation_image_changed`. À la bascule : ce porteur devient celui de
l'opération du commerce, son `repoint()` **écrit l'agrégat** (charger, muter,
sauver — §3.1), son lien pointe l'écran du commerce ; `PrismaMediaCarriers`
cesse de compter et de repointer `pim.operation`
(`prisma-media-carriers.ts:54,100-124,161`) — sinon les images resteraient
« employées » par une table morte ; le suivi du point focal suit l'opération
comme `RefocusStorefrontOnMediaDescribed` suit la vitrine, si l'image d'une
opération porte un point focal (à vérifier au lot 2).

**Ce que devient chaque champ de la surcharge** (SÉRIEUX) :

| Surcharge                          | Devient                                                                                                                                                                                                | Réversible           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| `isHidden`                         | un champ `hidden` de l'opération (pas l'archivage, qui est un retrait daté)                                                                                                                            | oui                  |
| `orderUntil` (« fermer plus tôt ») | la fenêtre de commande elle-même ; l'invariant « le commerce ne peut que restreindre » disparaît — **voulu** : il n'y a plus qu'un décideur                                                            | —                    |
| `audience` (restreindre)           | l'audience ; une intersection **vide** (`none`, `operation-audience.ts:19,53`) donne une opération **masquée** (`hidden = true`), audience laissée à celle du PIM — rien n'est vendu, rien n'est perdu | oui                  |
| `hiddenSkus`                       | la sélection, sans ces articles                                                                                                                                                                        | oui (on les rajoute) |
| `decidedBy` / `decidedAt`          | un fait de journal par opération restreinte, écrit à la migration, qui dit qui avait restreint quoi                                                                                                    | —                    |

`received_at` garde son sens (dernière réception, puis date de la
migration) ; `withdrawn_at` devient l'archivage (même sens : retirée).
Aucune colonne n'est supprimée ni renommée.

**Le droit** : `lfc_operations` (Q2, tranché) — ressource ajoutée par la
migration, accordée à l'écran, jamais par migration.

**Ce qui sort du PIM au lot 4**, nommé : `src/pim/operations/**`,
`operation-projection.ts` et son appel dans `feed-projection.service.ts` et
`canonical-projection.ts`, `operation-image-changed.fact.ts` et son abonné,
`on-media-asset-described.ts` des opérations, la branche `pim.operation` de
`PrismaMediaCarriers`, les entrées `operation.*` de `pim-journal.ts` (les
faits passés restent lisibles), `b2b-platform.module.ts`. Tables gardées.

**Les dates** : l'agrégat du commerce reprend la saisie au fuseau de Paris
(`localToInstant`), `pickup_*` en jours, `order_until` en instant ;
`lint:business-day` couvre son dossier.

**Une opération sans article (Hugo, 2026-10-15)** : elle n'est **pas**
interdite — une opération est forcément vide pendant qu'on la prépare. Et
plutôt que de la cacher, son rayon **l'annonce** (Hugo : « une partie display
info dans le rayon de l'opération » ; le texte est le **chapeau**) :

- **le rayon d'une opération s'ouvre toujours sur son encart** : image, nom,
  chapeau, et ses dates dites en clair — « Commandes à partir du… »,
  « Commandez avant le… », « Retrait du … au … » ; les articles suivent ;
- **pendant la fenêtre d'annonce**, le rayon paraît même sans article :
  l'encart est l'annonce, voulue ;
- **commandes ouvertes et rayon toujours vide** : l'encart dit « Les produits
  arrivent bientôt », et l'écran du back-office avertit (probable oubli) ;
- **masquée ou archivée** : rien en boutique ;
- **au back-office**, l'avertissement dit ce que verra le client : « En
  boutique : l'annonce seule, sans produit ».

Bâti au **lot 3** (la bascule touche déjà la lecture de la vitrine,
`storefront-catalog-operations.ts`, `operationShelvesOf`) ; les textes de
l'encart vont au dictionnaire de la boutique (`pnpm copy:digest`).

**`received_at` d'une opération née au commerce (Hugo, 2026-10-15)** :
l'instant de sa préparation. La colonne reste `NOT NULL`.

**Après le lot 2 (Hugo, 2026-10-16)** — à bâtir avec le lot 3 :

- **Le texte alternatif de l'image vient de la médiathèque**, comme pour les
  produits (`set-product-media.ts:106` : ni étiquette ni texte alternatif sur
  la fiche depuis le 2026-09-23) : l'opération ne garde plus son propre `alt`
  — la vue le lit de la médiathèque par le port `OperationImageLibrary`, qui
  l'expose déjà.
- **L'image d'une opération archivée reste protégée**, comme au PIM : une
  opération archivée **compte** comme porteuse (la médiathèque refuse
  d'archiver son image), pour que l'historique ne pointe pas vers une image
  disparue. Le remplacement d'image dans la médiathèque la suit quand même :
  un geste de repointage permis sur une archivée, nommé pour ce qu'il est
  (ce n'est pas une édition de l'opération).

## 3. Lots

| Lot | Contenu                                                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Agrégat au commerce (O1, O2), routes et commandes, journal ; écran branché sur le commerce ; le PIM garde ses routes ouvertes             |
| 2   | L'image (O3) : port, porteur, choix depuis l'écran                                                                                        |
| 3   | La bascule (O4) : fermeture des routes PIM, migration de données avec comptage, ouverture de l'écriture au commerce ; fin du fait d'image |
| 4   | Le push sans opérations (O5) ; retrait du code des opérations au PIM (tables gardées)                                                     |

## 4. Risques

- **Une opération en cours** (fenêtre de commande ouverte) au moment de la
  bascule : la commande lit le miroir, qui ne change pas de forme ; la
  migration ne doit modifier aucune fenêtre effective. Prouvé par un e2e :
  la valeur effective avant = la valeur après, opération par opération.
- **Une surcharge qui retirait des articles** devient une sélection plus
  courte : c'est la valeur effective, donc ce qui était vendu.
- **Les annonces de vitrine liées** (`operation-link.ts`) pointent la clé, qui
  ne change pas.

## 5. Questions à Hugo

1. ~~**Q1**~~ — **Rien ne la retient au référentiel (Hugo, 2026-10-15)** :
   « la préparation ne lit pas les opérations, déplace-les ». D1 du
   2026-09-24 est levée.
2. ~~**Q2**~~ — **`lfc_operations` (Hugo, 2026-10-15)** : un droit à lui,
   lecture et écriture, sur le modèle de `lfc_legal` — la migration ajoute la
   ressource et ne l'accorde à aucun rôle ; Hugo l'accorde à l'écran, le
   superadmin l'a d'office. Il remplace `pim_catalog` (préparation) et
   `b2b_catalog` (surcharge) sur tout ce qui touche une opération.

## Contradiction de `vitruve`

_À venir._
