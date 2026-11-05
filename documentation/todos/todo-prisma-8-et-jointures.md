# TODO — Prisma 8, et le chargement des relations par jointure

> 📋 **Noté le 2026-11-05** (Hugo : « il faudra bien regarder ça et les
> risques quand on va passer à Prisma 8 »). Rien n'est décidé ni bâti. Nous
> sommes sur **Prisma 7.8.0** (`@prisma/client`, générateur `prisma-client`,
> `apps/lfd-api/prisma/schema/datasource.prisma`).

# Partie 1 — L'explication simple

## Ce qui a déclenché la question

`/me` fait 5 à 6 lectures en base **l'une après l'autre** (la personne, ses
préférences, ses rattachements, leurs sociétés, puis les sites atteints par
héritage). La base est loin : chaque aller-retour coûte ~15–20 ms. Une partie
de ces lectures existe seulement parce que Prisma, par défaut, charge chaque
relation imbriquée par **une requête SQL séparée**.

Prisma sait faire autrement — tout joindre en **une seule requête** — mais :

- dans **Prisma 7**, c'est une fonctionnalité **en préversion**
  (`relationJoins`) ;
- et l'activer change le comportement de **toutes** les requêtes du dépôt, pas
  seulement celle de `/me`.

Décidé le 2026-11-05 : **ne pas l'activer**. `/me` est accéléré autrement, en
lançant ses lectures indépendantes en parallèle.

## Ce qu'est Prisma 8 — pas une montée de version, une réécriture

Relu dans la doc officielle le 2026-11-05 :

- **Statut** : « release candidate ». La sortie stable était annoncée pour
  octobre 2026 ; « some details of the API may still change ».
- **Il ne lit plus le fichier de schéma Prisma** et n'a ni `generate`, ni `migrate dev`,
  ni `db push`. Notre schéma (un dossier rangé par schéma Postgres, tenu par
  `lint:prisma-schema-layout`) et nos migrations reposent sur ces outils.
- **D'autres paquets** : un par base (`@prisma/orm-postgres`) au lieu de
  `@prisma/client`, qui reste à la ligne 7.
- **Des fonctions pas encore disponibles**, dont des usages réels chez nous :
  - la plupart des **écritures imbriquées** ;
  - les **niveaux d'isolation** des transactions ;
  - les **codes d'erreur à la `P2002`** (doublon) — c'est ainsi qu'une
    contrainte d'unicité devient un refus métier nommé ;
  - `$extends`, l'**incrément atomique**, le filtre dans les colonnes JSON.
- **La migration** se fait en faisant tourner les deux versions côte à côte,
  une partie de l'app à la fois.
- **Prisma 7** reçoit des correctifs **18 mois** après la sortie stable de
  Prisma 8.

## Ce qu'on y gagnerait

- Les relations chargées **par jointure** sur PostgreSQL, par défaut (la doc
  de Prisma 8 le décrit ainsi) : moins d'allers-retours vers une base lointaine,
  sur toutes les lectures à relations — `/me`, les commandes, la fiche client.
- La suite du produit : Prisma 7 finira par ne plus être maintenu.

## Ce qu'on risquerait

| Risque                                   | Pourquoi ça compte ici                                                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Réécrire la couche d'accès à la base     | tout le backend lit par Prisma ; les ports `infrastructure/` le contiennent, mais il y en a des centaines                                                     |
| Les transactions sans niveau d'isolation | la passation, le prélèvement, le retrait au comptoir s'appuient sur des transactions dont certaines règlent une course                                        |
| Plus de `P2002`                          | les refus « déjà existant » (SKU, société, rattachement) seraient à réécrire, ou deviendraient des 500                                                        |
| Les migrations                           | nos `migration.sql` sont appliqués par `prisma migrate` ; un `migration.sql` ne se modifie jamais (checksum)                                                  |
| Les jointures par agrégation JSON        | changent la forme du SQL de toutes les lectures à relations ; la doc prévient de « cas limites » où l'ancien mode est plus rapide — à mesurer, pas à supposer |
| Le budget de la boutique                 | sans objet : Prisma ne vit que dans l'API                                                                                                                     |

## Quand le regarder

Quand **les trois** sont vrais :

1. Prisma 8 est **stable** (sortie générale, plus « release candidate ») ;
2. il propose **ce qui nous manque** : isolation des transactions, codes
   d'erreur d'unicité, écritures imbriquées ;
3. on a une raison mesurée — une lecture lente qu'une jointure réglerait, ou
   la fin annoncée de la maintenance de Prisma 7.

D'ici là, on reste sur Prisma 7.

# Partie 2 — La partie technique

## Le drapeau `relationJoins` dans Prisma 7

- Il s'active par `previewFeatures = ["relationJoins"]` dans le bloc
  `generator client`, puis `prisma generate`.
- Une fois actif, **la stratégie par défaut devient `join`** pour toute
  requête à relations : `LATERAL JOIN` et agrégation JSON sur PostgreSQL. La
  stratégie `query` (une requête par table, jointure côté application) reste
  choisissable par requête (`relationLoadStrategy: "query"`).
- L'option `relationLoadStrategy` n'existe pas dans le client généré tant que
  le drapeau n'est pas posé (vérifié dans
  `apps/lfd-api/src/platform/database/client/` le 2026-11-05).
- Si on l'essaie un jour **avant** Prisma 8 : l'activer sur une branche,
  faire tourner **toutes** les e2e (elles traversent le vrai SQL), et mesurer
  les lectures lourdes (rayon, devis, dossier de facturation) avant/après sur
  l'environnement de charge — jamais en local, où la base est à côté.

## Ce qu'il faudra inventorier avant Prisma 8

- Les usages de `P2002` et des autres codes d'erreur Prisma : `grep -rn "P20"`
  dans `apps/lfd-api/src`.
- Les transactions qui fixent un niveau d'isolation (`isolationLevel`).
- Les écritures imbriquées (`create: { … }` / `connect` dans un `create`).
- Les `$queryRaw` / `$executeRaw` : ils survivent peut-être tels quels, à
  vérifier.
- Le chemin des migrations : comment Prisma 8 applique un historique existant
  de `migration.sql`.
- Les portes qui lisent le schéma : `lint:prisma-schema-layout`,
  `lint:prisma-model-ownership`, `lint:cross-schema-join`.

## Sources

- [Prisma ORM v7 — Relation queries](https://www.prisma.io/docs/orm/v7/prisma-client/queries/relation-queries)
- [Prisma ORM — Release status](https://www.prisma.io/docs/orm/release-status)
- [Prisma 8 — Relations and joins](https://www.prisma.io/docs/orm/v8/fundamentals/relations-and-joins)
