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
