# Annuler une commande — par le client

> **État au 2026-10-13 : bâti, commité sur `dev` le 2026-10-13**
> (`bf6b7d019`, API, `@lfd/contracts`, boutique et back-office ; migration
> `20261013100000_l_annulation_par_le_client`), en cours de déploiement.
>
> Le client passe par **le même noyau** que le staff — critère, fermeture de
> l'intention Stripe, refusion du bon, ligne d'encaissement fermée,
> remboursement : tout cela est décrit **une fois**, dans
> [`annulation-par-le-staff.md`](annulation-par-le-staff.md), et l'ordre des
> verrous dans [`verrous-de-l-annulation.md`](verrous-de-l-annulation.md). Ce
> document ne décrit que ce que le client **ajoute** : qui, quand, par où, et
> ce qu'il lit.
>
> Ce document remplace le lot C6 du plan d'annulation (supprimé le
> 2026-10-13). Les numéros de section (C6.4…) sont ceux du plan :
> le code les cite.

## Les décisions de Hugo (2026-10-13)

1. **« Mêmes règles »** que l'annulation staff : le client entre par le même
   noyau, avec moins de droits, jamais plus.
2. **Pro** : « si la commande est partie en production on ne peut plus
   l'annuler » — aucun délai de plus. Qui : « ceux qui peuvent commander » au
   nom de la société.
3. **Particulier (connecté ou invité)** : « j'ai besoin qu'on ait ce réglage
   en Réglages › Commandes » — un interrupteur, et un délai avant le retrait
   ou la livraison.
4. **Invité** : « le lien annulation doit être dans son mail de
   confirmation », corrigé le même jour : le lien ne cesse pas de marcher, il
   ouvre toujours la page de la commande et dit pourquoi quand elle n'est plus
   annulable.
5. **Le délai, révisé le même jour** : « fermé, on dit que le compte à
   produire est la limite dans tous les cas ». Il n'y a plus de réglage
   « fermé » : le réglage **impose un délai** aux particuliers, **actif par
   défaut** (24 h) ; le désactiver est le geste, et un particulier annule alors
   jusqu'à l'arrêt du plan de production, comme un pro. Bâti le 2026-10-13
   (migration `20261013400000_le_delai_d_annulation_actif`).
6. **Le lien du courriel d'un compte** mène à **sa** commande dans « Mes
   commandes » (`/mes-commandes/<id>`, tiroir ouvert, connexion demandée), et
   plus à la liste. Bâti le 2026-10-13.

## Le parcours

