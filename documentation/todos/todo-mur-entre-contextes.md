# TODO — le mur entre contextes

**Ouvert le 2026-08-31**, en écrivant le référentiel d'allergènes.

> ✅ **Clos le 2026-09-03.** Les deux portes sont posées, l'arbitrage allergènes
> est tranché, et `context-boundaries` ne porte **aucune exception**. Ce qui
> reste est un point d'exploitation, pas de code : le temps 3 du runbook ne doit
> pas atteindre `main` avant que le push complet ait été vérifié en production.

## Le fait

Le PIM a eu sa propre base ; il ne l'a plus. Depuis B4, c'est le **schéma
Postgres `pim`** de la base de commerce — un seul `schema.prisma`, un seul
`datasource`, une seule URL (`DATABASE_LFD_URL`).

`CLAUDE.md` §1 affirmait encore des « bases physiquement séparées » et deux
variables d'environnement. La phrase a été redressée le même jour ; ce document
porte ce que la correction laisse ouvert.

## Pourquoi c'est un sujet

Tant que les bases étaient séparées, une jointure `b2b` → `pim` était
**impossible**. Elle est aujourd'hui simplement **interdite**. La règle n'a pas
changé, sa force si : une impossibilité tient toute seule, une discipline se
perd.

Et ce n'est pas théorique — un import direct existe déjà :
`src/b2b/catalog/infrastructure/prisma-catalog-admin.reader.ts` importe
`pim/allergens/`. Il est traité par la décision D6 de
[`pim/data-model/05-allergenes-gs1-inco.md`](../pim/data-model/05-allergenes-gs1-inco.md),
mais **sans cliquet** : rien n'empêchera le suivant.

## Ce que les portes tiennent — et ce qu'elles ne tiennent pas

| Porte                     | État au 2026-09-03                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `lint:context-boundaries` | ✅ `b2b → pim` par `pim/channels/b2b-platform/` uniquement, + 2 exceptions nommées |
| `lint:cross-schema-join`  | ✅ lit les schémas dans le `datasource` — plus de liste à tenir à jour             |

