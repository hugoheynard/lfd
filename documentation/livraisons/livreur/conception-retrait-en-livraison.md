# Retrait en livraison — conception v1

> 🗄️ **Conception du 2026-09-11, gardée pour l'histoire des décisions — ce
> n'est plus un état du code** (bandeau du 2026-10-07, audit du dossier
> `livraisons/`).
>
> **Ce qu'il est** : la conception v1 du retrait en livraison, écrite le
> 2026-09-11 (`093b254a4`) après les objections de `vitruve` rappelées
> ci-dessous, avec ses trois sorties pour le code de retrait et ses huit
> questions. Une note y a été ajoutée le 2026-09-29 (§ 8). Le raisonnement
> reste lisible tel qu'il a été tenu.
>
> **Ce qu'il n'est plus** : une description du code. « Aucune ligne n'est
> écrite » (l'ancienne tête de ce fichier) est faux depuis le 2026-09-29
> (`f957e9b45`, premier fichier de `src/delivery/`), et chaque « aujourd'hui »
> du texte veut dire le 2026-09-11.
>
> **Où lire l'état réel** : [`a-la-porte.md`](a-la-porte.md) — les gestes à
> la porte, l'échec, la décision du commercial, la garde au départ, les
> preuves ; [`composition-automatique.md`](../tournees/composition-automatique.md) —
> composer les tournées ; [`plan-droits-par-geste.md`](../droits/plan-droits-par-geste.md)
> — qui peut quoi. La table ci-dessous dit où chaque mécanisme est passé ;
> chaque cellule a été rouverte dans le code le 2026-10-07. Le corps n'est
> pas réécrit : la phrase de sécurité devenue fausse (§ 10) porte une note
> `⚠️ [2026-10-07]`.

## Ce que chaque mécanisme est devenu — relevé du 2026-10-07

| #   | Ce que ce document décrit                                                                                           | Ce qui existe aujourd'hui                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Verdict                                               |
| --- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| 1   | **Le code de retrait atteint la porte** (§ 2, trois sorties ; § 12, q. 1)                                           | Tranché le 2026-09-29 (L6-Q2, lot 6 de [`plan-preparation-de-tournee.md`](../tournees/plan-preparation-de-tournee.md)) : **(a) d'abord**, par e-mail au contact de livraison, envoyé au départ (L6-Q6) ; **(b)** quand personne n'accueille ; (c) écarté. **(b) est bâti** : « Remis au client » (photo, nom, signature si exigée → `via = manual`) et « Déposé avec preuve » (photo → `via = deposit`), sous `delivery_doorstep` (`my-delivery-doorstep.controller.ts` → `handover-doorstep-attestor.ts`). **(a) ne l'est pas** : `deliveryContactSchema` (`address.ts`) n'a toujours que prénom, nom, téléphone ; le courriel « en route » part au compte qui a commandé, sans code (`delivery-en-route-mail.ts`) ; `via = scan` ne s'écrit qu'au comptoir (`confirm-handover.handler.ts`). → [`a-la-porte.md`](a-la-porte.md) § 1, § 10 | (b) bâti tel quel ; (a) tranché, **toujours ouvert**  |
| 2   | **La tournée** : un agrégat, composé par un humain, à bâtir seulement au deuxième véhicule (§ 3 ; § 12, q. 3)       | `DeliveryRound` (`delivery-round.ts`, table `delivery.delivery_round`) : un jour, un véhicule, un passage, ses arrêts ordonnés ; partie, rentrée, livreur affecté. Bâtie dès le 2026-09-29, sans attendre un second véhicule : une flotte (`DeliveryVehicle`), plusieurs passages par véhicule. Le calcul compose (« Proposer les tournées ») ; le bureau garde le dernier mot (« Appliquer » est toujours un clic humain, glisser-déposer). → [`composition-automatique.md`](../tournees/composition-automatique.md) § 1                                                                                                                                                                                                                                                                                                                  | bâti autrement                                        |
| 3   | **Le chargement**, réconciliation d'ensemble par les feuilles d'atelier, avec un second lecteur `referenceOf` (§ 4) | Réconciliation par **bacs** : le QR d'un bac (`…/livraison/bac/{id}`) ou son code court de six caractères, lus par `scannedBin` (`livraison/delivery-loading.ts`), qui refuse la feuille d'atelier (`/colisage/…`) — aucun lecteur de feuille n'a été écrit pour le chargement. Un chargement est une ligne de `delivery.delivery_bin_load`. « Partir » est refusé tant qu'un arrêt vivant n'a pas de bac déclaré ou pas tous ses bacs chargés (`unreadyStops`, `departure-readiness.ts`)                                                                                                                                                                                                                                                                                                                                                  | bâti autrement                                        |
| 4   | **Trois faits** : colisé (`production_order.packed_at`), chargé (« nulle part »), remis (§ 5)                       | Colisé : au **colisage** depuis K3c — `packing.packing_order.packed_at` (`packing.prisma`), fait durable `packing.order_packed` (`packing-order-packed.event.ts`), dont le commerce tire `ready`. Chargé : `delivery.delivery_bin_load.loaded_at`, par bac et par arrêt, jamais un statut de commande. Remis : `production.order_handover`, inchangé. → [`../../colisage/colisage.md`](../../colisage/colisage.md)                                                                                                                                                                                                                                                                                                                                                                                                                         | colisé et chargé bâtis autrement ; remis tel quel     |
| 5   | **Un échec n'est pas un retrait** (§ 6)                                                                             | Un signalement s'écrit dans `delivery.delivery_incident` (trois familles, motif fermé, photo facultative) : il ne clôt rien et n'écrit jamais `order_handover`. → [`a-la-porte.md`](a-la-porte.md) § 3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | bâti tel quel                                         |
| 6   | **Une livraison ratée n'a aucun chemin de retour** (§ 6 ; § 12, q. 4)                                               | Tranché le 2026-09-29 (L6-Q4 : l'admin choisit — relivrer, retrait au comptoir, annuler). Bâti : « À décider » (`delivery.stop_decision`, `stop-decisions.controller.ts`) — autoriser le dépôt ou **rapporter** ; « Rapporter » clôt l'arrêt et écrit le fait durable `delivery.orders_brought_back` ; la commande rapportée réapparaît « à répartir », de n'importe quel jour (RL1, `delivery-rounds-view.ts`). Pas bâti : relivrer un autre jour, retrait au comptoir, annuler (6 c) — deux remboursent et attendent les avenants. → [`a-la-porte.md`](a-la-porte.md) § 4, § 10                                                                                                                                                                                                                                                          | « Rapporter » bâti ; 6 c **toujours ouvert**          |
| 7   | **`signatureRequired` n'est imprimé nulle part** (§ 6 ; § 12, q. 5)                                                 | Imprimé sur le bon du dossier de production (« Signature exigée à la remise », `dossier-sheet-head.ts`) et sur la feuille de route papier (« n signatures exigées », `round-paper-pdf.ts`) ; figé au départ (`delivery_stop_execution.signature_required`) ; exigé à la porte : signature au doigt jointe à « Remis au client » (`hand-over-stop.handler.ts`), et dépôt interdit au livreur seul (AP-Q6). L6-Q3 (le scan du code vaut signature) attend le code à la porte (ligne 1). → [`a-la-porte.md`](a-la-porte.md) § 1, § 4                                                                                                                                                                                                                                                                                                          | bâti autrement ; scan = signature **toujours ouvert** |
| 8   | **Le hors-ligne** (§ 6 ; § 12, q. 7)                                                                                | Tranché le 2026-09-29 : pas de hors-ligne pour l'instant (L6-Q5). Les gestes restent des `POST` synchrones ; rien ne les met en file sur le téléphone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | tranché autrement (non)                               |
| 9   | **La tranche d'une heure**, obligatoire ; le mode `perDay` « branché nulle part » (§ 7 ; § 12, q. 6)                | Une **fenêtre** obligatoire, créneau **ou** échéance : mode global `delivery_settings.window_mode` (défaut `deadline` depuis le 2026-10-04, `settings.prisma`), redéfini par adresse, plusieurs fenêtres par adresse et une par commande ; une livraison sans fenêtre est refusée à la passation (`ensureDeliveryWindow`, `b2b/orders/domain/services/delivery-window.ts`). Les créneaux par jour sont lus (`slotsFor`, `preferred-slots.ts`, appelé par `prisma-delivery-defaults.reader.ts`). L'échéance est le critère de rang 1 de la composition (`insert-cheapest.ts`) ; une place qui la rend intenable s'affiche en rouge (CA5, `placement-lateness.ts`). → [`composition-automatique.md`](../tournees/composition-automatique.md) § 1, § 3                                                                                        | tranché autrement                                     |
| 10  | **Où ça vit** (§ 9)                                                                                                 | Comme prédit : le retrait reste dans `handover/`, la logistique a son bloc `src/delivery/` (déclaré dans `context-boundaries.mjs`) ; `b2b → delivery` par `delivery/channels/commerce/` seulement ; `delivery → b2b` et `delivery → handover` interdits — la livraison **déclare** `delivery/channels/handover/`, le retrait l'implémente. Schéma Postgres `delivery` depuis le 2026-09-30 ; `order_handover` reste dans `production`. → [`architecture-isolation-livraison.md`](../architecture/architecture-isolation-livraison.md), [`plan-schema-delivery.md`](../architecture/plan-schema-delivery.md)                                                                                                                                                                                                                                | bâti tel quel (schéma tranché : `delivery`)           |
| 11  | **Les droits** : pas de coursier, cinq rôles, le scan sous `b2b_orders` (§ 1, § 10 ; § 12, q. 2)                    | Sept rôles dans le contrat (`staff-access.ts`), aucun n'est livreur : « Livreur » se crée à l'écran des rôles (`/admin/roles`) avec `delivery_driving` (sa tournée, `/coursier`) et `delivery_doorstep` (les gestes à la porte). Le scan du comptoir est sous `handover_counter` depuis le 2026-10-01 (`8b424bb2f`, `handover.controller.ts`). → [`plan-droits-par-geste.md`](../droits/plan-droits-par-geste.md) (DG-D6), [`tableau-droits-livraison.md`](../droits/tableau-droits-livraison.md)                                                                                                                                                                                                                                                                                                                                          | tranché autrement                                     |
| 12  | **« Aucune ligne n'est écrite »** ; la route `/livraison` « réservée et vide exprès » (tête ; § 1)                  | `src/delivery/` : 803 fichiers suivis (610 `.ts` hors tests), 31 contrôleurs, 22 tables du schéma `delivery` (`delivery.prisma`). `/livraison` : 15 vues, chacune sous son droit (`lfd-backoffice-frontend/src/app/app.routes.ts`) — `livraison-page.ts` est devenue la feuille de route — et le livreur a `/coursier`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | **faux** depuis le 2026-09-29                         |
| 13  | **Les huit questions** (§ 12)                                                                                       | q. 1 (le code) → ligne 1, tranchée, (a) non bâti ; q. 2 (un rôle coursier) → ligne 11 ; q. 3 (combien de véhicules) → ligne 2, une flotte ; q. 4 (livraison ratée) → ligne 6, tranchée, 6 c non bâti ; q. 5 (la signature) → ligne 7 ; q. 6 (les tranches à la composition) → ligne 9 ; q. 7 (hors-ligne) → ligne 8, non. q. 8 (le double scan) : aucune décision écrite ; la conception du lot 6 (L6-C3) ne prévoit qu'un scan, le code du client, et aucun scan n'existe à la porte aujourd'hui (photo, nom, signature)                                                                                                                                                                                                                                                                                                                  | sept résolues ; q. 8 **toujours ouverte**             |