> - **Le courriel de confirmation porte le lien « Gérer ou annuler ma commande »
>   dans TOUS les parcours** (Hugo, 2026-10-13 : « tous les parcours doivent
>   avoir le lien d'annulation dans le mail ») : pro, particulier connecté,
>   invité, commande saisie par l'équipe ; au compte, total nul ou carte payée.
>   Un compte arrive sur SA commande dans Mes commandes (connexion demandée) ;
>   l'invité sur la page /annuler. Éprouvé par
>   `apps/lfd-api/src/b2b/orders/application/handlers/__tests__/order-placed-mail-manage-link.spec.ts`.
>
> ⚠️ **Décidé par Hugo le 2026-10-13, PAS ENCORE BÂTI** :
>
> - Les particuliers annulent jusqu'à l'**étape choisie** dans Réglages › Commandes
>   (« Jusqu'où un particulier peut-il annuler ? » : arrêt du plan de production
>   par défaut, commande prête, ou retrait) — un particulier n'a ni bac ni
>   tournée, il retire au comptoir. Lot C7, plan de
>   l'annulation après production, en cours d'écriture.
> - Les pros annulent jusqu'à l'arrêt du plan de production, sans réglage.
>
> Le code bâti arrête aujourd'hui tous les clients à l'arrêt du plan de
> production ; le choix d'étape (C7) est en conception.

```mermaid
flowchart TD
    MAIL(["Courriel de confirmation<br/>lien « Gérer ou annuler ma commande »"]) --> Q{"Le client a-t-il un compte ?"}
    Q -- "oui : pro, ou particulier connecté" --> L["Mes commandes › la commande<br/>connexion demandée"]
    Q -- "non : invité" --> G["Page /annuler<br/>sans connexion, lien secret"]
    L --> A(["Le client clique « Annuler la commande »"])
    G --> A
    A --> W{"Est-il autorisé ?<br/>membre accepté de la société,<br/>auteur, ou lien valide"}
    W -- non --> R0["Commande introuvable"]:::refus
    W -- oui --> K{"Commande personnelle ?"}
    K -- "non, pro" --> P{"Le plan de production<br/>est-il arrêté ?"}
    K -- "oui, particulier" --> S{"Délai imposé ?<br/>réglage actif par défaut"}
    S -- oui --> T{"Plus de N heures<br/>avant le retrait ?"}
    S -- "non, désactivé" --> E
    T -- non --> R2["Refus : trop tard"]:::refus
    T -- oui --> E{"La commande a-t-elle passé l'étape<br/>choisie dans les réglages ?<br/>arrêt du plan, par défaut · prête · retirée"}
    P -- oui --> R3["Refus : déjà en production"]:::refus
    P -- non --> N
    E -- non --> N
    E -- oui --> R4["Refus : déjà en production,<br/>déjà prête, ou déjà retirée"]:::refus
    N[["Le noyau du staff<br/>argent, bon ; ce qui est fabriqué reste fabriqué"]] --> M(["Courriel « vous avez annulé »,<br/>cloche à l'équipe"])

    classDef refus fill:#fde8e8,stroke:#c0392b,color:#7b1d1d
```

| Client          | Qui peut annuler                                             | Quand                                                                          | Par où                                                   |
| --------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------ | -------------------------------------------------------- |
| **Pro**         | tout membre **accepté** de **cette** société, société active | tant que le fournil ne l'a pas mise au compte à produire                       | sa session, « Mes commandes »                            |
| **Particulier** | l'auteur                                                     | jusqu'à N h avant si le délai est imposé (défaut), et pas au compte à produire | sa session, « Mes commandes »                            |
| **Invité**      | le porteur du lien                                           | comme le particulier                                                           | le lien de son courriel de confirmation, page `/annuler` |

## C6.2 Qui peut annuler — le mur

`CancellationWall` (`b2b/orders/application/services/cancellation-wall.ts`) :

- **commande personnelle** : son auteur (`placedByUserId`), et lui seul ;
- **commande de société** (saisie par l'équipe comprise) : un rattachement
  **accepté** sur la société **de la commande**, société `active`, tout rôle
  (`billing` compris). Pas `roleOf` tel quel : il admet une invitation vivante
  non acceptée. Aucune hérédité vers les sites ; l'espace actif n'entre pas
  en compte, aucun id de société n'est reçu.

Le mur est **plus strict que la passation**, et c'est voulu : la passation
fait régler par carte une société non active, l'annulation la refuse. Hors
mur : **404** « Commande introuvable », jamais 403.

## C6.3 Le critère client : celui du staff, plus un délai

Pour une commande **personnelle** seulement, et seulement si le réglage
impose un délai (`open_to_b2c = true`, le défaut), un refus **devant** la
règle du staff, lu à `customer_cancellation_settings` :

| #   | Refus                                                                                                | Code client |
| --- | ---------------------------------------------------------------------------------------------------- | ----------- |
| P2  | il reste moins de N heures avant l'**ancre** — ou l'instant figé à la passation est passé (C6.3 bis) | `too_late`  |

Le refus P1 (« réglage fermé », code `closed`) a existé du déploiement de C6
au correctif du 2026-10-13 (décision 5) ; il est retiré du code, du contrat et
des textes. Sans délai, seul l'arrêt du plan de production limite.

**L'ancre** (`customer-cancellation-window.ts`) : le jour de service à l'heure
de début de la fenêtre figée, heure de Paris ; sans heure de début, **minuit**
du jour — la borne la plus tôt. P2 se compare au `now` **gelé** de la requête :
une attente de verrou ne repousse pas l'échéance. Un pro n'a pas de délai :
seul le fournil ferme la porte.

## C6.3 bis Le délai figé à la passation

> Décision de Hugo du 2026-10-26, bâtie en deux temps le même jour :
> l'instant (`20261026170000_le_delai_d_annulation_fige`), puis le délai
> lui-même (`20261026180000_le_delai_d_annulation_fige_lui_meme`, non commité
> à l'écriture de cette section).

**Pourquoi.** Les CGV particuliers (article 12 « Annulation », publiées le 2026-10-26 — [`textes-legaux-en-vigueur.md`](../../legal/textes-legaux-en-vigueur.md))
promettent l'annulation sans frais jusqu'au « délai indiqué sur le Site »,
rappelé avant la validation de la commande — sans chiffre écrit, pour que le
réglage reste réglable ([`textes-legaux-en-vigueur.md`](../../legal/textes-legaux-en-vigueur.md) §5).
Le délai promis est donc celui du **moment de la commande**. Relire le réglage
au moment où le client annule retirerait ou donnerait après coup un droit que
son contrat fixe.

**Ce qui est figé, et quand.** À la passation d'un **particulier** — connecté
(`PlaceOrderHandler`) ou invité (`PlaceShopOrderHandler`) —, avant l'écriture,
`CustomerCancellationDeadline` lit le réglage du moment et appelle
`Order.fixCustomerCancellationDeadline`. L'agrégat fige le **délai lui-même**,
« sans délai » compris, et en déduit l'**instant limite** par
`customerCancellationDeadlineOf` — la fonction même que P2 applique : l'ancre
(début du créneau, sinon minuit du jour, heure de Paris) moins N heures. La
règle n'est écrite qu'une fois. Le domaine le dit en un type,
`FixedCustomerCancellation` (`customer-cancellation-window.ts`) :
`not_fixed` | `no_delay` | `delay(hoursBefore)`.

### Les colonnes

| Colonne (`public.orders`)            | Type                             | Sens                                                                                 |
| ------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------ |
| `customer_cancellation_fixed`        | `BOOLEAN NOT NULL DEFAULT false` | `true` : le délai a été figé à la passation d'un particulier, avec ou sans délai     |
| `customer_cancellation_hours_before` | `INTEGER`, nullable              | le délai figé en heures ; NULL quand il n'y a pas de délai figé                      |
| `customer_cancellable_until`         | `TIMESTAMPTZ(3)`, nullable       | l'instant limite déduit du délai figé ; NULL sans délai figé ou sans date de service |

Le booléen existe pour une seule raison : distinguer « passée **sans délai** »
(figée, heures NULL) de « passée **avant les colonnes** » (non figée), que
l'instant seul confondait. Les trois sont écrits par la passation et par la
révision (`PrismaOrderRepository`, `PrismaOrderRevisionRepository`), lus par
`apps/lfd-api/src/b2b/orders/infrastructure/customer-cancellation.columns.ts` et nulle part ailleurs.

### Les quatre cas

| Cas                                  | Colonnes                                | À l'annulation par le client                                                                  |
| ------------------------------------ | --------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Non figée** (d'avant les colonnes) | `fixed = false`, heures et instant NULL | le calcul d'avant : réglage du jour, interrupteur et délai                                    |
| **Figée avec délai**                 | `fixed = true`, heures N, instant posé  | l'instant figé juge (P2) ; le réglage n'est pas lu                                            |
| **Figée sans délai**                 | `fixed = true`, heures et instant NULL  | aucune limite par délai, seul l'arrêt du plan, comme un pro — même si le délai a été réactivé |
| **Pro, et saisie de l'équipe**       | `fixed = false`, heures et instant NULL | inchangé : un pro annule jusqu'à l'arrêt du plan (décision 2) ; la saisie porte une société   |

Un cinquième état n'existe qu'en transition : une commande passée entre les
deux migrations porte l'instant **sans** le délai (`fixed = false`, heures
NULL, instant posé). Son délai se relit sur l'écart entre l'ancre et l'instant,
à l'heure près (`effectiveFixedCancellation`), et elle se juge comme une
figée avec délai. Une commande sans date de service figée avec délai n'a pas
d'instant : elle est `too_late`, comme avant.

### La révision recalcule avec le délai d'origine

Quand l'équipe ou le client change le jour ou le créneau
(`Order.recompose`, appelé par `Order.revise` et par le devis), la nouvelle
composition **reprend le délai figé** de la commande et recalcule l'instant
sur la nouvelle ancre. Le réglage du jour n'est pas lu. Figée sans délai, elle
le reste ; non figée, elle le reste. `PrismaOrderRevisionRepository.save`
écrit les trois colonnes avec le reste de la révision.

⚠️ M1 ne révise que les commandes au compte ou à total nul : la commande d'un
particulier, réglée par carte, n'est révisable que gratuite tant que M2
n'existe pas. La règle est tenue dans l'agrégat pour le jour où elle le sera.

### À l'annulation, et à la boutique

`CustomerCancellationPolicyGate` lit le délai figé : `no_delay` rend `null`
(aucun délai), `delay` juge sur l'instant figé et rapporte les heures figées
au fait `order.cancelled` (`policy.hoursBefore`), `not_fixed` lit le réglage
du jour. L'annulation staff est inchangée.

La boutique reçoit l'instant dans `cancellability.until` (`GET /orders/:id`,
contrat `OrderCancellability`) et l'écrit « Annulable jusqu'au jeudi
31 octobre, 9 h » — heure de Paris, jour mis en forme par la langue, heure par
le dictionnaire (`hourOnly`, `hourMinutes`). Figée sans délai, aucun instant :
la boutique dit seulement que la commande est annulable, jusqu'à l'arrêt du
plan.

```mermaid
sequenceDiagram
    participant C as Client
    participant P as Passation
    participant R as Réglage
    participant O as Order
    participant V as Révision
    participant A as Annulation
    C->>P: commande d'un particulier
    P->>R: réglage du moment
    R-->>P: interrupteur et délai
    P->>O: fixCustomerCancellationDeadline
    O-->>P: délai figé (ou sans délai) et instant
    Note over P: écrit fixed, hours_before, cancellable_until
    V->>O: recompose (nouveau jour ou créneau)
    O-->>V: même délai figé, instant recalculé
    Note over V: le réglage du jour n'est pas lu
    C->>A: annuler
    A->>A: figée avec délai, l'instant juge
    A->>A: figée sans délai, seul l'arrêt du plan
    A->>R: non figée, réglage du jour
```

## C6.4 L'invité : un lien d'annulation

- **Jeton déterministe, rien de stocké** : `base64url(HMAC-SHA256(orderId,
clé))`, la clé **dérivée** de `FIELD_ENCRYPTION_KEY` par HKDF sous
  l'étiquette `lfd/order-cancellation-link/v1` (`AppConfig.cancellationLinkKey`).
  Un courriel renvoyé porte le même lien. 🔴 **Une rotation de
  `FIELD_ENCRYPTION_KEY` tue tous les liens envoyés**
  ([`secrets-et-variables.md`](../../ops/secrets-et-variables.md)).
- **Dans l'accusé de réception**, pour toute commande d'invité, par les deux
  chemins d'envoi (`SendOrderPlacedMail` sans rien à encaisser,
  `OrderPlacedMail` sur `order.paid`). Les comptes (particuliers connectés,
  pros, commandes saisies par l'équipe) reçoivent à la place un lien **sans
  secret** vers **leur** commande, `/mes-commandes/<id>` : route gardée
  (connexion demandée, `returnTo` y ramène), tiroir de la commande ouvert
  d'office (`order-manage-link.ts`, `history-table.ts`). Un jeton
  contournerait le mur.
- **Le jeton voyage en fragment** : `/annuler#<orderId>.<jeton>`. Le
  navigateur ne l'envoie jamais ; la page le met dans le **corps** de deux
  `POST` publics, `shop/orders/cancellation/view` (20/min/IP) et
  `shop/orders/cancellation/confirm` (5/min/IP, `204`), tous deux
  `Cache-Control: no-store`, `Referrer-Policy: no-referrer`
  (`guest-order-cancellation.controller.ts`).
- **Vérification** en temps constant. Jeton faux, commande inconnue, commande
  d'une société, ou au-delà de **90 jours** après la date de retrait (ou la
  passation sans date) : la **même** réponse, « Lien introuvable ».
- **Le jeton identifie, il ne décide pas** : la page s'ouvre toujours et dit
  l'état réel (délai passé, déjà en préparation, déjà
  annulée, déjà retirée) avec « Contactez la boutique » ; le `confirm` relit
  tout sous les verrous. **Jamais d'annulation sur un `GET`** : les messageries
  suivent les liens toutes seules.
