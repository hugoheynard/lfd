# Plan — trier les commandes par heure de départ, et les colorer

> **État : 🟡 partiel, 2026-10-14.** **L1a, L1b et L5 bâtis le 2026-10-13** —
> voir « Ce qui est bâti » sous §5. **L2 bâti en partie le 2026-10-14 (non
> commité à l'écriture)** : le colisage est rangé par heure « prête pour » ; le
> tri de la liste `/commandes` attend Q2. L4 est hors du chantier. Les couleurs qu'il lit existent sur les sites
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

**Décisions du 2026-10-13 au soir (L1, L5) :**

- **Q2** : les couleurs vont sur le **poste de colisage**, le **tableau des
  tournées**, le **chargement** et **Ma tournée** ; le comptoir a déjà ses
  onglets par site ;
- **Q8** : écran **et** papier. Sur le papier (étiquettes de bac, feuille de
  route, bon), un **carré de couleur placé après les dates, en symétrie du
  logo** ;
- la couleur **se lit à l'affichage**, jamais figée sur la commande : la
  commande (et la copie qu'en tient le colisage) porte son **site** et sa
  **clientèle**, la palette se lit au site — un changement en Réglages ›
  Sites se voit partout tout de suite ;
- la palette est lisible par la logistique **sans** `lfc_site_settings` :
  une lecture seule (id, nom, quatre couleurs) ouverte aux droits du
  colisage, de la livraison et du comptoir ;
- les couleurs étant libres, la pastille choisit son texte clair ou sombre
  par contraste (luminance), sans quoi un jaune saisi serait illisible.

**Après la contradiction de `vitruve` (2026-10-13, nuit) — Hugo : « fais un
maximum de choses » :**

- ~~Pas de couleur sur le bon~~ — **revu par Hugo le même soir** : la
  couleur va sur le bon, en **trait épais entre le numéro de commande et
  « Bon de commande »**. Assumé et dit : le bon est figé à la passation,
  archivé et envoyé au client (`order-sheet-archive.service.ts`) — la couleur
  y est donc celle **du moment de la passation**, le client la voit, et les
  bons déjà émis n'en ont pas. Sans site ou sans couleur : pas de trait ;
- **papier** : étiquette de bac (HTML imprimé par le front, donc L1b) = un
  carré dans le coin opposé au code ; feuille de tournée = un carré en tête de
  **chaque arrêt** (une tournée mélange plusieurs catégories) ; feuille de
  route du retrait = le carré après les dates, en symétrie du logo, si elle en
  a un ;
- **colisage** (Hugo) : les lignes de la colonne commande sont regroupées dans
  un cadre par catégorie — et par tranche horaire s'il y en a plusieurs —
  bordé à gauche et en haut de la couleur, son titre écrit dans la bordure
  haute (« Transfert Val Village », « Livraison pro »…), lisible de loin ;
- la copie du colisage porte **déjà** `clientele` (`packing.prisma`, depuis le
  2026-10-06) : L1a n'y ajoute que `site_id` ; les lignes tirées avant le
  déploiement n'en auront jamais (`createMany … skipDuplicates`) et restent
  en teinte neutre — accepté en pré-release ;
- **catégorie sans site** : retrait sans `siteId` (d'avant S2) ou
  `clientele = NULL` → teinte neutre, jamais une couleur inventée ;
  livraison → les couleurs de livraison du site de départ **actuel**
  (`DepartureSiteReader`) : un seul départ aujourd'hui ; plusieurs départs
  demanderont que la tournée retienne le sien ;
- **droits de la palette** (lecture seule, `RequireAnyPermission`) :
  `production_packing`, `delivery_rounds`, `delivery_loading`,
  `delivery_driving` ;
- **frontières** : la livraison et le retrait lisent la palette par un port
  qu'ils déclarent (`…/channels/commerce/`) et que le commerce implémente ;
  `DeliveryOrdersReader` et `TransferOrderContentsReader` gagnent site et
  clientèle.

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

| Lot    | Taille | Contenu                                                                                                                                                                                                                                                                                                               | Dépend de                         |
| ------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| L1a ✅ | M      | serveur : la copie du colisage porte `siteId` et `clientele` (fait du fournil + migration additive du schéma `packing`) ; les vues de la livraison exposent site et clientèle par arrêt (canal du commerce, par lot ; par commande dans le manifeste d'un transfert) ; lecture seule de la palette pour la logistique | S2 des sites, T1–T3 du transfert  |
| L1b ✅ | S      | back-office : store de palette, fonction pure de catégorie, un composant de pastille (contraste calculé), teinte neutre ; posé sur colisage, tournées, chargement, Ma tournée                                                                                                                                         | L1a                               |
| L2 🟡  | M      | `OrderDepartureReader` + tri de la liste ; tri du colisage par `dueAt` — **colisage bâti le 2026-10-14** (voir plus bas), liste en attente de Q2                                                                                                                                                                      | T1 du transfert (pour le village) |
| L4     | ?      | « Écrire » — **hors du chantier** (Q1 mise de côté)                                                                                                                                                                                                                                                                   | —                                 |
| L5 ✅  | S      | papier (Q8 = oui) : carré de couleur après les dates, en symétrie du logo, sur étiquettes de bac, feuille de route et bon                                                                                                                                                                                             | L1a                               |

### Ce qui est bâti (L1a, L1b, L5 — 2026-10-13, non commité à l'écriture)

**L1a, serveur.**

- Le fait `production.packing_list_drawn` porte `siteId` (additif : un fait
  sans le champ se lit « sans site ») ; le colisage le recopie dans
  `packing.packing_order.site_id` (migration
  `20261013730000_le_site_suit_au_colisage`, une colonne `TEXT NULL`, sans
  rattrapage). `PackingSheet` sert `siteId` et `dueAt` (facultatifs dans le
  type, comme `qualityHeld`).
- `DeliveryOrdersReader.byIds` rend `clientele` et `siteId` ;
  `TransferOrderContentsReader` gagne `categoriesOf(orderIds)` (clientèle et
  site, en une lecture). Les vues exposent, en champs facultatifs : `clientele`
  par arrêt (tournées, chargement, Ma tournée) et par commande dans le
  manifeste d'un transfert (relue même figé : elle ne se recopie pas),
  `siteId` sur les arrêts de transfert et le manifeste, et le mode, la
  clientèle et le site sur `DeliveryOrderBinsView` (l'étiquette).
- `GET admin/sites/palette` (`GetSitePaletteQuery`) : id, nom,
  approvisionnement, quatre couleurs, `isDeparture` — sous
  `RequireAnyPermission` (`production_packing`, `delivery_rounds`,
  `delivery_loading`, `delivery_driving` en lecture), qui remplace la
  ressource de la classe (`StaffAccessGuard`) ; vérifié en e2e (`sites`).
  `supply` et `isDeparture` s'ajoutent à « id, nom, quatre couleurs » : le
  premier titre « Transfert … », le second désigne les couleurs de livraison.
- Ports de couleur, déclarés par chaque bloc et implémentés par
  `b2b/sites/` (`DepartureDeliveryColors`) : `DeliveryColorsReader`
  (`delivery/channels/commerce/`) et `RunSheetColorsReader`
  (`handover/channels/commerce/`) — les couleurs de livraison du départ
  actuel, lues à chaque lecture.

**L1b, back-office** (`shared/logistics-colors/`) : `SitePaletteStore`
(relu à l'ouverture de chaque écran, jamais au démarrage),
`logisticsCategoryOf` et `inkOn` (encre claire / sombre par luminance WCAG),
`LogisticsSwatch` (teinte neutre : `surface-sunken` + `border`). Posé sur le
tableau des tournées (pastille par arrêt, clientèle lue sur la feuille de
route), le chargement (« Ce qui manque »), Ma tournée (arrêt de commande),
le colisage (`apps/lfd-backoffice-frontend/src/app/production/colisage/packing-frames.ts`) et l'étiquette de bac
(carré en haut à droite, le code étant en bas).

**Cadres du colisage, revus le 2026-10-14 (Hugo)** — ordre FIXE dans un
groupe, commandes dans leur ordre servi à l'intérieur de chaque cadre.
⚠️ **Revu le même jour par L2** (Hugo : « trie DANS chaque cadre, et ordonne
les cadres par leur échéance la plus tôt ») : l'ordre ci-dessous ne départage
plus que les égalités ; les retraits d'un transfert gardent leur ordre fixe
(ils partent ensemble).

1. **Transfert <site>** (aujourd'hui Val Village) : un cadre englobant
   NEUTRE — il mêle des clientèles, comme l'arrêt de transfert des tournées —
   qui contient « Retrait pro Val Village » et « Retrait particulier Val
   Village » aux couleurs de retrait du site, sans découpage horaire, puis
   « Réapprovisionnement Val Village ». Ce dernier n'est pas bâti : la forme
   l'accepte (`PackingReplenishmentFrame`, troisième argument de
   `packingFrames`, que rien ne sert encore) et aucun cadre vide n'est produit.
2. **Livraison pro**, puis **Livraison particulier** : UN cadre chacun, sans
   heure — l'échéance d'une livraison est la fenêtre du client, et le
   découpage faisait un cadre par commande.
3. **Retraits sur place**, rangés par heure, coupés par créneau quand une
   catégorie en a plusieurs (« Retrait particulier Adroit · 08:00 »).

Ces titres sont propres au colisage : `logisticsCategoryOf` garde
« Transfert Val Village · particulier » pour les autres écrans.

**L5, papier serveur** : la feuille de tournée PDF porte un carré cerclé au
bord droit de l'en-tête de chaque arrêt de livraison ; la feuille de route
(`handover`) sert `color` par arrêt, que l'écran imprime après l'horaire ; le
bon de commande porte un trait épais sous « Bon de commande », numéro
descendu sous lui — lu au rendu (`OrderSheetColorSource`), donc figé avec le
bon archivé ; la version de dessin (`-d2`) n'a pas bougé, pour que les bons
déjà rangés restent sans trait.

**Ce qui n'a pas de couleur, délibérément** : un arrêt de transfert (tournées,
chargement, Ma tournée, feuille de tournée) — il mêle des clientèles ; les
commandes de son manifeste portent la leur dans la vue, l'écran ne la peint
pas encore. Au colisage, le cadre « Transfert Val Village » est neutre pour la
même raison, et ses cadres intérieurs portent les deux couleurs de retrait
(2026-10-14).

Le tri du colisage par `dueAt` répond, pour le village, à la question 1 de
[`../colisage/todo-colisage-tri-par-echeance.md`](../colisage/todo-colisage-tri-par-echeance.md).

### Ce qui est bâti de L2 (2026-10-14, non commité à l'écriture)

**Le colisage, seulement.** Le poste lit l'heure à laquelle chaque commande
doit être prête, la sert et se range par elle.

| Commande                                             | Heure « prête pour »                                                                | Source     |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------- |
| livraison                                            | départ de sa tournée (`plannedDepartureAt ?? departedAt`)                           | `round`    |
| livraison sans tournée, ou tournée sans départ prévu | aucune — « Pas encore de départ », en fin                                           | —          |
| retrait porté par un transfert                       | départ de la tournée qui porte l'arrêt du transfert, sinon départ réel du transfert | `transfer` |
| idem, transfert sans départ                          | l'échéance figée (`dueAt` = arrivée requise au site)                                | `due`      |
| retrait sur place                                    | l'échéance figée (`dueAt` = créneau − mise en place)                                | `due`      |

- **Le port est déclaré par le colisage**, pas par la livraison dans
  `delivery/channels/commerce/` comme le §3 l'écrivait :
  `OrderDeparturesReader` (`packing/channels/delivery/`), implémenté par la
  livraison (`PrismaOrderDeparturesReader`, deux lectures par lot), relié dans
  `appBootstrap/packing-delivery-feed.module.ts`. `packing → delivery` est
  interdit ; c'est la forme de `BinDesk`.
- **Aucune marge de chargement** n'est retirée au départ : il n'en existe pas
  dans les réglages de la livraison (`RoutingSettingsValues`, relu le
  2026-10-14).
- `PackingSheet` gagne `readyBy` et `readyBySource` (facultatifs dans le type,
  comme `siteId`) ; `packingBoardOf` sert les fiches dans cet ordre, puis par
  référence (`apps/lfd-api/src/packing/domain/services/ready-by.ts`).
- Écran : chaque commande dit « Prête pour 07 h 10 · départ de la tournée »
  (`apps/lfd-backoffice-frontend/src/app/production/colisage/packing-ready-by.ts`) ; dans `packing-frames.ts`, les commandes d'un cadre
  par heure, les cadres par leur heure la plus tôt.

**Reste de L2** : `OrderDepartureReader` côté commerce et le tri de
`/commandes` — l'écran n'est pas tranché (Q2 ne parle que des couleurs).
⚠️ Le départ prévu est **effacé dès qu'un geste à la main change les arrêts**
(§2.3) : une journée composée à la main n'a pas d'heure de livraison au
colisage tant qu'elle n'est pas rechronométrée par « Appliquer ».

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