Le texte qui suit est la conception telle qu'écrite le 2026-09-11 (avec la note
du 2026-09-29 au § 8) ; il n'est modifié que par la note `⚠️ [2026-10-07]` du
§ 10.

---

> ⚠️ **Ce document est une v1, pas un premier jet.** Le premier jet a été soumis
> au contradicteur `vitruve`, qui a rendu **quatre objections BLOQUANTES** —
> toutes vérifiées depuis, fichier ouvert. Trois d'entre elles ont changé la
> conception, pas sa rédaction :
>
> 1. le code de retrait **n'atteint pas la personne qui réceptionne** ;
> 2. le lecteur de QR **refuse** le code de la feuille d'atelier ;
> 3. le retrait en livraison **appartient déjà** au bloc `handover`, dont la
>    déclaration dit « au comptoir **comme sur le pas d'une porte** ».
>
> Ce qui suit intègre ces trois-là. Les objections non résolues sont au §12,
> nommées, et non enterrées.

---

## 1. Ce qui existe, vérifié le 2026-09-11

- **Un jeton par commande**, `orders.handover_token`, `@unique`
  ([`orders.prisma`](../../../apps/lfd-api/prisma/schema/public/orders.prisma)). Il
  est émis **sans condition d'acheminement** depuis le 2026-09-07.
