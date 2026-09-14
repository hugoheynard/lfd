# Les mentions légales — cinq documents, trois surfaces

> État : **les CGV implémentées le 2026-09-13**, les quatre autres mentions
> généralisées depuis le même code le même jour. Ce document a d'abord décrit
> les seules CGV ; il a été élargi quand il est apparu que les cinq mentions
> ont exactement la même forme, et que les écrire cinq fois aurait été la faute.

Le bandeau légal du pied de page porte **cinq mentions**, et ce ne sont pas des
textes qu'on ajoute : ce sont des **prérequis**, affichables ou non, comme le
bandeau cookies. Le vocabulaire est fermé ; ce qui se décide, c'est lesquelles
paraissent — et ce que chacune dit.

| Mention                       | Clé de stockage |
| ----------------------------- | --------------- |
| Mentions légales              | `legal-notice`  |
| Conditions générales de vente | `sales-terms`   |
| Confidentialité               | `privacy`       |
| Cookies                       | `cookies`       |
| Accessibilité                 | `accessibility` |

Chacune est un **document** de même forme : un titre, puis des articles titrés,
dans les trois langues. Un seul agrégat, un seul jeu de handlers, un seul écran
d'édition, un seul dialogue — paramétrés par la mention. Cinq copies auraient
divergé au premier correctif.

Trois surfaces :

| Surface                                      | Qui                   | Quoi                                           |
| -------------------------------------------- | --------------------- | ---------------------------------------------- |
| Back-office `/b2b/contenu/mentions/:mention` | staff, `b2b_settings` | écrire : le titre, et un CRUD sur les articles |
| Back-office `/b2b/contenu/app-footer`        | staff, `b2b_settings` | cocher celles qui s'affichent                  |
| Boutique, dialogue                           | tout le monde         | lire : un dialogue centré, étroit, qui défile  |
| API publique `GET /content/legal/:mention`   | anonyme               | servir un document                             |

## 1. Le stockage — aucune migration

`PlatformContent` porte déjà une ligne par bloc, sous une **clé naturelle**.
Chaque mention en prend une — la clé est la mention — dont la colonne `content`
est un JSON de la forme `{ title, paragraphs[] }`.

🔴 **Aucune migration, pour les cinq.** Ce sont des clés neuves dans une table à
clé naturelle ; `sales-terms` existait déjà et ne bouge pas.

Le schéma Prisma dit pourquoi le JSON est un choix et non un raccourci : « sans
une migration par paragraphe ajouté ». Un paragraphe n'a pas de vie propre — il
n'est ni interrogeable, ni partageable, ni référencé ailleurs. Lui donner une
table lui donnerait une existence que le métier ne lui reconnaît pas, et
obligerait à tenir son ordre avec une colonne de rang.

**Ce que ça coûte, et qu'il faut savoir :** deux rédacteurs qui écrivent en même
temps s'écrasent, le dernier gagne. La `revision` permet de le _dire_ après
coup ; elle ne l'empêche pas. C'est déjà le cas du pied de page, et le back-office
n'a qu'un petit nombre de mains — le jour où ça coince, la sortie est un
`expectedRevision` sur les commandes d'écriture, pas une table.

## 2. Le domaine — un agrégat, parce qu'il y a des refus

La question de tri du `CLAUDE.md` est « existe-t-il une règle qui peut refuser
cette écriture ? ». Ici, oui, quatre fois :

- un identifiant de paragraphe inconnu → **404** ;
- un rang hors du document → **400** ;
- un document plein (120 articles) → **409** ;
- deux identifiants égaux → refusé à la relecture comme à l'écriture.

Le pied de page, lui, n'a aucun refus : c'est un `read`/`save` de forme, et son
absence d'agrégat est juste. Un document de mention en mérite un.

`LegalDocument` (`src/b2b/content/domain/entities/`), **un par mention**, chargé
et enregistré sous la clé de sa mention :

```
reconstitute(content)   → rehydrate l'agrégat
retitle(heading)
addParagraph(id, prose) → refuse si plein
editParagraph(id, prose)→ refuse si inconnu
removeParagraph(id)     → refuse si inconnu
moveParagraph(id, rang) → refuse si inconnu ou hors bornes
snapshot(): LegalDocument
```

La revalidation par le schéma est faite par l'**adaptateur**, avant
`reconstitute` : zod n'entre pas dans `domain/`, qui ne dépend de rien.

L'identifiant vient du port **`IdGenerator`** (ULID), jamais de `Math.random()`
ni d'un dérivé du titre : un article renommé garderait une clé qui ment, et les
routes de modification désignent cette clé.

### Le repli, et pourquoi il est le même des deux côtés

Un document jamais enregistré se lit ET se charge de la même façon : le titre de
départ, **aucun article**.

