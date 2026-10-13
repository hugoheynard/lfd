# Plan — trier les commandes par heure de départ, et les colorer

> **État : 📐 doc-first, 2026-10-13.** Rien n'est bâti de ce plan ; les
> couleurs qu'il lira existent déjà sur les sites
> ([`../sites/sites.md`](../sites/sites.md), ✅). Écrit d'abord ici comme
> « écart logistique », fusionné le même jour dans un plan commun avec les
> sites et le transfert interne, puis redécoupé le 2026-10-13 (Hugo) : le
> site a sa doc d'état, le transfert son plan
> ([`../livraisons/transferts/plan-transfert-interne.md`](../livraisons/transferts/plan-transfert-interne.md)),
> et ce document garde la demande de la logistique.
>
> **Pourquoi dans `commandes/`** : l'écran visé est une liste de commandes,
> et la demande y était née. Il **dépend** du transfert (le village se range
> avec les tournées) mais ne le bâtit pas.
>
> Chaque affirmation sur l'existant a été vérifiée le 2026-10-13 ; ce qui ne
> l'a pas été est marqué « non vérifié ».

**Décisions de Hugo du 2026-10-13 qui le concernent :**

- Val Village est servi par un **transfert interne** : c'est ce départ qui
  range ses commandes avec les tournées B2B dans le tri par heure de départ ;
- les couleurs de la demande deviennent des **données de site**, et la
  livraison a sa couleur propre (§4) ; puis : couleurs **libres**, aucune
  teinte refusée, **facultatives** ;
- « Écrire » (Q1) est **mis de côté** ; « Adroit » est le nom d'un site (Q3).

## 1. La demande

Une responsable logistique, après une visite du back-office, mot pour mot :

> « Ecrire » : prévoir un formulaire pour obtenir les coordonnées du client et infos nécessaires
>
> - Trier les commandes par heures de départ (attention au traitement du click & Collect val village qui doit être traité comme une livraison B to B)
> - Identification visuelle des commandes avec un code couleur (pas de vert et rose/rouge, gardés pour les surligneurs OK/KO), préconise : bleu, jaune, orange, gris, modifiable.
>   - Livraison B to B : Bleu
>   - Click & Collect B to B : Jaune
>   - Click & Collect B to C Adroit : orange
>   - Click & Collect B to C Val Village : Gris

## 2. Ce qui existe (vérifié le 2026-10-13)

### 2.1 « Écrire » — mis de côté (Q1)

Deux candidats, aucun ne colle tel quel :

1. **Le bouton « Écrire » de la carte de contact de la boutique** — le seul
   libellé « Écrire » du back-office (aperçu,
   `apps/lfd-backoffice-frontend/src/app/b2b/contact/shop-contact-fallback.ts`) ;
   côté boutique il ouvre « Nous écrire »
   (`apps/lfc-ecommerce-frontend/src/app/legacy/contact/contact-panel/contact-panel.html`),
   qui recueille déjà nom, e-mail, téléphone, motif et texte
   (`CustomerRequest`, doc
   [`../contenu-ecommerce/demandes-clients.md`](../contenu-ecommerce/demandes-clients.md)).
2. **La saisie d'une commande par l'équipe** : `/comptoir/nouvelle-commande`
   ne saisit rien, elle cherche un compte pro actif puis passe la main à
   `commandes/nouvelle-commande/`
   ([`architecture-commande-saisie-par-l-equipe.md`](architecture-commande-saisie-par-l-equipe.md)).
   **Aucun formulaire** pour un client sans compte.

Lecture la plus probable : le second. Hugo a mis la question de côté le
2026-10-13 ; le lot L4 est hors du chantier.

### 2.2 Les écrans où la logistique voit « les commandes »

| Écran                                                     | Fichier                                                  | Ce qu'il trie aujourd'hui                                                                                                   |
| --------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `/commandes` (liste)                                      | `commandes/orders-list-page/`, `commandes/orders-table/` | plus récente d'abord ; `AdminOrderRow` porte `fulfillmentMethod`, `clientele`, `fulfillmentDay`, **pas** le site ni d'heure |
| `/comptoir/retrait`                                       | `handover-shop/handover-queue.ts` (`sortedQueue`)        | par **créneau** (`window.start ?? window.end`), puis heure de commande ; onglets par point de retrait (`pickupTabs`)        |
| `/supervision` (colonne 3)                                | `supervision/handover-slots.ts`                          | file de retrait groupée par tranche du créneau                                                                              |
| `/colisage`, `/tour-manager`, `/coursier`, `/livraison/…` | `app.routes.ts`                                          | tournées et bacs — non relus en détail                                                                                      |