- **Les colonnes de retrait du commerce sont un SNAPSHOT**, pas la source :
  l'attestation vit dans `production.order_handover`, et `orderId`/`reference` y
  sont `@unique` — une seconde retrait est refusée **en base**.
- **La règle de retrait ne bloque plus la livraison**
  ([`handover.ts`](../../../apps/lfd-api/src/handover/domain/services/handover.ts)).
- **Le fournil prépare déjà le chargement** : `ProductionOrder` recopie
  `fulfillmentMethod` et `destination` — « de quoi poser la feuille sur la bonne
  pile, **et charger le bon véhicule** » — et imprime une feuille par commande,
  sans montant, avec son QR `/colisage/{référence}`
  ([`atelier-sheet-pdf.ts`](../../../apps/lfd-api/src/production/domain/services/atelier-sheet-pdf.ts)).
- **Le serveur ne filtre PAS les livraisons.**
  [`handover-queue.reader.ts`](../../../apps/lfd-api/src/handover/channels/commerce/handover-queue.reader.ts)
  rend toute la journée, et son champ `fulfillmentMethod` porte déjà le
  commentaire « le coursier charge ici, le client vient ici ». C'est le **front**
  qui écarte (`atTheCounter`). 🔴 Le premier jet affirmait le contraire et en
  tirait que la tournée était sur le chemin critique — voir §3.
