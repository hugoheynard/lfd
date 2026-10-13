# Plan — la logistique : « Écrire », tri par heure de départ, couleurs des commandes

> **État : 📐 doc-first, écart analysé le 2026-10-13.** Rien n'est bâti. Ce
> document dit ce que le code a déjà, ce qui manque pour chacune des trois
> demandes, et ce que Hugo doit trancher avant tout lot. Chaque affirmation
> sur l'existant a été vérifiée en ouvrant le fichier cité, le 2026-10-13.
>
> Pas de `vitruve` d'office (CLAUDE.md §9 bis) : ni argent, ni migration de
> données, ni frontière de sécurité, ni runbook — **sauf** si Q4 tranche pour
> un réglage stocké en base (ce serait une migration additive, pas une
> migration de données).

## 0. La demande

Une responsable logistique, après une visite du back-office, mot pour mot :

> « Ecrire » : prévoir un formulaire pour obtenir les coordonnées du client et infos nécessaires
>
> - Trier les commandes par heures de départ (attention au traitement du click & Collect val village qui doit être traité comme une livraison B to B)
> - Identification visuelle des commandes avec un code couleur (pas de vert et rose/rouge, gardés pour les surligneurs OK/KO), préconise : bleu, jaune, orange, gris, modifiable.
>   - Livraison B to B : Bleu
>   - Click & Collect B to B : Jaune
>   - Click & Collect B to C Adroit : orange
>   - Click & Collect B to C Val Village : Gris

## 1. Ce qui existe (vérifié le 2026-10-13)

### 1.1 « Écrire » — deux candidats, aucun ne colle tel quel

1. **Le bouton « Écrire » de la carte de contact de la boutique.** Le seul
   libellé « Écrire » du back-office est l'aperçu de cette carte
   (`apps/lfd-backoffice-frontend/src/app/b2b/contact/shop-contact-fallback.ts`).
   Côté boutique, il ouvre le dialogue « Nous écrire »
   (`apps/lfc-ecommerce-frontend/src/app/legacy/contact/contact-panel/contact-panel.html`).
   Ce formulaire **existe** et recueille déjà nom, e-mail, téléphone
   (facultatif), motif et texte : `CustomerRequest` dans
   `apps/lfd-api/prisma/schema/public/contact.prisma`, doc
   [`../contenu-ecommerce/demandes-clients.md`](../contenu-ecommerce/demandes-clients.md)
   (bâti le 2026-10-09). Les motifs se règlent au back-office.
2. **La saisie d'une commande par l'équipe** (comptoir ou téléphone).
   `/comptoir/nouvelle-commande` (`comptoir/nouvelle-commande-pro/nouvelle-commande-pro-page.ts`)
   **ne saisit rien** : elle cherche un compte pro **actif** existant puis
   passe la main à `commandes/nouvelle-commande/` (doc
   [`architecture-commande-saisie-par-l-equipe.md`](architecture-commande-saisie-par-l-equipe.md)).
   Il n'y a **aucun formulaire** pour saisir les coordonnées d'un client qui
   n'a pas de compte (particulier, ou pro pas encore ouvert).

Lecture la plus probable : la responsable logistique parle du **second** — elle
veut pouvoir « écrire » une commande pour un client et en recueillir les
coordonnées (téléphone, adresse, contact sur place) nécessaires au retrait ou à
la livraison. Mais « Nous écrire » est le seul endroit où le mot apparaît à
l'écran : **à confirmer (Q1)**.

### 1.2 Les écrans où la logistique voit « les commandes »

| Écran                                                     | Fichier                                                  | Ce qu'il trie aujourd'hui                                                                                                               |
| --------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `/commandes` (liste)                                      | `commandes/orders-list-page/`, `commandes/orders-table/` | plus récente d'abord ; `AdminOrderRow` porte `fulfillmentMethod`, `clientele`, `fulfillmentDay`, **pas** le point de retrait ni d'heure |
| `/comptoir/retrait`                                       | `handover-shop/handover-queue.ts` (`sortedQueue`)        | par **créneau** (`window.start ?? window.end`), puis heure de commande ; onglets par **point de retrait** (`pickupTabs`)                |
| `/supervision` (colonne 3)                                | `supervision/handover-slots.ts`                          | file de retrait groupée par tranche du créneau convenu                                                                                  |
| `/colisage`, `/tour-manager`, `/coursier`, `/livraison/…` | `app.routes.ts`                                          | tournées et bacs — non relus en détail ici                                                                                              |

Aucun écran ne mélange **livraisons et retraits** dans une même liste triée par
une heure commune. C'est pourtant ce que la demande suppose (« Val Village
traité comme une livraison B2B » n'a de sens que dans une liste qui contient
les deux). **Écran visé : à confirmer (Q2).** Candidats : la liste
`/commandes` filtrée sur un jour, ou la Supervision.

