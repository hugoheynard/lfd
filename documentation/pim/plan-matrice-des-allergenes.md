# Plan — la matrice des allergènes

> 📐 **Plan v2, rien n'est bâti** (2026-10-20) — contredit par `vitruve` le même
> jour : trois objections BLOQUANTES corrigées (§6). Suggestion reçue par Hugo, retenue
> le même jour : « une matrice allergène — chaque produit et les allergènes
> qu'il comporte — générée depuis les fiches, à réimprimer à chaque
> modification de la gamme ». Décisions de Hugo : un **export PDF de qualité,
> A4, logo, mise en page propre** ; la page vit dans **Catalogue**.
> Doc de référence du sujet :
> [`data-model/05-allergenes-gs1-inco.md`](data-model/05-allergenes-gs1-inco.md).

## 0. Ce qui existe (ouvert le 2026-10-20)

| Fait                                                                                                                                                                                                                                                                           | Où                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Référentiel ADMINISTRABLE en base : catégories (renommables, ordonnées par `position`, archivables) et entrées (codes GS1) ; libellés `fr` / `en` (l'italien arrive avec AM0). La table figée de 30 codes (`allergen-mapping.ts`) n'est que la graine                          | tables `pim.allergen_category` / `pim.allergen_entry`                                                                                                                                                     |
| **Le seul rangement en vigueur** « code déclaré → catégorie INCO » est `IncoProjector`, qui lit ce référentiel et signale `incomplete` quand un code ne se range pas (hors UE ou inconnu) ; c'est lui que lit le canal B2B, et le commerce relit ce que le PIM a projeté       | `apps/lfd-api/src/pim/allergens/domain/services/inco-projector.ts`, `apps/lfd-api/src/pim/channels/b2b-platform/products/projection.ts`, `apps/lfd-api/src/b2b/catalog/infrastructure/allergen-labels.ts` |
| Une déclinaison peut **suivre** les allergènes (et les traces) de la déclinaison par défaut : un drapeau d'alignement, PAS une ligne `variant_allergens`                                                                                                                       | `apps/lfd-api/prisma/schema/pim/product.prisma`, `apps/lfd-api/src/pim/catalogue/product/domain/entities/variant.ts`                                                                                      |
| L'annexe II impose de NOMMER la céréale et le fruit à coque ; c'est pourquoi le référentiel garde les codes précis                                                                                                                                                             | `apps/lfd-api/src/pim/allergens/allergen-mapping.ts` (commentaire)                                                                                                                                        |
| Statut `draft / published / archived` : sur le PRODUIT ; les canaux de vente : sur le conditionnement ; une déclinaison n'a ni l'un ni l'autre                                                                                                                                 | `apps/lfd-api/prisma/schema/pim/product.prisma`                                                                                                                                                           |
| Les allergènes se déclarent **par déclinaison**, en **trois états** : pas de ligne `variant_allergens` = **non renseigné** ; `allergens: []` = « **aucun** », affirmation positive ; une liste = la déclaration. Les **traces** (« peut contenir ») sont à part : `mayContain` | `apps/lfd-api/prisma/schema/pim/regulatory-sheet.prisma`, modèle `VariantAllergens`                                                                                                                       |
| Les ingrédients PROPOSENT des allergènes ; ils ne décident rien (D5, lecture seule)                                                                                                                                                                                            | `apps/lfd-api/src/pim/ingredients/application/read-product-ingredient-allergens.ts`                                                                                                                       |
| Aucune lecture « produits × allergènes » agrégée ; aucun rendu PDF dans le PIM                                                                                                                                                                                                 | —                                                                                                                                                                                                         |
| Trousse PDF commune (pdfkit, A4), polices standard Helvetica (WinAnsi : ni ● ni ◐) ; formes dessinées dans `paper-pdf-shapes.ts`                                                                                                                                               | `apps/lfd-api/src/platform/pdf/`                                                                                                                                                                          |
| Le seul lecteur de logo vit dans `b2b/orders` (interdit au PIM) ; piège connu : `assets/` n'est pas copié dans `dist/`                                                                                                                                                         | le lecteur de `b2b/orders` (passé au port de la marque en AM2 : `apps/lfd-api/src/platform/brand/disk-brand-logo.source.ts`), `apps/lfd-api/src/dev/seeding/brand-logo.ts`                                |
| Objections ouvertes sur le calcul des allergènes (un calcul ne doit pas se dupliquer)                                                                                                                                                                                          | [`../todos/todo-allergenes-objections-vitruve.md`](../todos/todo-allergenes-objections-vitruve.md)                                                                                                        |

## 1. Ce qu'on bâtit

Dans **Catalogue**, une page **« Matrice des allergènes »** : un tableau dont
chaque ligne est une **déclinaison vendue** (le produit et, s'il en a
plusieurs, la déclinaison), regroupées par famille, et chaque colonne une des
**14 catégories INCO**. Chaque case dit l'un de trois états, avec un signe ET
un mot dans la légende (jamais la couleur seule) :

| État                   | Signe  | Source                                               |
| ---------------------- | ------ | ---------------------------------------------------- |
| Contient               | ●      | catégorie présente dans `allergens`                  |
| Peut contenir (traces) | ◐      | catégorie présente dans `mayContain`                 |
| —                      | (vide) | ni l'un ni l'autre, **sur une déclinaison déclarée** |

L'**état de la ligne** est toujours écrit, en clair :

- « **Non renseigné** » — ni déclaration propre, ni alignement sur une
  déclinaison déclarée ; aucune case n'est dessinée ;
- « **Aucun allergène déclaré** » — affirmation `[]` (propre ou suivie) ;
- « **Déclaration à revoir** » — un code déclaré (allergène ou trace) n'est
  rangé **nulle part** par le référentiel : inconnu, ou dans une catégorie
  maison archivée. La ligne garde ses cases, mais n'est jamais lue « aucun » ;

> ⚠️ **Corrigé le 2026-10-20 (Hugo : Q3 l'emporte).** Ce point disait « à
> revoir dès que `IncoProjector` rend `incomplete` ». Or `incomplete` vaut
> aussi pour `non_eu` et les codes maison, que Q3 fait NOMMER dans la colonne
> « Autres » : un pain au sarrasin aurait été « à revoir » pour toujours. La
> distinction se lit dans `IncoProjector.outsideAnnex()` (même rangement,
> construit au même endroit que `project()`), qui trie ce que `project()`
> tait en « nommable » et « inconnu ».

- sinon, rien : les cases parlent.

Une case vide ne peut donc jamais être lue comme une absence qu'on n'a pas
vérifiée.

**Les précisions exigées par l'annexe II** : pour les céréales contenant du
gluten et les fruits à coque, la case porte le signe ET le nom précis (« ●
blé, seigle », « ◐ amandes ») ; pour les autres catégories, le signe suffit.

Deux sorties :

- **PDF A4** de qualité : logo, titre, **date et heure de génération**,
  périmètre retenu (filtres), légende, en-têtes de colonnes répétés à chaque
  page, numéro de page, phrase de pied « Établie à partir des fiches au
  [date] ; la déclaration en vigueur est celle de l'étiquette ». Paysage (14
  colonnes lisibles), sauf objection.
- **Tableur** (CSV, puis xlsx si utile) : les mêmes lignes, une colonne par
  catégorie, valeurs `contient` / `traces` / vide, et une colonne d'état.

Filtres : produits **publiés seulement** (défaut) ou tous ; famille ; inclure
ou non les non renseignés (défaut : inclus, pour qu'on les voie).

## 2. Les règles

- 🔴 **Un seul calcul : `IncoProjector`.** La matrice résout la déclaration
  de chaque déclinaison **comme le domaine** (propre, ou suivie de la
  déclinaison par défaut — `variant.ts`), puis la range par `IncoProjector`,
  sur le référentiel administrable. Jamais la table figée, jamais un second
  rangement (objection B1 du TODO, et la panne du 2026-09-03 racontée dans
  `allergen-labels.ts`). Elle ne dérive RIEN des ingrédients (D5).
- **Catégories archivées** : la matrice suit ce que rend `IncoProjector` ; une
  catégorie archivée n'a pas de colonne, et un code qui s'y rangeait rend la
  ligne « Déclaration à revoir ».
  Seules les catégories maison s'archivent (celles de l'annexe II sont
  verrouillées) : `outsideAnnex()` ne range plus le code d'une catégorie
  maison archivée, qui tombe donc en « inconnu ». C'est un écart assumé avec
  D2 bis (`project()` reconnaît toujours une entrée ou une catégorie archivée) :
  un imprimé ne nomme pas une catégorie retirée (2026-10-20).
- **Colonne « Autres »** (Q3, 2026-10-20) : chaque nom porte son libellé dans
  la langue, son code et `official`, de quoi tenir en AM2 la règle « code GS1
  affiché si `official && incoCategory === null` » (le tableur l'applique déjà).
- 🔴 **Trois états, jamais deux.** « Non renseigné » ≠ « aucun » ≠ « ne
  contient pas cette catégorie ».
- **Les mentions légales** sont les 14 catégories de l'annexe II, avec leur
  libellé de catégorie (pas le code granulaire : « Gluten », pas « Seigle ») ;
  `non_eu` et les catégories maison n'y figurent pas (une colonne « Autres »
  est une question, §5).
- **Datée.** La matrice est un instantané : la date de génération est sur
  chaque page.
- **Bloc** : tout vit dans `pim/` (lecture, query, contrôleur, rendu PDF). Le
  rendu réutilise la trousse `platform/pdf` (`pim → platform` est permis).
  **Le logo** passe par un port de `platform/` (« la marque ») dont
  l'adaptateur lit `assets/` en tenant le piège `dist/` ; le lecteur actuel de
  `b2b/orders` bascule sur ce port au lieu d'en avoir une seconde copie.
- **Les signes ● et ◐ sont DESSINÉS** (disque plein, demi-disque) avec les
  formes de la trousse : les polices standard ne les ont pas. Un test du texte
  du PDF ne le verrait pas ; le test vérifie la présence des formes.
- **Droit** : ~~`@AdminSurface("pim_catalog")`~~ — **corrigé le 2026-10-20
  (Hugo)** : la matrice a SON droit, la ressource staff `allergen_matrix`
  (lecture), sur les trois routes (JSON, tableur, PDF). `pim_catalog` seul
  n'y donne plus accès, et `allergen_matrix` seul n'ouvre pas les fiches.
  Migration `20261020160000_le_droit_de_la_matrice_des_allergenes` : ajoute
  la valeur d'enum, n'accorde rien ; l'admin l'accorde à l'écran
  (`/admin/staff-roles`), la graine `ROLE_GRANTS` la donne à l'administrateur
  (dev, e2e).
- **Une matrice imprimée vieillit**, et c'est assumé : la date de génération
  est sur chaque page, et la page Catalogue affiche « Dernière modification
  d'une fiche : [date] » au-dessus des boutons d'export, pour qu'on sache
  s'il faut réimprimer. Rien ne suit les impressions.

### 2.1 Ordre et pagination — décision de Hugo (2026-10-26)

- **Tout est rangé par ordre alphabétique**, dans le PDF, le tableur (et le
  JSON de l'écran, qui sort de la même construction) : les familles entre
  elles, puis les fiches dans chaque famille. Ordre français quelle que soit la
  langue du document — insensible à la casse et aux accents
  (`localeCompare(…, "fr", { sensitivity: "base" })`). Les familles se
  rangeaient jusque-là par leur rang de rayon (`position`) ; les déclinaisons
  d'une fiche gardent l'ordre de la fiche.
- **PDF** : chaque famille commence sur une page neuve, son nom EN GROS
  au-dessus de sa table ; quand elle déborde, son titre porte sa pagination
  — « Pains (1/2) », « Pains (2/2) » —, et rien quand elle tient sur une page,
  comme les papiers du fournil. Le bandeau gris « (suite) » est retiré.
  Implémenté le 2026-10-26 (`apps/lfd-api/src/pim/catalogue/allergen-matrix/domain/allergen-matrix-pdf-titles.ts`).

## 3. Les lots

| Lot                                 | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Agent     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **AM0** ✅ 2026-10-20               | Les libellés italiens du référentiel (catégories annexe II et précisions céréales / fruits à coque), tirés de la version italienne officielle de l'annexe II d'INCO 1169/2011, **validés par Hugo** avant écriture ; migration de données sur des lignes officielles verrouillées (relue par `lecteur-de-migrations`, et par `vitruve` : c'est une migration de données réglementaires)                                                                                                                                                                                                                                                                                                        | batisseur |
| **AM1**                             | Query `GetAllergenMatrix` (filtres) : lignes déclinaison × catégories en trois états, + état de déclaration ; route `GET /pim/allergen-matrix` (JSON) et `…/allergen-matrix.csv` ; tests (dont : non renseigné ≠ aucun ; une trace n'est pas une présence ; une catégorie archivée). **Précisé le 2026-10-20** : colonne « Autres » (Q3 l'emporte sur §1, « à revoir » = code rangé nulle part) ; filtre famille = la famille et ses sous-familles ; `lastModifiedAt` (max des `updated_at` fiche, déclinaisons, déclarations retenues) ; déclinaisons arrêtées exclues (Q5) ; mots fixes du tableur dans le dictionnaire `ALLERGEN_MATRIX_WORDING` de `@lfd/pim-contracts`, que AM2 réutilise | batisseur |
| **AM2** ✅ 2026-10-20 (`48ac8ba59`) | Rendu PDF A4 (paysage) : `renderAllergenMatrixPdf` pur, logo par port, pagination et en-têtes répétés ; route `…/allergen-matrix.pdf` ; test qui lit le texte du PDF                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | batisseur |
| **AM3** ✅ 2026-10-20               | Page « Matrice des allergènes » — **entrée de menu à part, juste sous Catalogue** (Hugo, 2026-10-20 : « pour le moment »), visible avec le seul droit `allergen_matrix` : filtres, tableau (fold-data-table), légende, boutons « PDF » et « Tableur » ; entrée de menu (rail ET tuiles)                                                                                                                                                                                                                                                                                                                                                                                                        | pablo     |

### 3.1 AM0 — les libellés italiens, validés par Hugo (2026-10-20)

**Source** : règlement (UE) n° 1169/2011, **allegato II**, version italienne
consolidée du 2018-01-01, téléchargée d'EUR-Lex le 2026-10-20
(`CELEX:02011R1169-20180101`). Chaque libellé ci-dessous est RECOPIÉ de ce
texte, avec la casse d'un libellé ; rien n'est traduit, sauf les trois lignes
marquées ✳.

**Décision de Hugo** : « je te fais confiance, dans le doute on précise le code
universel en plus ». Une ligne ✳ (absente de l'annexe, donc traduite) porte
son code GS1 à côté de son libellé dans la matrice italienne — `Mais (NM)`.
Les autres non.

| Catégorie   | Italien (annexe II, verbatim)                                        |
| ----------- | -------------------------------------------------------------------- |
| gluten      | Cereali contenenti glutine                                           |
| crustaceans | Crostacei                                                            |
| eggs        | Uova                                                                 |
| fish        | Pesce                                                                |
| peanuts     | Arachidi                                                             |
| soybeans    | Soia                                                                 |
| milk        | Latte                                                                |
| tree_nuts   | Frutta a guscio                                                      |
| celery      | Sedano                                                               |
| mustard     | Senape                                                               |
| sesame      | Semi di sesamo                                                       |
| sulphites   | Anidride solforosa e solfiti                                         |
| lupin       | Lupini                                                               |
| molluscs    | Molluschi                                                            |
| non_eu ✳    | Fuori obbligo UE (15ᵉ catégorie, officielle, hors annexe : traduite) |

| Code    | Italien                      | D'où                                     |
| ------- | ---------------------------- | ---------------------------------------- |
| UW      | Grano                        | annexe, pt 1                             |
| NR      | Segale                       | annexe, pt 1                             |
| GB      | Orzo                         | annexe, pt 1                             |
| GO      | Avena                        | annexe, pt 1                             |
| GS      | Farro                        | annexe, pt 1                             |
| GK      | Grano khorasan               | annexe, pt 1                             |
| AW      | Ceppi ibridati               | annexe, pt 1 (« i loro ceppi ibridati ») |
| SA      | Mandorle                     | annexe, pt 8                             |
| SH      | Nocciole                     | annexe, pt 8                             |
| SW      | Noci                         | annexe, pt 8                             |
| SC      | Noci di acagiù               | annexe, pt 8                             |
| SP      | Noci di pecan                | annexe, pt 8                             |
| SR      | Noci del Brasile             | annexe, pt 8                             |
| ST      | Pistacchi                    | annexe, pt 8                             |
| SM      | Noci macadamia               | annexe, pt 8                             |
| AC … UM | le libellé de leur catégorie | une entrée par catégorie                 |
| BWD ✳   | Grano saraceno               | hors annexe — code affiché               |
| NM ✳    | Mais                         | hors annexe — code affiché               |
| SO ✳    | Cocco                        | hors annexe — code affiché               |

**Ce que `vitruve` a changé (2026-10-20)** — trois bloquants, corrigés ici :

- **15 catégories, pas 14** : `alg_cat_non_eu` (« Hors obligation UE ») est
  officielle et verrouillée ; elle reçoit son italien dans la MÊME migration.
- **Le verrou se démonte** : les deux triggers refusent tout changement de
  `name` sur une ligne `official`. Une seule migration, sur les deux tables :
  `DROP TRIGGER` → `UPDATE` → `CREATE TRIGGER` à l'identique (geste du
  runbook). L'`UPDATE` **fusionne** — `name = name || jsonb_build_object('it', …)`,
  jamais une réécriture du jsonb, qui effacerait `fr` et `en` — et la
  migration vérifie ensuite (bloc `DO`, `RAISE EXCEPTION`) que les 45 lignes
  officielles ont `fr`, `en` et `it`, et que `fr`/`en` n'ont pas bougé.
- **L'oracle suit la base** : `Lang` (`allergen-mapping.ts`) devient
  `"fr" | "en" | "it"` ; `entry(...)`, `INCO_LABELS` (qui gagne `non_eu`) et
  leurs signatures portent l'italien ; `test/pim-allergens.e2e-spec.ts`
  (égalités exactes l.130, l.145, l.172, assistant `localizedText`) compare
  les trois langues. Le chemin de lecture (`Locale`, `LOCALES` de
  `@lfd/pim-contracts`) accepte déjà `it` : ni les fronts ni la boutique ne
  changent. (Le doublon `Lang`/`Locale` est une dette connue, pas celle d'AM0.)

Et trois choix assumés :

- **Pas de fait au journal** : l'italien est AJOUTÉ, pas renommé ; la
  migration le dit en tête. L'historique d'une catégorie ne le montrera pas.
- **Qui affiche le code** : une règle de RENDU, pas une donnée —
  `official && incoCategory === null`, c'est-à-dire les entrées de `non_eu`.
  Une entrée maison n'est jamais `official` : son code libre ne s'affiche pas.
- **Irréversible à bon marché** : après application, corriger un libellé
  italien redemande le démontage du verrou. La validation de Hugo
  (2026-10-20) est le dernier moment gratuit.

⚠️ `AW` : le libellé français dit « Triticale et autres souches hybridées » ;
l'annexe italienne ne nomme pas le triticale, elle dit « ceppi ibridati ». On
garde le mot de l'annexe, sans ✳ : il est réglementaire.

## 4. Hors périmètre

- Afficher les allergènes dans la boutique client (aucun affichage aujourd'hui).
- Calculer des allergènes à partir des ingrédients.

## 5. Décisions (Hugo, 2026-10-20)

- **Q0 — Périmètre** (Hugo, 2026-10-20 : « vendue non, mais active dans le
  PIM ») : les déclinaisons d'un produit **publié** dans le PIM, sans condition
  de canal de vente ; « tous les produits » (brouillons compris) en option. Les
  archivés jamais.
- **Q1 — Lignes : toujours une ligne par déclinaison**, même quand elles
  déclarent la même chose.
- **Q2 — PDF : A4 paysage, en français.**
- **Q3 — Une colonne « Autres »** après les 14 mentions légales : elle NOMME
  les allergènes déclarés hors annexe II (`non_eu`, catégories maison), avec
  les mêmes signes contient / traces. Un code qui ne se range nulle part
  (inconnu du référentiel) garde l'état « Déclaration à revoir ».
- **Q5 — Déclinaisons arrêtées** (Hugo, 2026-10-20) : une déclinaison
  `isDiscontinued` sort de la matrice, JSON comme tableur (et donc du PDF).
- **Q4 — Trois langues** (Hugo, 2026-10-20) : français, anglais, italien, au
  choix à l'export ; un PDF par langue, ENTIER dans sa langue (titre, légende,
  en-têtes, états, pied). Le référentiel n'a pas de libellés italiens : lot
  **AM0**, ci-dessous. Tant qu'une mention italienne manque, elle s'affiche en
  français et le PDF italien le dit en tête — jamais une case vide.

- **Q6 — Droit dédié** (Hugo, 2026-10-20) : `allergen_matrix`, en lecture,
  remplace `pim_catalog` sur les trois routes de la matrice (cf. §2 « Droit »).
- **Q7 — Les mots du PDF et du tableur** (Hugo, 2026-10-20), posés dans
  `ALLERGEN_MATRIX_WORDING` (`@lfd/pim-contracts`), source en JSDoc :
  - **réglementaires**, verbatim du règlement (UE) n° 1169/2011 consolidé au
    2018-01-01 (EUR-Lex, `CELEX:02011R1169-20180101`) : le **titre de la
    matrice** est le titre de l'annexe II — fr « Substances ou produits
    provoquant des allergies ou intolérances », en « Substances or products
    causing allergies or intolerances », it « Sostanze o prodotti che
    provocano allergie o intolleranze » ; la **présence** est le mot de
    l'art. 21 — « contient », « contains », « contiene » ;
  - **formule d'usage** validée par Hugo pour les **traces** (le règlement
    n'en fixe aucune, art. 36) : « Peut contenir des traces », « May contain
    traces », « Può contenere tracce » — le tableur l'écrit aussi ;
  - **tous les autres mots** (en-têtes, états, tête et pied du document) sont
    des traductions de libellés d'interface, rien de réglementaire.
- **Q8 — La liste des familles du filtre** (Hugo, 2026-10-20) : la réponse
  JSON de `GET /pim/allergen-matrix` porte `familyChoices: { id, label,
parentId, depth }[]`, parce que l'écran, ouvert au seul droit
  `allergen_matrix`, ne lit pas l'arbre du catalogue. Ce sont les familles
  NON archivées, avec leur libellé dans la `locale` demandée. Une famille
  mère sans fiche propre y figure. La liste ne dépend ni du filtre de
  famille ni du périmètre : c'est la liste du filtre, pas le contenu. Ordre
  en profondeur : chaque mère avant ses filles, frères par `position` puis
  `id`. Une fille dont la mère est archivée remonte à la racine
  (`depth` 0). Le nom `families` restait pris par les groupes de lignes
  (choix du coordinateur, même jour). Lue par `AllergenMatrixSource.families()`,
  sans seconde lecture.
- **Q9 — Les en-têtes de colonne prennent un nom courant** (Hugo,
  2026-10-20). Le référentiel ne change pas. Trois diffèrent : gluten →
  « Gluten » / « Gluten » / « Glutine » ; sesame → « Sésame » / « Sesame » /
  « Sesamo » ; sulphites → « Sulfites » / « Sulphites » / « Solfiti ». Les
  onze autres gardent le libellé du référentiel. La table est
  `ALLERGEN_MATRIX_WORDING[locale].columnShortNames`, partielle. Chaque
  colonne du JSON porte un `header` à côté du `label` réglementaire. Le
  tableur et le PDF prennent le `header`. Le pied du PDF gagne une ligne,
  dans sa langue, qui rend le nom réglementaire de chaque nom court, avec
  le seuil des sulfites (`columnNoteSuffixes`, verbatim de l'annexe II
  pt 12 en italien). L'en-tête du PDF passe de 84 à 58 pt : le plus long des
  trois langues, « Frutta a guscio », mesure 50,2 pt en Helvetica-Bold 7.

## 6. Ce que `vitruve` a changé (2026-10-20)

- **BLOQUANT** — les déclinaisons alignées sur la déclinaison par défaut
  seraient sorties « Non renseigné » : la déclaration se résout comme le
  domaine.
- **BLOQUANT** — la source du rangement était la table figée : c'est
  `IncoProjector` sur le référentiel administrable, le même que la boutique.
- **BLOQUANT** — le libellé de catégorie seul perdait la céréale et le fruit à
  coque que l'annexe II impose de nommer : ils sont dans la case.
- **SÉRIEUX** — `incomplete` devient l'état « Déclaration à revoir » ; « vendue »
  est défini (Q0) ; ● et ◐ sont dessinés ; le logo a un port de `platform/` ;
  la péremption de l'imprimé est assumée et signalée dans la page.