- **La route `livraison` est réservée et vide exprès**
  ([`livraison-page.ts`](../../../apps/lfd-backoffice-frontend/src/app/livraison/livraison-page/livraison-page.ts)).
- **Cinq rôles staff**, et aucun n'est un livreur
  ([`staff-access.ts`](../../../packages/contracts/src/staff-access.ts)) : `admin`,
  `commercial`, `comptabilite`, `support`, `dev`.

---

## 2. 🔴 Le trou qui commande tout : le code n'atteint pas la porte

C'est l'objection qui a retourné le document, et elle est structurelle.

Le courriel de passation part à **`recipient.email`, résolu depuis
`event.placedByUserId`**
([`send-order-placed-mail.handler.ts`](../../../apps/lfd-api/src/b2b/orders/application/handlers/send-order-placed-mail.handler.ts)) :
c'est le **compte qui a commandé**. Et
[`deliveryContactSchema`](../../../packages/contracts/src/address.ts) porte
`{prenom, nom, telephone}` — **aucune adresse e-mail**. Il n'existe donc _aucun
chemin_ pour faire parvenir le QR à la personne qui réceptionne.

Or c'est le cas normal en B2B : un acheteur commande depuis son bureau, un
employé du site réceptionne à 7 h. **La personne derrière la porte n'a jamais
reçu le code.**

⚠️ **Et l'historique est pire** : la migration du 2026-09-07 l'écrit noir sur
blanc — « Rien n'est écrit ici sur les commandes en coursier existantes : elles
n'ont pas de jeton, et leur en fabriquer un rétroactivement inventerait un secret
que personne n'a jamais reçu. »

### Ce que ça invalide

L'idée que « le geste heureux est déjà servi » est **fausse**. Elle n'est vraie
que si l'acheteur est physiquement le réceptionnaire.

### 🔴 Et la sortie facile est piégée

Le schéma l'avait anticipé, à propos de `handedOverVia` :

> sans cette distinction, quelqu'un finirait par **imprimer le code sur le
> colis** « pour les livraisons difficiles », et un coursier scannerait son
> propre carton.

Imprimer le jeton sur la feuille agrafée résoudrait tout — et détruirait la
seule preuve du système. Le scan vaut parce qu'il faut être **deux** ; un code
que le coursier transporte lui-même n'atteste plus rien.

**Trois sorties possibles, et c'est la première décision à prendre :**

|                                                     | ce que ça coûte                              | ce que ça vaut                                                           |
| --------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------ |
| **a.** collecter l'e-mail du contact de livraison   | un champ au carnet, un second envoi, du RGPD | le geste du comptoir, à l'identique                                      |
| **b.** attester `manual` en livraison, assumé       | rien à bâtir                                 | une preuve faible, mais **honnête** — et l'auteur staff reste enregistré |
| **c.** un code **par site**, affiché chez le client | un objet nouveau                             | tient sans e-mail, mais ce n'est plus un secret par commande             |

⚠️ Ne pas choisir **b** par défaut en croyant que **a** viendra plus tard : une
attestation faible qui marche n'est jamais remplacée.

---

## 3. La tournée — ✅ un humain compose, le matin

**Tranché le 2026-09-11.** Pas de dérivation depuis les zones. Un tri
géographique peut **aider** — proposer un ordre, rapprocher ce qui est voisin —
mais il n'attribue rien.