⚠️ Les deux ont divergé le temps d'une écriture — affichage sur la
démonstration, écriture sur le vide. Ça donnait un écran d'édition dont chaque
ligne répondait 404 : des articles qu'on voyait, qu'on ne pouvait ni corriger ni
supprimer, parce qu'ils n'avaient jamais existé. Les articles de démonstration
n'entrent en base que par le **semis** (§7), jamais par un repli.

Cycle de vie **`load → méthode métier → save`**, sans exception — le port ne
gagne aucune méthode qui écrirait un champ à partir de primitives.

## 3. Les routes

Toutes sous `AdminPlatformContentController` (`@AdminSurface("b2b_settings")`),
sauf la dernière.

| Verbe    | Chemin                                                           | Rend                |
| -------- | ---------------------------------------------------------------- | ------------------- |
| `GET`    | `/admin/content/legal/:mention`                                  | `LegalDocumentView` |
| `PUT`    | `/admin/content/legal/:mention/title`                            | `204`               |
| `POST`   | `/admin/content/legal/:mention/paragraphs`                       | `201` + `{ id }`    |
| `PUT`    | `/admin/content/legal/:mention/paragraphs/:paragraphId`          | `204`               |
| `DELETE` | `/admin/content/legal/:mention/paragraphs/:paragraphId`          | `204`               |
| `PUT`    | `/admin/content/legal/:mention/paragraphs/:paragraphId/position` | `204`               |
| `GET`    | `/content/legal/:mention` (public, throttlé)                     | `LegalDocumentView` |

🔴 **`:mention` est le vocabulaire fermé, validé AU BORD** (`LegalMentionParam`),
et une mention inconnue rend **404** — pas 400 : le segment désigne une
ressource. Sans cette garde, une clé libre ouvrirait un bloc de contenu que le
pied de page ne peut pas cocher et que personne ne saurait retrouver. Les
mentions s'écrivent comme le contrat les nomme (`salesTerms`), pas comme la
table les stocke (`sales-terms`) : la correspondance est une table explicite de
l'adaptateur (généralisé le 2026-09-13).

🔴 **Les commandes ne rendent pas de modèle de lecture**, conformément au §4 :
`void`, ou l'identifiant du paragraphe créé — que le §4 autorise explicitement
et dont l'écran a besoin pour sélectionner ce qu'il vient d'ajouter. Le front
relit ensuite.

> ⚠️ Le voisin immédiat, `SaveFooterContentCommand`, **rend une vue** — il
> enfreint le §4. Ce n'est pas corrigé ici : ce serait un changement de contrat
> servi, hors du sujet de ce lot. C'est signalé pour que la divergence entre les
> deux moitiés du même contexte se lise comme une dette, pas comme un choix
> (constaté le 2026-09-13).

## 4. Les trois langues

La règle du contenu de plateforme s'applique telle quelle : **un paragraphe
porte `fr`, `en` et `it` ou n'existe pas**, et c'est la forme de l'objet qui le
garantit.

Le prix est réel et assumé : on ne peut pas poser un article en français et le
traduire demain. L'alternative — des langues optionnelles avec repli — rendait
indistinguables « pas encore traduit » et « volontairement identique », et c'est
cette indistinction qui fait vieillir une traduction sans que personne le voie.

## 5. L'écran du back-office

**Un seul composant**, routé `/b2b/contenu/mentions/:mention`, et **cinq
entrées** de menu sous la section **Contenu**, à côté d'`App footer`. Cinq
entrées et non une liste : on vient corriger une mention précise, et une page
d'index n'aurait ajouté qu'un clic entre le menu et le texte.

Le titre de l'écran est celui de la mention ; le reste est identique d'une
mention à l'autre, parce que le document l'est.

- un `fold-view-toggle` FR/EN/IT en tête, comme l'écran du pied de page ;
- le titre du document, puis la liste des paragraphes dans l'ordre de lecture ;
- par paragraphe : monter, descendre, modifier, supprimer ;
- la suppression est **gardée** (`fold-inline-confirm`), pas par un dialogue ;
- tous les états passent par fold — `fold-loading`, `fold-empty-state`,
  `fold-callout`. Aucun état inventé.

⚠️ L'entrée de menu s'ajoute **deux fois** : au rail `fold-menu-item` _et_ aux
tuiles `fold-nav-launcher`. C'est la dette connue du back-office ; une entrée
posée d'un seul côté est invisible sur l'autre.

## 6. Le dialogue de la boutique

Un `fold-panel` en `side: 'center'` — le seul qui interrompe la page, la couvre
et la voile. `surface: 'solid'`, largeur `md`. **Un seul composant pour les cinq
mentions**, ouvert avec la mention à lire.

Le registre est **administratif** et il est voulu : un document qu'on lit pour
s'engager n'est pas de la copie de vitrine. Corps **justifié**, interlignage
large, articles numérotés, titre d'article en petites capitales, corps qui
défile dans son propre conteneur — jamais la page derrière.

**Chaque mention cochée est un lien vivant** (`fold-link`, ton discret) dans la
barre légale, dans l'ordre du vocabulaire. Plus aucun libellé inerte : une
mention qu'on affiche est une mention qu'on peut lire.