### 1.3 L'heure de « départ »

- **Livraison** : `DeliveryRound.plannedDepartureAt` (prévu par le calcul
  routier, effacé dès qu'un geste à la main change les arrêts) et
  `departedAt` (réel), schéma `delivery`
  (`apps/lfd-api/prisma/schema/delivery.prisma`). La commande y est reliée par
  `DeliveryRoundStop.orderId` (opaque). Le fournil a aussi
  `order_departure.departedAt` (`production.prisma`). **Aucun contrat de liste
  de commandes ne porte ces heures**, et le commerce ne peut les lire que par
  le canal `delivery/channels/commerce/` (matrice CLAUDE.md §3).
- **Retrait** : pas de « départ ». Ce qui en tient lieu est le **créneau
  convenu**, figé sur la commande : `Order.fulfillment.window`
  (`{ start: HH:mm | null, end: HH:mm }`, `OrderFulfillment` dans
  `packages/contracts/src/order.ts`, schéma `fulfillmentWindowSchema` dans
  `packages/contracts/src/address.ts`). Le retrait au comptoir trie déjà
  dessus.
- **Val Village** : c'est un **point de retrait** (`PickupAddress`,
  `public/settings.prisma`), donc une **donnée**, pas une notion du modèle.
  Le nom n'apparaît dans le code que dans un test
  (`handover-shop/handover-queue.spec.ts`, onglet « Val Village »). La
  commande en garde un snapshot (`Order.pickupAddress`, JSON) et les vues
  du retrait exposent `pickupLabel` (`packages/contracts/src/order-handover.ts`).