🔴 **Écrire la différence maintenant, parce qu'elle s'efface toute seule.** Un
tri qui range une liste et un système qui compose les tournées se ressemblent à
l'écran. La seule chose qui les distingue est **qui a le dernier mot**, et le
jour où l'aide devient le défaut, plus personne ne sait pourquoi telle commande
est dans tel véhicule — et le répartiteur ne peut plus s'en écarter sans avoir
l'air de se tromper.

**La tournée est donc un agrégat**, au critère du `CLAUDE.md` §3.1 : elle a un
état (en composition → chargée → partie → rentrée) et des transitions qu'on peut
refuser (on ne recompose pas une tournée partie).

### ⚠️ Mais elle n'est pas sur le chemin critique

Le premier jet affirmait que « ai-je tout ? » n'a pas de second terme sans elle.
**C'est faux** : `expectedOn(jour)` filtré sur `delivery` exprime déjà « ce qui
part aujourd'hui ». Tant qu'il n'y a **qu'un véhicule**, la journée EST la
tournée, et la réconciliation marche sans rien inventer.

La tournée devient nécessaire au **deuxième véhicule**. C'est une question de
volume, pas d'architecture — et la réponse appartient à Hugo. La bâtir avant
serait payer un agrégat, un schéma et trois lignes de gate pour un ensemble qui
a un seul élément.

---

## 4. Le chargement : une réconciliation d'ENSEMBLE

Au comptoir, le geste éprouve une **paire** : le code du client _désigne_ la
commande, le QR du sac vérifie que c'est bien celui-là.

Au dépôt, **il n'y a personne en face** : le premier terme n'existe pas. Le
coursier scanne vingt feuilles d'affilée, et ce qu'il vérifie est d'une autre
nature — **« ai-je tout ? »**. Le comptoir compare deux objets ; le dépôt compare
une liste à un véhicule. Deux algorithmes, deux écrans, et deux façons
d'échouer : au comptoir on tend le mauvais sac, au dépôt on en **oublie** un.

```mermaid
flowchart TB
    subgraph C[Comptoir — une PAIRE]
      A[Code client] -->|désigne| B[La commande]
      B --> D{le QR du sac<br/>désigne-t-il la même ?}
    end
    subgraph D2[Dépôt — un ENSEMBLE]
      E[Ce qui part aujourd'hui<br/>N commandes] --> F[Scan feuille 1..N]
      F --> G{la liste est-elle<br/>épuisée ?}
      G -->|non| H[🔴 Il manque X<br/>rattrapable ICI, à 10 m]
    end
```

**Ce que ça achète vraiment** : la commande manquante se découvre au dépôt, au
seul moment où elle ne coûte rien. Une heure plus tard elle est à quarante
kilomètres, et la journée du client est perdue. C'est un argument plus fort que
la traçabilité.

### 🔴 Deux obstacles techniques, tous deux vérifiés

1. **Le lecteur refuse le code de la feuille.**
   [`tokenOf`](../../../apps/lfd-backoffice-frontend/src/app/handover-shop/scan-dialog/qr-reader.ts)
   n'accepte que `/retrait/<jeton>` ou un jeton nu. Le QR d'atelier encode
   `/colisage/{référence}` : il rend `null`, et le dialogue **refuse**. Ce refus
   est délibéré et il est bon (« ce qui n'a pas la forme d'un jeton n'atteint
   jamais le réseau ») — il faut donc un **second lecteur**, `referenceOf`, pas
   un assouplissement du premier.
2. **`BarcodeDetector` n'existe pas partout** — le même fichier le dit. Au
   comptoir on choisit le navigateur du poste ; un coursier avec un iPhone n'a
   pas de scanner, et réconcilier vingt sacs à la saisie manuelle n'est pas le
   geste décrit.

### ⚠️ Et un trou à l'endroit exact de l'argument de vente

**Une commande passée après la clôture n'a pas de `ProductionOrder`, donc pas de
feuille, donc pas de QR.** Le sac qu'on oublie le plus est précisément celui qui
est arrivé en retard — et c'est celui que le scan ne peut pas voir. La
réconciliation doit donc partir de **la liste attendue**, et traiter le sac sans
code comme un cas nommé, pas comme un imprévu.

---

## 5. Trois faits, chacun chez celui qui l'observe

| fait                                     | qui le constate         | où il vit                       |
| ---------------------------------------- | ----------------------- | ------------------------------- |
| **colisé** — le bac est fait             | le fournil              | `production_order.packed_at` ✅ |
| **chargé** — le sac est dans le véhicule | le coursier, au dépôt   | **nulle part** 🔴               |
| **remis** — le destinataire l'a          | le coursier, à la porte | `production.order_handover` ✅  |