Le libellé vient du **contrat pour les cinq** (`legalMentionLabels`). Il a été
le titre du document pour les CGV, du temps où elles étaient la seule mention
vivante ; à cinq documents, ça obligeait à les charger tous les cinq pour nommer
une barre que personne n'a encore ouverte — c'est-à-dire à ruiner le chargement
paresseux — et c'était faux sur le fond : **la barre nomme l'obligation, le
document se nomme lui-même** dans son dialogue (tranché le 2026-09-13). C'est la
CLÉ qui relie le lien à son document, jamais son texte : reconnaître un mot dans
un libellé serait un couplage qu'une faute de frappe corrigée casserait.

⚠️ **Il a d'abord été un bouton bordé en capitales, et c'était le mauvais
registre** : dans une rangée de mentions en texte plat, la seule mention VIVANTE
était la plus bruyante. Il porte donc la taille, la couleur et la casse de ses
voisines — la seule différence est qu'on peut cliquer dessus (2026-09-13, vu à
l'écran).

⚠️ **Le contenu de départ du pied de page ne porte plus de libellé « CGV »**
(ni `Terms`, ni `Condizioni`) : le mot y figurait en texte inerte, à côté du
lien vivant, et c'est le mort qui ressemblait le plus à un lien. Les lignes
**déjà enregistrées en base le portent encore** — un contenu éditorial ne se
réécrit pas dans le dos de celui qui l'a saisi. Il se retire depuis l'écran
**App footer**.

### 🔴 L'hôte des panneaux manquait dans la boutique

`app.html` ne rendait `<fold-panel-host />` que dans la branche du chrome pro
authentifié. Les routes de la boutique passent par un `router-outlet` qui n'en
voyait aucun : `FoldPanelHostService.open()` y était un appel **sans effet** —
rien ne s'ouvrait, et rien ne le disait.

Ni le typecheck, ni le build AOT, ni un spec ne pouvaient le voir : un spec de
panneau monte le composant directement, au lieu de le demander à l'hôte. C'est
la même classe de panne que les attributs fold inconnus — **seul l'écran pouvait
le dire**. `client-shell.html` porte désormais le sien (2026-09-13).

Chargement **paresseux, à la première ouverture**, puis gardé. Le document ne
part pas dans le rendu de chaque page pour un contenu que la plupart des
visiteurs n'ouvriront jamais. Tant qu'il n'est pas là, le libellé du bouton vient
de `DEFAULT_LEGAL_DOCUMENT(mention)`.

🔴 **Le repli porte le titre, jamais les articles**, et c'est là que les CGV se
séparent du pied de page. La doctrine de la vitrine est qu'aucune surface n'est
jamais vide ; elle ne se transpose pas à un document qu'on lit pour s'engager.
Servir des articles de démonstration sous le titre « Conditions générales de
vente » serait un faux, et le fait qu'ils avouent en être ne répare rien — ce
qu'un client lit d'abord, c'est le titre. Un document non publié se dit donc
**non publié**, et une lecture en échec se dit **en échec** : deux états
distincts, deux messages distincts.

## 7. Le semis

`apps/lfd-api/src/dev/seeding/legal-documents.seed.ts`, qui sème **les cinq**,
appelé par `dev-seed.service.ts` **et** par `prisma/seed.ts` — les deux corpus exécutent les mêmes fonctions, sans quoi
le bouton de rechargement pose un jeu de données que la ligne de commande ne pose
pas.

🔴 **Par les commandes, jamais par Prisma.** Un semis qui contourne les handlers
ne prépare pas le produit, il prépare une base qui lui ressemble.

Le contenu est **de démonstration et le dit lui-même** : les titres sont ceux
d'une vente entre professionnels, les corps annoncent qu'ils sont des corps de
démonstration. Des CGV plausibles servies par défaut sur une boutique en service
seraient lues comme opposables, et rien à l'écran ne les distinguerait d'un
document validé. Le risque n'est pas qu'on oublie de les remplacer : c'est que
personne ne voie qu'il fallait le faire.

Idempotent, mention par mention : il ne repose rien sur une clé déjà présente.

## 8. Les tests

- **Domaine** — `LegalDocument` : chaque refus, et le déplacement aux deux
  bouts (rang 0, dernier rang). Aucun Nest, aucun mock.
- **Application** — un handler par cas, port doublé, `FixedIdGenerator`.
- **E2E** — `apps/lfd-api/test/b2b-legal-documents.e2e-spec.ts` : le cycle complet contre le vrai
  Postgres — créer, relire, modifier, déplacer, supprimer, 404 sur un
  identifiant inconnu, 400 sur un rang hors bornes, et la lecture publique sans
  jeton.
- **Front** — un spec par écran : le back-office (ajout, ordre, suppression
  gardée) et le dialogue (titre, ordre des articles, défilement).
