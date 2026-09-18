# Plan — la clientèle, figée sur la commande

> **État au 2026-09-15** : décidé par Hugo, **bâti** le même jour (lots A et B,
> commit `ffb4ec01`), migration relue par `lecteur-de-migrations`, batterie
> complète verte. **Contredit par `vitruve` avant construction** : un BLOQUANT
> (le rattrapage de l'existant) a renversé une décision, et le sort de chaque
> objection est au §5.
>
> Il bâtit un morceau de ce que
> [`../b2b/analyse-boutique-publique.md`](../b2b/analyse-boutique-publique.md)
> (§4.2, point 3) avait déjà décidé : une colonne de clientèle figée à la
> passation, `Order.clientele`, nullable, **sans rattrapage**. La première
> version de ce plan l'ignorait, et proposait l'inverse.

> 🟠 **Un second lecteur depuis le 2026-09-17**, que ce plan ne prévoyait pas :
> la **règle de production**. Un règlement en vol (`pending`) n'est plus fabriqué
> pour une commande `public` ; il l'est pour `pro` et pour `NULL`. C'est D1 qui
> le permet — la colonne dit QUI commande — et D4 qui l'oblige à traiter `NULL`
> comme « pas public ». Cf.
> [`architecture-reglement-et-compte-de-production.md`](architecture-reglement-et-compte-de-production.md), §6.
> Le §3 (« afficher ailleurs que dans la file ») reste vrai : ce second lecteur
> filtre, il n'affiche rien.

## 0. La demande

Au comptoir (« Retrait boutique »), chaque ligne de la file doit dire si le
client est **pro** ou **public**, à côté de son nom. Hugo : l'information doit
être **inscrite à la commande**, pour en faire partie sans aller la chercher.

## 1. L'existant (ouvert et vérifié le 2026-09-15)

- `Order.companyId` est **optionnel** (`prisma/schema/public/orders.prisma`), et
  sa clé étrangère est en `ON DELETE SET NULL`
  (`migrations/20260807082859_activity_events_growth_schema/migration.sql`).
- 🔴 **Une commande sans société n'est PAS une commande publique** — pas pour
  l'existant. C'est aussi celle d'une personne rattachée à plusieurs sociétés
  (`resolve-company.ts` rend `null` faute d'en-tête, et aucun front n'envoyait
  `x-lfc-company` avant le 2026-09-15), celle d'un pro qui a commandé avant de
  déclarer sa société, et désormais celle d'un rattaché en espace perso. Toutes
  les commandes passées ont été payées au prix pro (analyse, §4.1).
- **Une seule fabrique** : `Order.draft()` (`src/b2b/orders/domain/entities/order.ts`),
  appelée par `OrderDrafting` — lui-même appelé par `place-order.handler`,
  `place-order-for-customer.handler` et le semis `src/dev/seeding/orders.seed.ts`.
  Aucun code de `src/` ne crée de commande de panier récurrent aujourd'hui.
- **Une seule création dans `src/`** : `PrismaOrderRepository.place()`. Hors
  `src/`, cinq écritures directes : trois e2e (`accounting-legal-entity`,
  `customer-sheet`, `growth-stats`), `prisma/seed-fiche.ts`,
  `prisma/clone-dev.ts` et `prisma/seed-growth/phase-revenue.ts`.
- **Aucun code ne rattache une société à une commande existante** ; le
  rapatriement est annoncé par trois documents, pas bâti.
- La file du comptoir lit la commande par `HANDOVER_QUEUE_SELECT`
  (`handover-order.query.ts`) et la sert par `HandoverQueueEntry` →
  `HandoverQueueEntryView`.

## 2. Décisions

**D1 — Ce qu'on fige : QUI commande, pas le tarif.** `pro` quand la commande est
passée pour une société, `public` sinon — quel que soit le statut de la
société. Hugo : le tarif d'une société en attente « risque d'évoluer », le badge
ne doit pas en dépendre.

**D2 — Le nom : `clientele`, valeurs `pro | public`** (Hugo), enum Prisma
`OrderClientele`, rangé sous `prisma/schema/public/`.

⚠️ **Ce que ce mot ne veut pas dire**, et il faut le lire à chaque usage : ce
n'est PAS la clientèle **tarifée** B2B/B2C du réglage de livraison et de la
remise (`CustomerAudiences`, B2B = société **active**). Les deux divergent sur
une société en attente (pro ici, B2C au tarif) et sur un rattaché en espace
perso (public ici, prix du catalogue selon son espace).

**D3 — Déduite par l'agrégat.** `Order.toPersistence()` rend `pro` si
`companyId` est posé, `public` sinon ; aucun appelant ne la passe.
C'est une règle **appliquée par l'agrégat**, pas une impossibilité : la base ne
la contraint pas (aucun `CHECK`), et une société supprimée remet `company_id` à
nul sous une commande `pro`.

**D4 — Colonne `orders.clientele`, NULLABLE, et nullable pour toujours.**
`NULL` = « commande d'avant la distinction », comme `catalogVersionId` ou
`vatShares` : une réponse honnête, pas un défaut à combler.
**Aucun rattrapage** (Hugo, après `vitruve`) : « sans société » ne voulait pas
dire « public », et un `public` déduit ne se distinguerait plus d'un vrai.

Il n'y a donc **pas de troisième déploiement** qui resserre en `NOT NULL` : les
commandes antérieures et celles écrites par l'ancienne image pendant le
déploiement resteront nulles, et c'est leur valeur vraie.

**D5 — La file lit la colonne, sans la redéduire.** `clientele` traverse le port
et le contrat en `"pro" | "public" | null`. Sur `null`, l'écran n'affiche
**aucun badge** plutôt qu'un badge deviné.

**D6 — L'écran.** Un `fold-badge` « Pro » ou « Public » dans la cellule client
de la table de la file.

**D7 — Le rapatriement, quand il sera bâti, ne réécrit pas `clientele`.** Une
commande rattachée après coup à une société garde la valeur de sa passation :
c'est un fait de la passation. S'il faut un jour la corriger, ce sera un geste
humain journalisé, pas un effet de bord du rattachement.

## 3. Ce que ce plan ne fait pas

- Figer la clientèle tarifée B2B/B2C.
- Afficher la clientèle ailleurs que dans la file (détail de retrait, fiche
  client, liste des commandes).
- Contraindre la base (`CHECK`) : la suppression d'une société la violerait.

## 4. Les lots

**A — serveur** :

- migration : enum `OrderClientele`, colonne nullable, **aucun `UPDATE`** ;
- `OrderToPlace.clientele`, `Order.toPersistence()` la déduit,
  `PrismaOrderRepository.place()` l'écrit ;
- `HANDOVER_QUEUE_SELECT` la lit, `toQueueEntry` la porte, port
  `HandoverQueueEntry`, handler, contrat `HandoverQueueEntryView`.
- Tests :
  - domaine : `toPersistence` avec et sans société ;
  - handler : la valeur traverse, `null` compris ;
  - e2e de la file : une commande de chaque clientèle passée par l'API, et une
    commande antérieure (colonne nulle) posée par écriture directe — le seul
    moyen d'obtenir une ligne que la fabrique ne produit plus.

Les cinq écritures directes hors `src/` n'ont rien à faire : la colonne est
nullable et n'a pas vocation à se resserrer.

**B — back-office** : badge dans `queue-table` ; les fixtures des cinq specs qui
construisent une `HandoverQueueEntryView` (`handover-shop-page`,
`handover-queue`, `handover-detail`, `queue-table`,
`commercial/cockpit/__tests__/today-handovers`).

`packages/contracts` change : `pnpm test` à la RACINE avant de conclure.

## 5. La contradiction de `vitruve` (2026-09-15) et son sort

| Objection                                                                                                      | Sort                                                                  |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **B1** le rattrapage écrit `public` sur des commandes de pros (multi-sociétés, pro sans société, espace perso) | corrigée — aucun rattrapage (Hugo), D4 ; §1 complété                  |
| **S1** une valeur figée contredira le rapatriement                                                             | tranchée — D7                                                         |
| **S2** « structurelle » faux : ni `CHECK`, et `ON DELETE SET NULL`                                             | corrigée — D3 dit « appliquée par l'agrégat », §3                     |
| **S3** `clone-dev.ts` et `phase-revenue.ts` oubliés                                                            | corrigée — §1 ; sans effet puisque la colonne reste nullable (§4)     |
| **S4** le troisième déploiement n'a pas de mécanisme                                                           | corrigée — il n'y en a pas : nullable pour toujours, D4               |
| **S5** collision pro/public ↔ B2B/B2C, nom `clientele` déjà proposé                                            | corrigée — `clientele` retenu (Hugo), ce qu'il ne veut pas dire en D2 |
| **S6** le badge peut mentir sur le tarif                                                                       | assumée — c'est QUI commande (D1), écrit en D2                        |
| **Mineurs** récurrents non établis, lot B sous-compté, ligne nulle en e2e, rangement de l'enum                 | corrigées — §1, §4, D2                                                |