⚠️ **« Chargé » n'est pas un statut de la commande.** Le statut commercial dit où
en est la vente ; le chargement dit où est un sac. Les confondre oblige chaque
lecteur de statut à connaître la logistique.

⚠️ **Ne pas l'accrocher à `ProductionOrder`** — mais pas pour la raison du
premier jet. L'argument « ça fausserait le compte à produire » ne porte pas :
`packed_at` y vit déjà, et le retardataire n'y est pas non plus. La **vraie**
raison est celle que le gate écrit : la clé d'identité de la production est la
**journée**, celle de le retrait est la **commande**. Un sac chargé est indexé par
commande et par véhicule, jamais par plan de fabrication.

---

## 6. À la porte : ce qui manque vraiment

Au comptoir, si personne ne vient, il ne se passe rien. En livraison, le coursier
est **devant une porte** et doit repartir avec une réponse : absent, tiers qui
réceptionne, laissé en lieu convenu, adresse fausse.

🔴 **Un échec n'est pas un retrait et ne doit pas s'écrire dans
`OrderHandover`.** Cette table dit « le sac est parti, voici qui l'atteste » ; y
loger une tentative ratée ferait mentir la seule preuve du système.

⚠️ **Et un échec n'a aujourd'hui aucun chemin de retour.**
[`prisma-handover-queue.reader.ts`](../../../apps/lfd-api/src/b2b/orders/infrastructure/prisma-handover-queue.reader.ts)
filtre sur `requestedDeliveryDate = jour`. Une commande non retrait ne reparaît
donc dans aucune file du lendemain : il faudrait réécrire une date figée à la
passation, qui a déjà alimenté un plan de production. **Le §12 en fait une
question, parce que c'est une décision métier, pas un correctif.**

⚠️ **`signatureRequired` n'est imprimé nulle part** — ni sur le bon client, ni
sur la feuille d'atelier (vérifié le 2026-09-11). Il est convenu, figé, affiché
dans un réglage, et c'est tout. Ce n'est pas « personne ne le lit à le retrait »,
c'est **personne, nulle part**. Soit on l'honore, soit on cesse de le promettre.

⚠️ **Le hors-ligne.** Toute l'attestation est un `POST` synchrone. C'est la
différence d'exploitation la plus nette entre un comptoir et une camionnette, et
le premier jet n'en disait rien.

---

## 7. La tranche de livraison — ✅ obligatoire, par heure

**Tranché le 2026-09-11**, dans la foulée du retrait : une commande livrée porte
une tranche **d'une heure**, demandée à la passation.
[`pickupSlots`](../../../packages/contracts/src/pickup.ts) montre la découpe à
copier — une heure pleine, la dernière tronquée, et une fenêtre sans borne basse
qui ne se découpe pas.

Ce que ça débloque : la tranche est **demandée**, donc `override`, donc `isLate`
parle. 🔴 Sans cette décision, elle serait venue du carnet, donc `default`, et la
règle se serait tue sur **toutes** les lignes — une colonne « en retard »
définitivement vide.

⚠️ Elle doit tenir dans les créneaux de **réception** du carnet
([`address.ts`](../../../packages/contracts/src/address.ts)), comme une tranche de
retrait tient dans une fenêtre d'ouverture. Le mode `perDay` n'est aujourd'hui
branché nulle part — le lecteur de réglages ne reprend que `everyday` et le dit
([`prisma-delivery-defaults.reader.ts`](../../../apps/lfd-api/src/b2b/orders/infrastructure/prisma-delivery-defaults.reader.ts)).

### 🔴 La promesse précède le plan

Le client choisit son heure **la veille** ; la tournée est composée **le matin**.
L'engagement est pris avant que quiconque sache quel véhicule passe où.

Ce n'est pas un défaut à corriger, c'est le métier — mais **les tranches
demandées sont une contrainte d'ENTRÉE de la composition, pas une donnée qu'on
découvre à 11 h.** L'écran du répartiteur doit les montrer pendant qu'il compose,
et dire quand un véhicule ne peut pas les tenir : deux 8 h – 9 h à vingt
kilomètres l'un de l'autre sont une promesse que personne ne tiendra.

⚠️ **Deux retards, pas un** : celui du **sac** (la tranche du client) et celui du
**véhicule** (la tournée dérive, vingt commandes basculent d'un coup sans
qu'aucune n'ait bougé). Une seule alarme ferait chercher vingt causes là où il y
en a une.