Aucun écran ne mélange livraisons et retraits dans une liste triée par une
heure commune — c'est pourtant ce que la demande suppose. **Écran visé : Q2.**

### 2.3 L'heure de « départ »

- **Livraison** : `DeliveryRound.plannedDepartureAt` (prévu, effacé dès qu'un
  geste à la main change les arrêts) et `departedAt` (réel), schéma
  `delivery` ; commande reliée par `DeliveryRoundStop.orderId` (opaque). Le
  fournil a `order_departure.departedAt`. **Aucun contrat de liste ne porte
  ces heures**, et le commerce ne les lit que par `delivery/channels/commerce/`.
- **Retrait** : pas de départ ; ce qui en tient lieu est le **créneau
  convenu**, figé (`Order.fulfillment.window`, `{ start | null, end }`,
  `packages/contracts/src/order.ts` / `address.ts`).
- **Val Village** : un site (une **donnée**). Le nom n'apparaît dans le code
  que dans un test (`handover-shop/handover-queue.spec.ts`). La commande en
  garde un snapshot sans id (`Order.pickupAddress`) ; les vues du retrait
  exposent `pickupLabel`.
- **Adroit** : un site, que Hugo saisira (Q3 ✅).

### 2.4 Les catégories se dérivent-elles ?

Oui, presque, de trois champs figés sur la commande :

| Catégorie demandée         | `fulfillmentMethod` | `clientele` | site        |
| -------------------------- | ------------------- | ----------- | ----------- |
| Livraison B2B — bleu       | `delivery`          | `pro`       | —           |
| C&C B2B — jaune            | `pickup`            | `pro`       | (tous)      |
| C&C B2C Adroit — orange    | `pickup`            | `public`    | Adroit      |
| C&C B2C Val Village — gris | `pickup`            | `public`    | Val Village |

Trous : la livraison **B2C** n'avait pas de couleur (le site en porte une
désormais) ; `clientele = NULL` (commandes d'avant la distinction) non plus ;
et le site n'est qu'un **libellé** dans les vues — une couleur attachée à un
libellé casse au premier renommage, d'où le `siteId` du snapshot (lot S2 des
sites).

### 2.5 Le vocabulaire fold (fold-ng 0.28.1, lu dans `node_modules`)

- Badges : `neutral | accent | info | warning | alert | success`.
- Pas d'**orange** dans fold (`--fold-ref-amber-550/600` s'en approche et se
  confond avec `warning`).
- Précédent d'un token local : `--lfc-stage-*` (`apps/lfd-backoffice-frontend/src/styles.scss`) ;
  `lint:fold-tokens` refuse un `var()` inexistant.

Les couleurs étant devenues libres (`#rrggbb` saisi par site), la question
du vocabulaire fold se réduit à la **teinte neutre** d'une commande sans
couleur et au **contraste** clair / sombre, qui ne se vérifie plus une fois
pour toutes.

## 3. L'heure de chaque commande

**Écran** : Q2. Par défaut, `/commandes` filtrée sur un jour de service.

| Commande                                 | Heure de départ                                                                                                                                                                             | Source                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| livraison (B2B ou B2C)                   | `plannedDepartureAt ?? departedAt` de sa tournée                                                                                                                                            | `delivery`, lecteur neuf par lot                      |
| retrait sur un site `transfer` (village) | le départ de la tournée qui porte l'arrêt de son **transfert** (B2B en intégré, dédiée sinon) ; avant composition : départ requis calculé, figé dans `production_order.due_at` à la clôture | même lecteur ; puis le site (plan du transfert, §4.6) |
| retrait sur un site `on_site`            | `window.start ?? window.end` (créneau figé)                                                                                                                                                 | commerce, déjà sur la commande                        |
| sans heure                               | en fin, « pas encore de départ »                                                                                                                                                            | —                                                     |