- **La fiche a un compte** (`auth0Sub`) : « Connectez-vous pour gérer cette
  commande » ; fiche désactivée : « Contactez la boutique ».
- **La page montre le nécessaire** : numéro, date, mode (point de retrait, ou
  la seule ville), articles, montant, état, ce qui arrivera à l'argent et au
  bon, le prénom. Jamais nom de famille, adresse, téléphone, courriel, QR.
- Les commandes d'invité passées avant C6 n'ont pas de lien : le staff les
  annule.

## C6.5 Le réglage — « Réglages › Commandes »

Un CRUD honnête dans `b2b/order-opening/` (aucune règle ne refuse son
écriture), table `public.customer_cancellation_settings`, une ligne `orders` :
`open_to_b2c` — dans le code `delayEnabled` : **un délai est imposé aux
particuliers** (défaut **actif** ; la colonne garde son nom d'origine, une
colonne ne se renomme pas sans migration), `hours_before` (défaut **24**,
entre 0 et 168), auteur figé. L'écran dit « Imposer un délai aux
particuliers » ; décoché : « Sans délai, les particuliers annulent jusqu'à
l'arrêt du plan de production, comme les pros ». Routes `GET` / `PATCH /admin/customer-cancellation`, sous
`lfc_order_settings` depuis le 2026-10-13 (avec l'heure limite,
`../passation/plan-reglages-commandes.md`). Écran du back-office
`/reglages/commandes/annulation` (`reglages/commandes/customer-cancellation-page/`) ;
l'ancienne `/b2b/reglages/commandes` y redirige. La
valeur n'est pas datée : le délai est figé sur chaque commande à sa passation
(C6.3 bis), et le journal de l'annulation fige ce qui a été appliqué. Les colonnes d'auteur sont
au registre RGPD.