---

## 8. Ce qui se mutualise — et ce qui en a l'air

**Vraiment mutualisable :**

- le **jeton** et `POST admin/handover/:token` — un seul chemin d'attestation,
  déjà vrai pour les deux acheminements ;
- `OrderHandoverView`, la vue **sans aucun montant**, obtenue au prix d'un
  chantier entier. Un coursier ne doit pas plus voir un prix négocié qu'un
  opérateur de comptoir ;
- `stillRemittable` et `isLate` — deux fonctions pures de
  [`handover-queue.ts`](../../../apps/lfd-backoffice-frontend/src/app/handover-shop/handover-queue.ts).

⚠️ **Correction du premier jet** : il rangeait `handover-queue.ts` en bloc du
côté non-mutualisable **tout en citant `stillRemittable` comme réutilisable** —
or il y vit. C'est le **fichier** qui n'est pas mutualisable en bloc, pas ses
règles une par une.

**Faussement mutualisable :**

- `pickupTabs` — un onglet par point de retrait. Une tournée n'est pas un point :
  un point est fixe et partagé, une tournée est composée le matin ;
- `atTheCounter` — écarte précisément ce dont parle ce document ;
- `queueCounters` — « combien attendent au comptoir » n'a pas d'équivalent :
  personne n'attend devant une camionnette ;
- `HandoverSubjectReader` — il porte `pickupLabel` et **ni adresse livrée, ni
  contact, ni fenêtre**
  ([`handover-subject.reader.ts`](../../../apps/lfd-api/src/handover/channels/commerce/handover-subject.reader.ts)).
  Un coursier qui l'utiliserait tel quel **ne saurait pas où aller**.

🔴 **Ne PAS dupliquer le lecteur de file serveur.** `get-handover-queue` est le
seul endroit où le commerce et le retrait se rencontrent ; en écrire un second
rouvrirait les deux vérités que le chantier vient de fermer. La livraison
**étend** ce port, elle n'en crée pas un jumeau.

> ⚠️ **Tenu autrement le 2026-09-29** (lot 1 de
> [`plan-preparation-de-tournee.md`](../tournees/plan-preparation-de-tournee.md)) : la
> feuille de route a son propre port, `DeliveryRunSheetReader`, pour que le
> comptoir ne paie pas adresses et procédures. Ce qui fondait l'interdiction
> est gardé : le filtre « attendu ce jour » (`expectedOnWhere`) et l'état
> (`queueStateOf`) sont **partagés**, écrits une seule fois.

---

## 9. Où ça vit — 🔴 corrigé

Le premier jet créait un contexte `delivery/` pour le retrait en livraison.
**C'était faux**, et le gate le dit depuis le 2026-09-10
([`context-boundaries.mjs`](../../../dev-toolbox/gates/context-boundaries.mjs)) : le
bloc `handover` est « **LE TRANSFERT DE GARDE, au comptoir comme sur le pas d'une
porte** ». Créer un second contexte sur ce périmètre, c'est réfuter une
déclaration datée sans le dire.

**Le partage juste :**

- **la REMISE reste dans `handover/`**, quel que soit l'acheminement. C'est déjà
  sa définition ;
- **ce qui est neuf est la LOGISTIQUE** — composer une tournée, charger un
  véhicule, consigner une tentative ratée. Ça, `handover/` ne le couvre pas.

**Trois choses à faire, que le premier jet ignorait :**

1. `BLOCK_OF` du gate — « un dossier absent de cette table fait **échouer** le
   gate ». Un `src/delivery/` non déclaré rend `lint:context-boundaries` rouge au
   premier commit.
2. **La flèche n'est pas celle qu'on croit.** Si `delivery` publie un port que le
   commerce implémente, l'import réel est **`b2b → delivery`** — c'est cette
   arête qu'il faut autoriser, avec sa surface
   `delivery/channels/commerce/`. `delivery → b2b` reste interdit, comme
   `production → b2b`.
3. **`delivery → handover`** doit être autorisé ou remplacé par un port. Le
   premier jet laissait la question ouverte _tout en_ réutilisant
   `HandoverSubjectReader` : les deux ensemble laissaient `delivery` sans aucune
   source de données.

⚠️ Le schéma Postgres doit être choisi explicitement : deux portes le surveillent
(`lint:prisma-model-ownership`, `lint:prisma-schema-layout`), et `order_handover`
vit déjà dans le schéma `production` alors que son code est dans `src/handover/`.

