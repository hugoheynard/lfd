# Plan — bloquer le prélèvement d'un client, et les liens de paiement

> Ouvert le 2026-09-25 à la demande de Hugo : « en admin/comptabilité, une page
> blocage de compte qui permette de bloquer / débloquer un compte client du
> prélèvement automatique mensuel — on le force à payer en carte — et une page
> liens de paiement ». **Rien n'est bâti.** Deux choix tranchés par Hugo le même
> jour : le blocage est un **drapeau séparé** (le crédit accordé est conservé),
> et la page des liens montre **les deux** — les commandes à régler en carte, et
> des liens libres créés hors commande.

## L'existant, ouvert le 2026-09-25

- Le crédit mensuel est `Company.grantedTerms` (`DeferredTerm[]`, seul
  `monthly`). `Company.settlesOnAccount()` = « au moins un crédit accordé ».
- Au passage de commande, **un seul point** décide qu'on peut régler au compte :
  `OrderGuardReader.settlesOnAccount(companyId)`
  (`orders/infrastructure/prisma-order-guard.reader.ts:33`), lu par
  `place-order.handler.ts` (client) et `place-order-for-customer.handler.ts`
  (back-office). Sans crédit, la commande crée une intention Stripe et passe
  `paymentStatus = pending`.
- Le cycle de prélèvement lit `BillableOrdersReader.billableBetween`
  (`accounting/infrastructure/prisma-billable-orders.reader.ts`) : les
  commandes `not_required`, `total > 0`, non annulées, groupées par société.
- Le lien de règlement d'une commande existe : `paymentUrlFor(clientBaseUrl,
orderId)` → `/commandes/:id/regler` côté espace client (connexion requise).
- Le webhook Stripe ne connaît que `payment_intent.succeeded` / `…payment_failed`
  (`stripe-payment-gateway.ts:96`).
- Aucune notion de blocage du prélèvement en base.

## 1. Le blocage du prélèvement

### Le modèle

Trois colonnes nullables, additives, sur `companies` :

| Colonne                     | Sens                                                   |
| --------------------------- | ------------------------------------------------------ |
| `direct_debit_blocked_at`   | `null` = non bloqué. L'instant du blocage (`Clock`).   |
| `direct_debit_blocked_by`   | l'id staff qui a bloqué                                |
| `direct_debit_block_reason` | texte obligatoire (1–500), lu par le personnel suivant |

Une contrainte `CHECK` : les trois sont nulles ensemble ou renseignées ensemble.

L'agrégat `Company` porte deux méthodes :

- `blockDirectDebit(reason, at, by)` — refuse si déjà bloqué (409 qui le nomme)
  et si aucun crédit n'est accordé (« ce client paie déjà en carte »).
- `unblockDirectDebit()` — refuse si non bloqué.

Et **`settlesOnAccount()` devient `grantedTerms.length > 0 && !blocked`**. Le
crédit accordé n'est pas touché : débloquer le rend tel quel.

`grantTerms([])` sur une société bloquée **lève le blocage** (plus rien à
bloquer) — sinon une société sans crédit porterait un blocage fantôme.

### Ce qui change au passage de commande

Le port `OrderGuardReader.settlesOnAccount` (`b2b/orders/...`) rend désormais
`"granted" | "blocked" | "none"`, et non plus un booléen : c'est la seule façon
pour les messages de dire « suspendu ». Les deux refus reçoivent une variante
« prélèvement suspendu, réglez par carte » : `TermsNotGrantedError` côté client
(`place-order.handler.ts:269`) et `AccountSettlementNotGrantedError` côté staff.
Si le client n'a pas choisi de mode, il est déjà basculé sur la carte en silence.
La passation par la boutique (`place-shop-order`, `companyId: null`) n'est pas
concernée, et aucun abonnement ne génère de commande (vérifié le 2026-09-25). La lecture `my-account` (`prisma-account.reader.ts`)
expose `settlesOnAccount` à `false` pour que la boutique ne propose plus
« au compte » — à vérifier : quel champ lit le front client.

### 🔴 Ce que voit le client — exigence de Hugo (2026-09-25)

« Quand un compte est bloqué, ajouter au compte ne marche plus pour le client :
ça doit se refléter dans le front **et** bloquer au niveau serveur. »

- **Serveur** : la garde ci-dessus est la seule autorité. Les deux chemins de
  passation (client ET back-office) refusent `account` ; un e2e le prouve pour
  chacun, commande envoyée à la main avec `settlement: "account"`.
- **Front client** : il lit aujourd'hui `grantedTerms` directement, à six
  endroits (vérifié le 2026-09-25, dont `account/account.model.ts:72`) — `cart-dialog.ts:121` (l'option « au
  compte » du panier), `client-company.service.ts:75` (`hasDeferredTerm`),
  `mon-compte/payment/payment-section.ts:30`, `profil/facturation-section`,
  `activation-checklist`. Le contrat `packages/contracts/src/account.ts` gagne
  un champ **`directDebitBlocked: boolean`** (additif : un front en ligne qui
  ne le lit pas continue de marcher, et le serveur refuse de toute façon), et
  le front en dérive **un seul** calcul `settlesOnAccount = monthly accordé &&