Le lecteur neuf : `OrderDepartureReader.departuresOf(orderIds)` → par
commande `{ plannedAt, departedAt, via: 'delivery' | 'transfer' }` — pour une
commande du village, lu par `delivery_internal_transfer_order` puis l'arrêt
du transfert, donc juste dans les deux modes ; **déclaré et implémenté par
`delivery`** (forme des `OrderDeliveryHistoryReader` du 2026-10-08), lu par
lot.

## 4. La couleur de chaque commande

Toutes sur le site, sous `lfc_site_settings`
([`../sites/sites.md`](../sites/sites.md) §3) :

| Catégorie                                       | Couleur (demande) | Où elle vit                                                                |
| ----------------------------------------------- | ----------------- | -------------------------------------------------------------------------- |
| Livraison B2B                                   | bleu              | `Site.deliveryColorB2b` du site **qui livre** (`deliveryDeparture = true`) |
| Livraison B2C                                   | (non demandée)    | `Site.deliveryColorB2c`, même site                                         |
| C&C B2B (tous sites)                            | jaune             | `Site.pickupColorB2b`                                                      |
| C&C B2C Adroit                                  | orange            | `Site.pickupColorB2c` d'Adroit                                             |
| C&C B2C Val Village                             | gris              | `Site.pickupColorB2c` de Val Village                                       |
| `clientele = NULL`, `siteId` absent             | neutre            | catégorie « autre » de la fonction pure, jamais une couleur inventée       |
| site **sans couleur** (retirée ou jamais posée) | neutre            | **teinte neutre par défaut** — laquelle, à trancher au lot L1              |

Les couleurs de livraison ont **quitté `DeliveryAvailability`** pour le site
qui livre (S3 du premier passage de `vitruve` : une palette, un écran, un
droit) — c'est bâti côté site ; Q-S7 demandait confirmation. Une commande du
village garde le gris même triée avec les tournées : **la couleur dit à qui
on remet, l'heure dit quand ça part.**

`logisticsCategoryOf(order, sites)` vit **côté back-office**, pas dans
`@lfd/contracts` : la boutique ne s'en sert pas, et le baril pèse sur son
budget de 1,30 Mo.

## 5. Lots

| Lot | Taille | Contenu                                                                                                                  | Dépend de                                |
| --- | ------ | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| L1  | S      | fonction pure de catégorie (back-office), pastille ; tokens `--lfc-site-*` **à revoir** (couleurs libres), teinte neutre | S2 des sites (`siteId` dans le snapshot) |
| L2  | M      | `OrderDepartureReader` + tri de la liste ; tri du colisage par `dueAt`                                                   | T1 du transfert (pour le village)        |
| L4  | ?      | « Écrire » — **hors du chantier** (Q1 mise de côté)                                                                      | —                                        |
| L5  | S      | couleur sur les supports imprimés (si Q8 = papier)                                                                       | L1                                       |

Le tri du colisage par `dueAt` répond, pour le village, à la question 1 de
[`../colisage/todo-colisage-tri-par-echeance.md`](../colisage/todo-colisage-tri-par-echeance.md).

## 6. Questions à Hugo

- ~~**Q1**~~ — « Écrire » : mis de côté (2026-10-13).
- **Q2** — Quel écran porte le tri et les couleurs ?
- ~~**Q3**~~ — ✅ « Adroit » est le nom d'un site, saisi en admin.
- **Q8** — Surligneurs sur papier ou à l'écran ?
- **Q-S7** — Les couleurs de livraison sur le site qui livre ? (Bâti ainsi.)

Tranchées le 2026-10-13 (texte relu dans l'écart logistique d'origine, commit `9c04635a0`, le plan commun ne le portait plus) :

- ~~**Q4**~~ — « Modifiable » par qui : un **écran** (Réglages › Sites), pas
  un commit — d'où l'ancien lot L3, absorbé par S1 des sites.
- ~~**Q5**~~ — La couleur appartient au **site**, pas à une catégorie fixe :
  elle survit à un cinquième site sans code.
- ~~**Q6**~~ — Livraison B2C : une couleur du site qui livre ;
  `clientele = NULL` : neutre (§4).
- ~~**Q7**~~ — Val Village se range avec les tournées par le **transfert
  interne** (plan à part).