---

## 10. 🔴 Les droits : il n'existe pas de coursier

Le retrait est gardée par `@AdminSurface("b2b_orders")`, et les cinq rôles staff
ne comprennent aucun livreur. **Donner le scan à un coursier aujourd'hui revient
à lui donner `commercial`** — prise de commande, tarification négociée, carnet
clients.

> ⚠️ [2026-10-07] **Faux aujourd'hui, et dangereux à suivre.** Le scan du
> comptoir est sous `handover_counter` depuis le 2026-10-01 (`8b424bb2f`), et
> le livreur a ses propres droits : `delivery_driving` (sa tournée) et
> `delivery_doorstep` (les gestes à la porte), portés par un rôle « Livreur »
> créé à l'écran ([`plan-droits-par-geste.md`](../droits/plan-droits-par-geste.md),
> DG-D6). Un livreur ne reçoit ni `commercial` ni `b2b_orders` (L6-C10 de
> [`plan-preparation-de-tournee.md`](../tournees/plan-preparation-de-tournee.md) :
> « jamais `b2b_orders` »).

C'est un déplacement de **frontière de sécurité**, donc le chantier reste sous
`vitruve` d'office (`CLAUDE.md` §9 bis). Et c'est une décision à prendre avant
l'écran, pas après : un rôle ajouté plus tard laisse derrière lui tous les
comptes créés entre-temps.

---

## 11. Ce qu'il ne faut PAS faire

- **Imprimer le jeton sur le colis.** Le schéma l'a écrit avant nous : un
  coursier scannerait son propre carton, et la preuve ne prouverait plus rien.
- **Assouplir `tokenOf`** pour qu'il avale `/colisage/`. Son refus est le point
  de la fonction ; il faut un second lecteur.
- **Écrire le chargement dans les tables du commerce.** Le fournil a mis deux
  déménagements à en sortir.
- **Faire du chargement un `OrderStatus` de plus.**
- **Copier l'écran de la file** en remplaçant les onglets de point par des
  onglets de tournée. Deux écrans qui se ressemblent valent mieux qu'un écran qui
  sait qu'il est deux choses.
- **Bâtir la tournée avant d'avoir deux véhicules** (§3).

---

## 12. Ce qui reste à trancher

Par ordre de ce que ça bloque.

1. 🔴 **Comment le code atteint-il la porte ?** — §2, trois sorties. Rien ne se
   dessine tant que ce n'est pas tranché.
2. 🔴 **Un rôle coursier existe-t-il ?** — §10. Frontière de sécurité.
3. 🔴 **Combien de véhicules ?** — décide si la tournée est à bâtir maintenant
   (§3) ou si la journée suffit.
4. **Que devient une livraison ratée ?** Elle ne peut revenir dans aucune file
   sans réécrire une date figée qui a déjà alimenté un plan (§6).
5. **Qu'est-ce qu'une signature, ici ?** Juridique avant d'être technique (§6).
6. **Qui voit les tranches demandées au moment de composer ?** Sans elles, la
   promesse de la veille est perdue à l'instant du plan (§7).
7. **Que fait-on hors-ligne, au pas de la porte ?** (§6)
8. **Le double scan vaut-il ici ?** La paire existe — le sac porte sa feuille, le
   destinataire son code — mais scanner deux fois sous la pluie, une main prise,
   est une décision d'exploitation.

---

## 13. Ce que ce document n'a PAS vérifié

Écrit pour que le lecteur suivant sache jusqu'où on a regardé.

- **Le volume réel** — combien de livraisons par jour, combien de véhicules.
  Toute la question 3 en dépend, et rien dans le code ne le dit.
- **L'état de `BarcodeDetector` sur iOS aujourd'hui.** L'affirmation vient d'un
  JSDoc non daté ; si Safari le supporte désormais, la seconde moitié de
  l'obstacle du §4 tombe — pas la première.
- **Ce qu'un schéma Postgres `delivery` ferait à `lint:cross-schema-join`.**
- **Le journal d'activité** : rien n'a été regardé sur ce qu'il faudrait y
  inscrire pour « chargé » et « échec », deux faits dont l'unique usage est de
  répondre à une contestation.
- **Le coût de sortie.** Un bloc de premier niveau, ses lignes de gate, son
  schéma et ses migrations ne se défont pas après un merge — et `merger dans
main déploie`. Le nombre de fichiers n'est pas estimé ici.