!bloqué`, que les cinq lecteurs utilisent. Le panier ne propose plus « au
  compte » ; « Mon compte » affiche « Prélèvement mensuel suspendu — vos
  commandes se règlent par carte ».
- `grantedTerms` n'est **pas** vidé dans la réponse : le client garde de quoi
  comprendre qu'il a un crédit, suspendu.

### Ce qui change au cycle mensuel — rien

Le blocage ne vaut que pour les commandes **à venir**. Les commandes déjà passées
au compte restent dans le cycle où elles ont été créées : `billableBetween` ne
lit délibérément pas le terme de la société (décision de Hugo du 2026-09-10,
écrite dans `prisma-billable-orders.reader.ts:34`). Les sortir les perdrait pour
de bon, car le cycle découpe par `created_at` et aucune commande exclue ne revient
au cycle suivant (objection de vitruve). Pour ne pas prélever un client, il reste
le geste existant : retirer son mandat du fichier.

### Journal

Deux faits : `company.direct_debit_blocked` (raison, par qui) et
`company.direct_debit_unblocked`, dans le journal de la société comme les
autres changements d'accès.

### API

- `GET  /admin/accounting/direct-debit-blocks` — les sociétés à crédit, avec
  leur état (bloqué ou non, depuis, par qui, pourquoi). Droit
  `b2b_accounting:read`.
- `POST /admin/accounting/direct-debit-blocks/:companyId` `{ reason }` — bloque.
- `DELETE /admin/accounting/direct-debit-blocks/:companyId` — débloque.

Droit : `b2b_accounting` par `@AdminSurface`, dont l'action se déduit du verbe HTTP.
La donnée vit dans `b2b/account/`, parce que la société y vit. Le contrôleur de
`account` déclare la ressource `b2b_accounting`, et `accounting` ne lit pas la
colonne. Le journal s'écrit dans la même unité de travail que la société.

### L'écran — `comptabilite/blocages-prelevement`

Une liste des sociétés au crédit mensuel, filtrable « bloquées / toutes ».
Par ligne : raison sociale, état (badge « Prélèvement bloqué » / « Au
prélèvement »), depuis quand, par qui, raison. Action « Bloquer » ouvre une
modale qui exige la raison ; « Débloquer » demande confirmation.

## 2. Les liens de paiement

### 2a. Les commandes à régler en carte

Une lecture : les commandes `paymentStatus ∈ {pending, failed}`, non annulées,
avec société, montant, date, statut et `paymentUrlFor(...)`. Actions :
**copier le lien**, et **renvoyer le lien par e-mail** à l'acheteur (commande
`ResendOrderPaymentLink`, avec un **nouveau** gabarit `@lfd/mailer` : aucun
e-mail existant ne porte le lien, vérifié). Quand `CLIENT_BASE_URL` manque, la
ligne n'affiche pas de lien et le renvoi est refusé en le disant.

`GET /admin/accounting/payment-links/orders`,
`POST /admin/accounting/payment-links/orders/:orderId/resend`.

### 2b. Les liens libres

Un **nouvel agrégat** `PaymentLink` dans `b2b/payments/` :

| Champ                                      | Règle                                                      |
| ------------------------------------------ | ---------------------------------------------------------- |
| `id`                                       | ULID (`IdGenerator`)                                       |
| `companyId`                                | obligatoire — un lien libre s'adresse à un client          |
| `amountCents`                              | entier > 0, plafonné par le réglage ci-dessous             |
| `label`                                    | 1–140, repris sur la page Stripe (« Régularisation août ») |
| `status`                                   | `open` → `paid` \| `cancelled` \| `expired`                |
| `stripeSessionId`                          | `cs_…`, unique, clé de rapprochement                       |
| `url`                                      | l'URL Stripe hébergée                                      |
| `createdAt/By`, `paidAt`, `cancelledAt/By` |

Pourquoi **Stripe Checkout hébergé** et pas une page de la boutique : le lien
s'envoie à un client qui peut ne pas avoir de compte connecté (comptable du
client), et une page publique de notre côté serait une surface de plus à
sécuriser. Stripe ouvre la page, encaisse, et nous prévient.

Transitions : `markPaid(at)` (depuis `open` seulement, idempotent si déjà
`paid`), `cancel(at, by)` (depuis `open` ; expire aussi la session chez Stripe),
`expire()` (webhook `checkout.session.expired`).

On ne marque un lien payé que sur `checkout.session.completed` avec
`payment_status = paid`, ou sur `checkout.session.async_payment_succeeded`. Si un
paiement arrive sur un lien déjà annulé, parce que l'annulation a perdu la course
chez Stripe, le lien passe quand même à `paid` : l'argent est encaissé, et nier
ce fait serait pire. La cloche du staff prévient alors d'une annulation doublée
d'un paiement. **Runbook** : abonner l'endpoint Stripe à ces trois événements.

Port `PaymentGateway` : deux méthodes de plus, `createCheckoutSession({
amountCents, currency, label, companyId, paymentLinkId })` → `{ sessionId, url }`
et `expireCheckoutSession(sessionId)`. Le webhook gagne
`checkout.session.completed` et `checkout.session.expired`, réduits à
`{ kind: "link_paid" | "link_expired", sessionId }`, et un handler les rapproche.

🔴 **Argent** : le montant est entré en euros dans l'écran, converti en
centimes **au front** par la fonction partagée existante (à nommer au lot 4),
validé en entier > 0 par Zod et par l'agrégat. Un lien libre n'est **pas** une
commande : il n'entre ni au chiffre d'affaires des commandes ni au cycle de
prélèvement. Il ne solde pas non plus automatiquement une commande — le
rapprochement avec ce qu'il régularise reste humain pour ce premier lot.

API : `GET/POST /admin/accounting/payment-links`,
`POST /admin/accounting/payment-links/:id/cancel`.

### Le plafond — un réglage du comptable (Hugo, 2026-09-25)

« Plafond à définir par le comptable, `null` si pas de plafond. » Une table
`accounting_settings` à ligne unique (id fixe `default`), colonne
`payment_link_max_cents Int?` : `null` = aucun plafond. C'est de la config sans
transition, donc un CRUD `Payload`↔`View` (§3.1 de `CLAUDE.md`), pas un agrégat.
Le plafond est lu **à la création** du lien et passé à `PaymentLink.create`, qui
refuse au-delà (409 qui nomme le plafond). Un lien déjà créé n'est pas touché
quand le plafond baisse. Le réglage s'édite dans l'onglet des liens libres,
droit `b2b_accounting`.

### L'écran — `comptabilite/liens-de-paiement`

Deux onglets : « Commandes à régler » (2a) et « Liens libres » (2b, avec
« Nouveau lien » : société, montant, libellé → affiche l'URL à copier).

## Découpage

| Lot | Contenu                                                                  |
| --- | ------------------------------------------------------------------------ |
| 1   | Migration + `Company` + garde de passation + cycle + API blocage + tests |
| 2   | Écran blocage                                                            |
| 3   | 2a : lecture + renvoi + écran onglet 1                                   |
| 4   | 2b : agrégat, migration, passerelle Stripe, webhook, API, écran onglet 2 |

## Ce que ce plan ne fait pas

- Pas de blocage automatique sur rejet de prélèvement (aucun retour bancaire
  n'est encore lu).
- Pas de lettrage automatique lien libre ↔ commandes.