## C6.6 La route, la commande, l'auteur

- **Connecté** : `POST /orders/:id/cancel`, corps `{ reasonCode?, reasonText? }`,
  `204` → `CancelOrderByCustomerCommand`. **Invité** : C6.4 →
  `CancelGuestOrderCommand`. Les deux passent par `CustomerOrderCancellation`
  (mur, P2, traduction des refus), qui appelle le noyau
  `OrderCancellation` avec l'acteur `customer` ou `guest`.
- **En base** : `cancelled_by` reste **nul** (c'est la fiche staff) ;
  `cancelled_by_kind` = `customer` | `guest` ; `cancelled_by_user_id` = le
  client (donnée client, pas staff) ; un `CHECK` à sens unique tient la paire.
  `order_refund_request.requested_by` reste nul.
- **Le motif est facultatif** : liste close `cancellation_reason_code`
  (`no_longer_needed`, `wrong_date`, `wrong_products`, `other`, valeurs
  irréversibles) et texte libre (`CustomerCancellationReason`).
- **Le fait `order.cancelled`** porte `cancelledByKind` et
  `cancelledByUserId` ; un fait d'avant C6, sans eux, se relit comme `staff`.
  Le journal cite « le client » ou le membre de la société au lieu d'un staff.

## C6.7 Les refus, pour un client

Le noyau lève les erreurs du staff ; `CustomerOrderCancellation` les traduit
en code `orders.customer_cancel.<refus>` et en phrase écrite pour un client
(`customer-cancellation-refusal.ts`) :

| Refus client                              | Vient de                                        |
| ----------------------------------------- | ----------------------------------------------- |
| `already_cancelled`, `ready`, `fulfilled` | statut                                          |
| `in_preparation`                          | inscrite au fournil (« déjà en préparation »)   |
| `too_late`                                | P2                                              |
| `payment_in_progress`                     | paiement en traitement, remboursement en vol    |
| `paid_just_now`                           | `already_paid` de Stripe                        |
| `not_recorded`                            | Stripe injoignable, transaction non écrite      |
| `invoiced`                                | tout refus du compte (facturée, en lot, rejet…) |
| `voucher_reused`                          | reliquat du bon engagé ou annulé                |
| `account_required`, `account_disabled`    | lien d'une fiche qui a un compte, ou désactivée |

Aucune phrase client ne cite le motif staff, une autre commande par son
numéro, ni le fournil comme acteur.

## C6.8 Les écrans de la boutique

`apps/lfc-ecommerce-frontend/src/app/client/order-cancellation/` :

- `GET /orders/:id` porte `cancellability` (le noyau **et** P2, sans
  verrou), lue par `order-cancel-section/` dans le détail « Mes commandes » :
  bouton « Annuler la commande » si annulable ; pour un refus durable
  (fournil, prête), il disparaît ; pour « trop tard », une ligne dit jusqu'à
  quand c'était possible ;
- `cancel-order-dialog/` : ce qui arrive à l'argent et au bon, motif
  facultatif, « Annuler ma commande » / « Garder ma commande » ; relecture
  après succès ;
- `guest-cancel-page/` : la page publique `/annuler`, hors shell client, même
  formulaire (`cancel-order-form/`).

Libellés fr/en/it dans `copy/screens/order-cancel.copy.ts`, recueil régénéré
par `pnpm copy:digest`.

## C6.9 Le courriel et la cloche

- **Le même** `customer.order-cancelled` que le staff (mêmes phrases d'argent
  et de bon, [`annulation-par-le-staff.md`](annulation-par-le-staff.md)) ;
  seule l'ouverture change : « Vous avez annulé votre commande… » ou
  « {name} a annulé la commande {ref} de {company}… ». Le motif n'y figure pas.
- **Cloche à l'équipe** `order.cancelled_by_customer`, abonné durable
  `orders.ring-customer-cancellation`, une clé par commande, lien
  `/commandes/:id` — sans elle, l'équipe découvrirait l'annulation à la
  clôture. Silencieuse pour une annulation staff.

## C6.10 Les tests

E2E `order-customer-cancel.e2e-spec.ts` (mur, réglage, délai, argent, acteur
au journal), `order-guest-cancel.e2e-spec.ts` (jeton, fragment, 90 jours,
fiche avec compte, données absentes de la réponse, débits) ; unitaires du
handler, de la fenêtre, du motif, de la cloche ; specs des composants de la
boutique. Les suites `order-staff-cancel*` passent inchangées après
l'extraction du noyau.

## Reste ouvert (au 2026-10-13)

**Choix métier — tranchés par Hugo le 2026-10-13** (« 1 côté client, motif
facultatif, 2 oui 3 oui […] 5 oui 7 oui 6 oui 8 oui », puis « garde minuit »).
Ce qui est bâti est ce qu'il a choisi :

| #      | Question                                         | Défaut appliqué                          |
| ------ | ------------------------------------------------ | ---------------------------------------- |
| Q-C6.1 | motif obligatoire ?                              | facultatif, liste + texte                |
| Q-C6.2 | le rôle `billing` peut-il annuler ?              | oui, comme il peut commander             |
| Q-C6.3 | un membre annule la commande d'un autre membre ? | oui ; le courriel dit qui a annulé       |
| Q-C6.4 | ancre sans heure de début                        | minuit du jour                           |
| Q-C6.5 | nom de l'entrée                                  | « Commandes », `/b2b/reglages/commandes` |
| Q-C6.6 | réglage au déploiement                           | délai actif, 24 h (révisé le 2026-10-13) |
| Q-C6.8 | cloche à chaque annulation client                | oui                                      |
| Q-C6.9 | borne du lien d'invité                           | 90 jours                                 |

**Après l'arrêt du plan de production** : plan C7, [`plan-annulation-apres-production.md`](plan-annulation-apres-production.md) (doc-first).

**Hors périmètre** : annulation partielle (c'est l'avenant) ; délai pour les
pros ; rattrapage des liens des commandes d'invité d'avant C6.

## Historique

- **2026-09-17** — le premier plan prévoyait déjà une route client ; `vitruve`
  objectait que tout membre d'une société pourrait annuler la commande d'un
  collègue (S2) et qu'un invité n'avait aucun moyen d'annuler (S6). Reporté au
  lot client.
- **2026-10-13** — décisions de Hugo (ci-dessus), lot C6 conçu, contredit par
  `vitruve` et bâti le même jour. Sort des objections, toutes tranchées par
  des décisions d'ingénierie : B1 jeton HMAC déterministe, rien de stocké
  (puis clé dérivée de `FIELD_ENCRYPTION_KEY`, sans variable de plus) ; B2
  rattachement accepté seulement et société active ; S3 fiche avec compte
  refusée ; S4 `cancelled_by_kind` et `CHECK` à sens unique ; S5 délai contre
  le `now` gelé, assumé ; S6 contrôleur invité à part, débit propre ; S7
  jeton en fragment, envoyé dans un corps ; S8 relecture d'un fait d'avant C6
  testée. Le plan devient ce document.
- **2026-10-13, le soir** — décisions 5 et 6 bâties : le refus « réglage
  fermé » (`closed`) retiré partout, le réglage devenu un délai imposé, actif
  par défaut (migration `20261013400000_le_delai_d_annulation_actif`, qui ne
  bascule la ligne que si personne ne l'a réglée à l'écran), et le lien du
  courriel d'un compte vers sa commande, tiroir ouvert.
