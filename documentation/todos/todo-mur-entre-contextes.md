# TODO — le mur entre contextes

**Ouvert le 2026-08-31**, en écrivant le référentiel d'allergènes.

> 🟢 **Les deux portes sont posées le 2026-09-03.** Ce document n'est plus un
> plan : il ne reste que l'**arbitrage allergènes** (§ « Ce qui reste »), tenu
> entre-temps par deux exceptions nommées dans `context-boundaries`.

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

**L'ordre annoncé n'a pas été suivi, et c'est assumé.** Il fallait retirer les
deux imports concrets AVANT de resserrer, sinon la porte casse. Mais leur
retrait est un arbitrage réglementaire (ci-dessous), pas un remplacement — et
faire attendre le cliquet derrière un arbitrage, c'est laisser la porte ouverte
au **septième** import pendant ce temps. Les deux imports sont donc inscrits en
**exceptions nommées et datées**, avec leur raison entière. Le mécanisme est
prévu pour ça : « une entrée sans raison n'est pas une exception, c'est un
oubli — et la liste ne grandit pas : elle se vide. »

## Ce que ça ne remet pas en cause

Le snapshot reste la bonne façon de croiser les contextes, et pour une raison
qui n'a rien à voir avec la topologie des bases : une `OrderLine` doit porter le
prix **au moment de la commande**, pas le prix d'aujourd'hui. Une jointure, même
possible, serait fausse.
