# TODO — les contrôles du paiement en production

> **Ouvert le 2026-11-22**, à la demande de Hugo : « note les contrôles à faire
> en todo, on fera ça plus tard ». Chaque contrôle se raye avec sa date quand
> il est fait. Ce qui est bâti est décrit dans
> [`les-liens-de-paiement.md`](les-liens-de-paiement.md) ;
> l'ordre général dans [`feuille-de-route.md`](feuille-de-route.md).

## Déjà faits

- ~~**Le lien de paiement d'essai**~~ (2026-11-26, Hugo) : 1 € débité par un
  vrai lien `/payer/…`, puis remboursé tout seul. Éprouvés d'un coup : la
  page, l'encaissement Stripe, le webhook des cartes, le remboursement
  automatique.

- ~~**V — un paiement sur les tables renommées**~~ (2026-11-22) : une
  modification de commande vers le haut, complément de 1,52 € payé ; la ligne
  `payment.card_payment` (`role = complement`, `state = paid`) est relue en
  production. Les tables du schéma `payment` et l'absence de demande de
  remboursement bloquée sont constatées.

## À faire

### 1. V — un remboursement sur les tables renommées

Une annulation, ou une modification vers le bas, d'une commande payée par
carte. Le remboursement part au balayage suivant (quelques minutes).

- dans le back-office, la commande montre le remboursement demandé, puis réussi ;
- côté client, l'e-mail de remboursement arrive ;
- dans Stripe, le remboursement apparaît sur le paiement d'origine ;
- en base, aucune demande restée prise sans écriture :

```sql
SELECT id, state, generation, round, attempts, claimed_until, last_failure
  FROM payment.card_refund_request
 WHERE state = 'to_issue' AND claim_token IS NOT NULL
   AND claimed_until < now() AND provider_ref IS NULL;
-- attendu : aucune ligne
```

En cas d'échec : le retour arrière de V est au runbook
([`../ops/runbook.md`](../ops/runbook.md), « Déployer le vocabulaire du paiement »).

### 2. F1 — une demande de paiement libre par la porte

Déployé le 2026-11-22.

1. Comptabilité › Liens de paiement › Liens libres : créer une petite demande
   (1 €) pour une société de test ;
2. le lien copié commence par l'adresse de la boutique et finit par
   `/payer/…`, plus par `checkout.stripe.com` ;
3. la page montre le montant, la société et le libellé ; payer ;
4. au back-office, la demande est « payée », et « Copier » a disparu ;
5. une seconde demande, annulée : son lien répond « ce lien n'est pas ou plus
   valable ».

⚠️ La première demande payée par la porte rend la migration des liens libres
irréversible côté base (`20261122120000_la_regularisation_par_la_porte`) :
c'est attendu.

### 3. P1b et P1c — l'avis à la comptabilité et ses destinataires

À faire **après leur déploiement** (ils partent ensemble, après F1).

1. Accorder le droit de l'écran « Destinataires des avis » à l'écran des rôles
   (Admin › Rôles), au rôle qui doit régler les avis ;
2. régler l'avis « paiement reçu par lien » : un rôle, et/ou un membre ;
3. payer une petite demande de paiement libre par son lien ;
4. chaque membre actif réglé reçoit **un** e-mail : le montant, le canal, le
   client, l'application, le libellé avec le bouton vers le back-office, et
   « créé par <nom> » ;
5. sans réglage : l'e-mail part à la boîte de l'équipe (`MAILER_STAFF_INBOX`).

### 4. Déployés le 2026-11-22 au soir : N, F2, B, D1, le schéma

**N — les natures** : créer une demande libre ; le formulaire impose une
nature ; la liste montre la colonne « Nature », les anciennes demandes
« Non précisée » ; l'e-mail à la comptabilité dit « <nature> — <libellé> ».

**F2 — Stripe Checkout retiré**, quatre gestes hors du dépôt :

1. Stripe : supprimer la destination de webhook « lfd-api production —
   liens de paiement » (`/payments/links/webhook`) ;
2. Stripe : sur l'endpoint des cartes, décocher `checkout.session.completed`,
   `checkout.session.async_payment_succeeded` et `checkout.session.expired`
   (pas urgent : ils sont rangés sans effet) ;
3. Cloudflare : `wrangler secret delete STRIPE_LINKS_WEBHOOK_SECRET` sur le
   Worker de l'API, s'il y est ;
4. GitHub : supprimer le secret `STRIPE_LINKS_WEBHOOK_SECRET` du dépôt.

**B — le balayage des paiements en attente** : rien à faire ; il tourne
toutes les cinq minutes. Signe qu'il marche : aucune erreur
`admin/card-payments/pending/sweep` dans les journaux du Worker.

**D1 — le virement dans `payment`** :

```sql
SELECT count(*) FROM payment.transfer_received;    -- attendu : 0
SELECT count(*) FROM payment.transfer_allocation;  -- attendu : 0
SELECT to_regclass('public.received_bank_transfer'); -- attendu : NULL
```

Puis Comptabilité › Virements : l'écran « à régler » s'ouvre. Le premier
virement saisi pour de vrai est le vrai contrôle : sa facture passe
« réglée le … ». Le contrôle de cohérence passe chaque nuit (3 h 45) ; il ne
doit sonner que s'il y a un écart.

**Le schéma** : rien en production (schéma seulement).

### 5. Stripe — les vérifications du tableau de bord

Quand Hugo a de nouveau accès au tableau de bord Stripe :

- le complément de 1,52 € (contrôle de V) y apparaît, payé ;
- la destination de webhook « lfd-api production — liens de paiement » est
  toujours **désactivée** : elle ne doit pas être activée (le plan s'en passe,
  et F2 la retirera) ;
- les moyens de paiement en plusieurs fois disponibles sur le compte, si le
  sujet revient (feuille de route, §4.3).