- **Adroit** : introuvable dans le code ou la doc, hormis un nom de ferme de
  démonstration (`apps/lfd-api/prisma/seed-growth/personas.ts`, « La Ferme de
  l'Adroit ») sans rapport. Probablement un autre point de retrait, saisi en
  production : **à confirmer (Q3)**.

### 1.4 Les quatre catégories se dérivent-elles ?

Oui, presque entièrement, de trois champs figés sur la commande :

| Catégorie demandée         | `fulfillmentMethod` | `clientele` | point de retrait |
| -------------------------- | ------------------- | ----------- | ---------------- |
| Livraison B2B — bleu       | `delivery`          | `pro`       | —                |
| C&C B2B — jaune            | `pickup`            | `pro`       | (tous ?)         |
| C&C B2C Adroit — orange    | `pickup`            | `public`    | « Adroit » ?     |
| C&C B2C Val Village — gris | `pickup`            | `public`    | « Val Village »  |

Trous : livraison **B2C** (`delivery` × `public`) n'a pas de couleur ;
`clientele = NULL` (commandes d'avant la distinction, jamais rattrapées,
`public/orders.prisma`) non plus ; et la clé « point de retrait » n'est qu'un
**libellé** dans les vues (`pickupLabel`) — couleur attachée à un libellé =
cassée au premier renommage.

### 1.5 Le vocabulaire fold disponible (fold-ng 0.28.1, lu dans `node_modules`)

- Badges : variantes `neutral | accent | info | warning | alert | success`.
  `success` (vert) et `alert` (rouge) sont exclus par la demande ; restent
  `info` (bleu/azur), `warning` (ambre = **jaune**), `neutral` (gris),
  `accent`.
- Palette de référence : `amber`, `azure`, `signal` (bleu), `steel`/`slate`
  (gris), `teal`, `purple`, `grape`… **Il n'y a pas d'orange** dans fold :
  `--fold-ref-amber-550/600` est ce qui s'en approche, mais se confond avec le
  jaune `warning`.
- Précédent d'un token local au back-office : `--lfc-stage-*` dans
  `apps/lfd-backoffice-frontend/src/styles.scss` (l. 127–129), bâtis sur des
  `--fold-ref-*`. `lint:fold-tokens` refuse un `var()` inexistant.
- **Modifiable** : aucun réglage de couleur par catégorie n'existe. Le seul
  réglage qui touche le retrait est l'écran des points de retrait
  (`PickupAddress`, sans champ de couleur).

## 2. Ce qui manque, par demande

### 2.1 « Écrire »

- Si c'est la **saisie par l'équipe** : un formulaire « client sans compte »
  (nom, téléphone, e-mail, adresse ou point, contact sur place) en amont de
  `commandes/nouvelle-commande/`, et un serveur qui accepte une commande
  staff **sans société** — la passation zéro friction existe côté boutique
  ([`architecture-commande-sans-compte.md`](architecture-commande-sans-compte.md)),
  pas côté `/admin/orders`. À relire avant de concevoir.
- Si c'est **« Nous écrire »** : rien à bâtir sur le recueil ; préciser quelles
  « infos nécessaires » manquent au formulaire actuel.

### 2.2 Tri par heure de départ

- Un **contrat** : une heure de départ par ligne de liste
  (`plannedDepartureAt ?? departedAt` de la tournée pour une livraison ;
  `window.start ?? window.end` pour un retrait), lue par le canal livraison →
  commerce, jamais par jointure.
- Une **règle** pour Val Village : « traité comme une livraison B2B » veut-il
  dire **trié dans le même flux que les tournées** (par une heure de départ
  vers Val Village), ou seulement **rangé avec** ? Si Val Village est
  approvisionné par une tournée (point de retrait desservi), son heure de
  départ est celle de la tournée qui y va — ce lien n'existe pas : une
  tournée sert des commandes `delivery`, pas un point de retrait.
- Une liste qui contient livraisons **et** retraits du jour (cf. Q2).

### 2.3 Code couleur

- Une **fonction pure** commande → catégorie (`fulfillmentMethod`,
  `clientele`, point de retrait), avec une catégorie « autre » explicite.
- Une **clé stable** du point de retrait dans les vues (`pickupAddressId` à
  côté de `pickupLabel`) — ou, mieux, une **propriété du point** (Q5).
- Quatre tokens `--lfc-order-*` sur des `--fold-ref-*`, dont un **orange à
  choisir** faute d'orange fold.
- Le **réglage** (« modifiable ») : soit des tokens dans le code (modifiable
  par un commit), soit une couleur par catégorie en base (migration additive,
  écran de réglage, droit à créer à l'écran).

## 3. Questions à trancher par Hugo

- **Q1** — « Écrire » : la saisie d'une commande par l'équipe pour un client
  sans compte, ou le formulaire « Nous écrire » ? Quelles infos manquent ?
- **Q2** — Quel écran : `/commandes`, la Supervision, le comptoir, un écran
  logistique neuf ? Et pour quel usage : préparation, chargement, retrait ?
- **Q3** — Qu'est-ce qu'« Adroit » : un point de retrait de production ?
  Les deux points B2C sont-ils les seuls ?
- **Q4** — « Modifiable » par qui, et à quelle fréquence : un commit suffit-il,
  ou faut-il un écran de réglage ?
- **Q5** — La couleur appartient-elle à une **catégorie** (quatre lignes fixes)
  ou à un **point de retrait** (un champ de `PickupAddress`, plus la
  livraison) ? La seconde survit à un cinquième point sans code.
- **Q6** — Couleur de la livraison B2C et des commandes `clientele = NULL` ?
- **Q7** — ✅ **Orientée par Hugo le 2026-10-13** : c'est le **transfert
  interne** évoqué le 2026-10-10 — le stock part du fournil vers le point de
  retrait éloigné comme une livraison, et c'est ce départ qui range les
  commandes de Val Village avec les tournées. Ce chantier n'est pas écrit : il
  attend d'abord la notion de **site** (un lieu à nous qui vend, remet, est
  servi), cf. [`../carte-des-chantiers.md`](../carte-des-chantiers.md) § 3,
  ligne « Le transfert interne vers un point de retrait éloigné ». Le tri du
  L2 en dépend pour Val Village ; la couleur (gris) n'en dépend pas. Le tri du
  colisage par heure de départ a déjà son TODO :
  [`../colisage/todo-colisage-tri-par-echeance.md`](../colisage/todo-colisage-tri-par-echeance.md).
- **Q8** — Les « surligneurs OK/KO » sont-ils des feutres sur papier
  imprimé (alors le code couleur doit aussi passer sur le **bon** ou la
  feuille de route imprimée) ou un état de l'écran ?

## 4. Découpage en lots (à confirmer après Q1–Q8)

| Lot | Contenu                                                                                            | Dépend de      |
| --- | -------------------------------------------------------------------------------------------------- | -------------- |
| L1  | Catégorie logistique : fonction pure + tests, tokens `--lfc-order-*`, pastille dans l'écran choisi | Q2, Q3, Q5, Q6 |
| L2  | Heure de départ dans le contrat de liste (retrait = créneau ; livraison = tournée via canal) + tri | Q2, Q7         |
| L3  | Réglage des couleurs (si Q4 = écran) : stockage, droit, écran                                      | Q4, Q5         |
| L4  | Formulaire « client sans compte » à la saisie staff (si Q1 = saisie)                               | Q1             |
| L5  | Couleur sur les supports imprimés (si Q8 = papier)                                                 | Q8, L1         |

L1 est faisable seul et vite sur le retrait (le comptoir a déjà point et
clientèle) ; L2 est le plus lourd à cause du canal livraison → commerce.