⚠️ **Ce qu'aucune des deux ne tient** : une classe de `platform/` qui interroge
les tables d'un domaine en Prisma direct. Le graphe d'imports ne la voit pas
(elle n'importe rien du domaine) et la porte SQL ne lit que le SQL écrit à la
main. C'est arrivé deux fois, et ça reste la brèche ouverte.

## L'inventaire — ce qui reste avant de pouvoir resserrer

_(Relevé le 2026-09-02. Cinq imports `b2b → pim` en tout, hors tests ; **deux**
seulement sont à corriger.)_

| Import                                                                            | Verdict                                                                                                                   |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `catalog/infrastructure/in-process-catalog.driver.ts:4` → `B2bCatalogDriver`      | ✅ **port** — classe abstraite publiée par `pim`, le motif de référence                                                   |
| `catalog/application/check-catalog-parity.service.ts:3` → `B2bCatalogFeedPreview` | ✅ **port** — classe abstraite elle aussi, et son JSDoc le dit : « `b2b` lit un port publié par `pim`, jamais une table » |
| `catalog/catalog.module.ts:3` → `B2bPlatformModule`                               | ✅ câblage Nest — le module n'exporte que les deux ports ci-dessus (`b2b-platform.module.ts:46`)                          |
| `catalog/infrastructure/prisma-catalog-admin.reader.ts:4` → `findMapping`         | 🔴 **fonction concrète**                                                                                                  |
| `catalog/infrastructure/prisma-catalog-admin.reader.ts:5` → `toInco`              | 🔴 **fonction concrète**                                                                                                  |

✅ **Les deux derniers sont partis le 2026-09-03**, et ce n'était pas une
entorse de forme. `catalog-item.ts` affirmait que les mentions d'étiquette sont
« subies comme le reste : la plateforme **ne les recalcule pas**, elle n'a plus
le référentiel réglementaire (D6) » — à trois lignes de la colonne
`allergen_labels` créée pour ça. `prisma-catalog-admin.reader.ts` les
recalculait pourtant, en appelant `toInco` sur les codes stockés.

**La violation de frontière était le symptôme ; la maladie était deux sources de
vérité pour une même affirmation réglementaire :**

|                | ce qu'il lit                                                  |
| -------------- | ------------------------------------------------------------- |
| La boutique    | le référentiel **administrable** en base, via `IncoProjector` |
| Le back-office | `allergen-mapping.ts`, **30 codes figés** dans le TypeScript  |

Le référentiel est administrable — le runbook recommande explicitement de créer
des **entrées maison** (`official = false`) que la table figée ne connaîtra
jamais. Un article en déclarant une s'affichait correctement en boutique et
**« fiche incomplète »** en rouge au back-office : l'écran accusait d'un oubli
causé par une table que le staff n'a pas le droit de modifier. Le libellé
divergeait de même — nom de la catégorie en base d'un côté, `INCO_LABELS` gelé
de l'autre.

**Ce que l'arbitrage a tranché.** Les articles reçus avant la v5 du fil portent
des codes sans mentions. L'écran leur affiche `[]` **plus** le drapeau
d'amputation — « une fiche existe, et je ne sais pas la rendre ». Jamais « sans
allergène » : le gabarit garde cette branche derrière `!allergensIncomplete`.
C'est la sémantique que le lecteur produisait déjà quand tous les codes
tombaient, pas une invention. Le remède est un push complet, et l'ordre est le
temps 2 → temps 3 du runbook.

⚠️ **Ce que ça laisse à faire, et ce n'est pas du code** : la requête du temps 2
n'a jamais tourné en production. Sur dev elle rend `0` trivialement — aucun des
92 articles ne déclare d'allergène.

## Le geste — fait le 2026-09-03

1. ✅ **`cross-schema-join` lit le `datasource`** au lieu de recopier sa liste.
   La correction n'est pas d'avoir écrit la bonne liste, c'est d'avoir supprimé
   la recopie : un commentaire affirmait déjà que les deux étaient identiques,
   et il a couvert l'écart tout du long.

   Falsifié, et c'est ce qui prouve que la couverture est réelle : la **même**
   requête `public.orders JOIN ops.traffic_samples` passe sous l'ancienne liste
   et échoue sous la nouvelle (`public × ops`).

2. ✅ **`context-boundaries` tient « port uniquement »** par un préfixe de
   chemin : `b2b → pim` n'est permis que sous `pim/channels/b2b-platform/`. Le
   choix du chemin plutôt qu'une convention de nommage est délibéré — un dossier
   se voit en ouvrant `src/`, un suffixe `.port.ts` se discute.

   Falsifié : un septième import vers `pim/allergens/` fait échouer la porte, en
   nommant le fichier fautif et la surface légitime.

3. ✅ **Les deux imports concrets sont partis**, le lecteur d'administration lit
   `allergen_labels`. `KNOWN` est vide.

**L'ordre annoncé a été inversé, puis rattrapé dans la journée.** Il fallait
retirer les imports AVANT de resserrer, sinon la porte casse. Mais leur retrait
demandait un arbitrage réglementaire, et faire attendre le cliquet derrière un
arbitrage, c'est laisser la porte ouverte au **septième** import pendant ce
temps. Les deux ont donc été inscrits en **exceptions nommées et datées** — puis
retirés quelques heures plus tard, l'arbitrage tranché.

C'est la durée de vie qu'une entrée de `KNOWN` doit avoir. Le mécanisme est
prévu pour ça : « une entrée sans raison n'est pas une exception, c'est un
oubli — et la liste ne grandit pas : elle se vide. »

## Ce que ça ne remet pas en cause

Le snapshot reste la bonne façon de croiser les contextes, et pour une raison
qui n'a rien à voir avec la topologie des bases : une `OrderLine` doit porter le
prix **au moment de la commande**, pas le prix d'aujourd'hui. Une jointure, même
possible, serait fausse.
