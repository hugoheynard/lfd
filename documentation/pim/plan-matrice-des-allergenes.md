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
| Le seul lecteur de logo vit dans `b2b/orders` (interdit au PIM) ; piège connu : `assets/` n'est pas copié dans `dist/`                                                                                                                                                         | `apps/lfd-api/src/b2b/orders/infrastructure/disk-order-sheet-logo.source.ts`, `apps/lfd-api/src/dev/seeding/brand-logo.ts`                                                                                |
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
- « **Déclaration à revoir** » — `IncoProjector` rend `incomplete` : un code
  déclaré ne se range dans aucune catégorie de l'annexe II. La ligne garde ses
  cases, mais n'est jamais lue « aucun » ;
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
- **Droit** : `@AdminSurface("pim_catalog")`, en lecture (confirmé sur
  `apps/lfd-api/src/pim/allergens/http/allergen.controller.ts`).
- **Une matrice imprimée vieillit**, et c'est assumé : la date de génération
  est sur chaque page, et la page Catalogue affiche « Dernière modification
  d'une fiche : [date] » au-dessus des boutons d'export, pour qu'on sache
  s'il faut réimprimer. Rien ne suit les impressions.

## 3. Les lots

| Lot                   | Contenu                                                                                                                                                                                                                                                                                                                                                                                 | Agent     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **AM0** ✅ 2026-10-20 | Les libellés italiens du référentiel (catégories annexe II et précisions céréales / fruits à coque), tirés de la version italienne officielle de l'annexe II d'INCO 1169/2011, **validés par Hugo** avant écriture ; migration de données sur des lignes officielles verrouillées (relue par `lecteur-de-migrations`, et par `vitruve` : c'est une migration de données réglementaires) | batisseur |
| **AM1**               | Query `GetAllergenMatrix` (filtres) : lignes déclinaison × catégories en trois états, + état de déclaration ; route `GET /pim/allergen-matrix` (JSON) et `…/allergen-matrix.csv` ; tests (dont : non renseigné ≠ aucun ; une trace n'est pas une présence ; une catégorie archivée)                                                                                                     | batisseur |
| **AM2**               | Rendu PDF A4 (paysage) : `renderAllergenMatrixPdf` pur, logo par port, pagination et en-têtes répétés ; route `…/allergen-matrix.pdf` ; test qui lit le texte du PDF                                                                                                                                                                                                                    | batisseur |
| **AM3**               | Page Catalogue « Matrice des allergènes » : filtres, tableau (fold-data-table), légende, boutons « PDF » et « Tableur » ; entrée de menu (rail ET tuiles)                                                                                                                                                                                                                               | pablo     |

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
- **Q4 — Trois langues** (Hugo, 2026-10-20) : français, anglais, italien, au
  choix à l'export ; un PDF par langue, ENTIER dans sa langue (titre, légende,
  en-têtes, états, pied). Le référentiel n'a pas de libellés italiens : lot
  **AM0**, ci-dessous. Tant qu'une mention italienne manque, elle s'affiche en
  français et le PDF italien le dit en tête — jamais une case vide.

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
