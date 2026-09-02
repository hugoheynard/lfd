# TODO — le mur entre contextes ne tient plus que par la revue

**Ouvert le 2026-08-31**, en écrivant le référentiel d'allergènes.

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

| Porte                     | État                                                                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lint:context-boundaries` | ⚠️ autorise `b2b → pim` **sans réserve** — `pim` figure dans les cibles permises de `b2b`, là où la matrice de `CLAUDE.md` §3 dit « port uniquement » |
| `lint:cross-schema-join`  | ⚠️ surveille `["public","growth","staff","pim","b2b"]` — `ops` manque alors qu'il existe, `staff` et `b2b` n'existent pas comme schémas Postgres      |

La seconde est la plus gênante : la porte censée voir un franchissement **en
SQL** surveille deux schémas fantômes et en ignore un réel.

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

🔴 **Et les deux derniers ne sont pas qu'une entorse de forme : ils contredisent
une doctrine écrite.** `catalog-item.ts:57-60` affirme que les mentions
d'étiquette sont « subies comme le reste : la plateforme **ne les recalcule
pas**, elle n'a plus le référentiel réglementaire (D6) » — et le champ
`catalog_items.allergen_labels` existe précisément pour porter ce que le PIM a
projeté à l'émission.

`prisma-catalog-admin.reader.ts` les **recalcule** pourtant, en appelant `toInco`
sur les codes stockés (`allergensOf`, `:110-130`). Il y a donc **deux sources de
libellés** dans le B2B — celle qu'on subit et celle qu'on refabrique — et
l'écran d'administration lit la seconde. La violation de frontière est le
symptôme ; la duplication de vérité est la maladie.

⚠️ Il y a une explication, et elle n'excuse pas : `allergen_labels` est arrivé
**après** ce lecteur (« vaut aussi pour un article reçu avant la v5 du fil »,
`catalog-item.ts:59-60`). Le reader recalculait faute de mieux. Le mieux existe.

**Ce que ça change au geste ci-dessous** : retirer ces deux imports, c'est faire
lire `allergen_labels` à l'écran d'administration — et accepter que les articles
reçus avant la v5 du fil n'aient pas de libellés tant qu'un push complet n'a pas
eu lieu. C'est un arbitrage, pas un remplacement mécanique.

## Le geste, quand on le fera

1. Aligner la liste de `cross-schema-join` sur le `datasource` réel
   (`public`, `growth`, `ops`, `pim`) — correction pure, sans débat.
2. Resserrer `context-boundaries` : `b2b → pim` **par port uniquement**, comme
   la matrice le dit déjà en prose. Ça demande d'abord que D6 ait retiré le
   dernier import direct, sinon la porte casse au premier passage.

L'ordre compte : resserrer avant D6 ferait rougir la CI sur du code qu'on est en
train de corriger.

## Ce que ça ne remet pas en cause

Le snapshot reste la bonne façon de croiser les contextes, et pour une raison
qui n'a rien à voir avec la topologie des bases : une `OrderLine` doit porter le
prix **au moment de la commande**, pas le prix d'aujourd'hui. Une jointure, même
possible, serait fausse.
