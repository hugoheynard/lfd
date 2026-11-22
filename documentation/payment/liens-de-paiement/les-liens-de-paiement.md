# Les liens de paiement

> ✅ **Doc d'état, relue dans le code le 2026-11-22** (demande de paiement libre par la
> porte comprise, lot F1 ; sortie de Stripe Checkout, lot F2). Elle décrit ce
> qui existe. La suite envisagée (la facture d'une période) est dans
> [`plan-le-lien-vers-un-sujet.md`](plan-le-lien-vers-un-sujet.md).
> Le blocage du prélèvement, longtemps décrit dans la même page, a sa doc :
> [`../../comptabilite/prelevement/blocage-du-prelevement.md`](../../comptabilite/prelevement/blocage-du-prelevement.md).

# Partie 1 — L'explication simple

Un **lien de paiement** est une adresse qu'on envoie à un client pour qu'il
paie **par carte**, sans passer par la caisse ni par le prélèvement.

Il en existe **deux sortes** aujourd'hui, qui ne marchent pas pareil :

| Sorte                                    | Pour payer quoi                               | Où le client paie                                       | Qui le crée                                                                                    |
| ---------------------------------------- | --------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Lien d'une commande**                  | une commande pas encore payée                 | **notre** page, dans l'espace client (`/reglement/:id`) | personne : il existe dès que la commande attend son paiement ; le staff le copie ou le renvoie |
| **Lien libre** (« Régularisation août ») | une somme hors commande, choisie par le staff | **notre** page de paiement, sans connexion (`/payer/…`) | le staff, dans Comptabilité › Liens de paiement                                                |

```mermaid
flowchart LR
  subgraph Commande
    O["Commande en attente<br/>de paiement"] --> P1["Notre page<br/>/reglement/:id"]
    P1 --> CP["Bloc card-payment<br/>(encaisse)"]
  end
  subgraph Libre
    S["Le staff crée<br/>une demande de paiement libre"] --> P2["Notre page<br/>/payer/:jeton"]
    P2 --> CP
  end
  CP --> ST["Stripe"]
```

Ce qu'il faut retenir :

- **Les deux passent par le bloc `payment`**, celui qui encaisse toutes les
  cartes : changer de prestataire de carte les ferait suivre.
- **Les anciens liens libres**, créés avant le 2026-11-22 sur une page
  Stripe Checkout, ne sont plus que de l'historique : on les voit dans la
  liste (payés, annulés, expirés), plus rien ne les règle.
- **Annuler un lien libre** le rend introuvable : sa page répond « ce lien
  n'existe pas ou n'est plus valable ». Si le client avait déjà payé, l'argent
  est gardé et l'équipe est prévenue.
- **Un lien libre n'est pas une commande** : il ne compte ni au chiffre
  d'affaires, ni au prélèvement, et ne règle aucune commande tout seul. Le
  rapprochement avec ce qu'il régularise se fait à la main.
- **On ne peut pas encore payer une facture** (une période de bons) par
  lien : une facture se règle par prélèvement ou par virement.

# Partie 2 — La technique

Écran : Comptabilité › Liens de paiement
(`apps/lfd-backoffice-frontend/src/app/comptabilite/liens-de-paiement/`),
deux onglets — « Commandes à régler » (`orders-to-settle/`) et « Liens
libres » (`free-links/`, panneau de création `new-link-panel/`).
Contrat : `packages/contracts/src/payment-link.ts`.

## 1. Le lien d'une commande

- **La liste** : les commandes au règlement `pending` ou `failed`, non
  annulées (`list-orders-awaiting-payment.handler.ts`), avec l'adresse de la
  page de règlement de l'espace client. Sans `CLIENT_BASE_URL`, `paymentUrl`
  vaut `null` : pas de lien affiché, et le renvoi est refusé en le disant.
- **Le renvoi par e-mail** à l'acheteur :
  `resend-order-payment-link.handler.ts`, modèle d'e-mail « lien de
  règlement d'une commande ».
- **La page** `/reglement/:id` (boutique, `client/commande/reglement-page/`),
  la seule page de règlement — `/commandes/:id/regler` a été retirée le
  2026-11-22, aucun e-mail ne l'ayant jamais portée en production. Le lien
  se génère dans `payment-link.ts`. La page relit le paiement par le bloc
  `payment` (`get-order-payment.handler.ts`) et n'en crée jamais un nouveau ;
  une carte refusée se règle encore tant que l'intention vit. Le formulaire
  de carte se monte par le service de collecte (`CardCollector`), qui lit
  l'instruction neutre du prestataire.
- **Qui entre** (`settle.guard.ts`) : le visiteur qui vient de passer la
  commande (son paiement est en mémoire, `HeldOrderPayment`, compte ou non) ;
  sinon un client connecté ; sinon la connexion d'abord, puis retour sur la
  page.
- **Commande saisie par l'équipe** (`place-order-for-customer.handler.ts`) :
  le règlement se fait par ce lien, que le client suit lui-même ; jamais un
  numéro de carte dicté. Non réglée à l'heure limite, elle fait sonner la
  cloche ; un rappel part au client (`order-settlement-reminders.e2e-spec`).

| Route                                                        | Geste                       |
| ------------------------------------------------------------ | --------------------------- |
| `GET admin/accounting/payment-links/orders`                  | les commandes à régler      |
| `POST admin/accounting/payment-links/orders/:orderId/resend` | renvoyer le lien par e-mail |

(`lafoliecoffee/orders/http/admin-order-payment-links.controller.ts`)

## 2. Le lien libre — la demande de paiement libre

- **Agrégat** `PaymentLink`
  (`lafoliecoffee/payments/domain/entities/payment-link.ts`) : société,
  montant en centimes (> 0), libellé (1 à 140 caractères, la référence que
  lit le client), états `open → paid | cancelled | expired`. Table
  `payment_links` (`prisma/schema/public/accounting.prisma`), sans
  suppression : un lien se clôt par son statut.
- **Sa nature**, obligatoire à la création : pourquoi on demande ce paiement
  (régularisation, supplément convenu, solde après litige, acompte, autre).
  Le registre est `FREE_CHARGE_NATURES` (`packages/contracts/src/payment-link.ts`) :
  une nature de plus est une ligne, sans migration (la colonne `nature` n'a
  pas de `CHECK`). Une nature ne s'en retire jamais : une clé inconnue
  relue en base est une donnée corrompue (500). Les demandes d'avant le
  registre ont `nature = NULL`, affichée « Non précisée ». La nature figure
  dans la liste, le fait `payment_link.created` et l'avis à la comptabilité ;
  pas sur la page `/payer/…`. L'acompte en nature encaisse seulement : la
  facture d'acompte et sa déduction restent à la main.
- **Son canal**, fermé (`PaymentLinkChannel`) : `door` pour une demande de paiement libre
  payée par la porte du bloc `payment` (toute création), `checkout` pour un
  lien d'avant la porte, ligne historique qui garde sa session Stripe et son
  adresse. `stripe_session_id` et `url` sont nuls ensemble (`door`) ou posés
  ensemble (`checkout`) — `CHECK payment_links_checkout_pair`, migration
  `20261122120000_la_regularisation_par_la_porte`. Aucune méthode de
  l'agrégat ne lit la session : elle se relit et se range telle quelle.
- **Créer** (`create-payment-link.handler.ts`), dans UNE transaction, sans
  réseau : le plafond, la ligne, puis `PayLinks.open` du sujet
  `free_charge` (origine `lafoliecoffee`, payeur = nom de la société, auteur =
  la fiche staff). Rend `{ id, url }`, l'URL `/payer/…`. Une fois par
  intention : le scellé ne garde que `{ id }` (l'URL porte le jeton) ; un
  rejeu relit l'adresse par `PayLinks.urlOf`, et une demande de paiement libre payée ou
  annulée depuis répond 409.
- **Le sujet `free_charge`** (`application/free-charge/`), relié par
  `appBootstrap/` (`card-payment-feed.module.ts` : compte `lfc-stripe` et
  `SubjectSettlements` ; `pay-link-feed.module.ts` : `LinkableSubjects`) :
  - `quote` : payable si `open` — montant, libellé en référence, société en
    payeur, « La Folie Coffee » en bénéficiaire, sans échéance ; sinon
    `settled` (payée) ou `cancelled` (annulée, expirée) ;
  - `lockSubject` : le `FOR UPDATE` de sa ligne, le même que l'annulation ;
  - `onPaid` : `applied` (passe à `paid`), `already_applied` au rejeu ;
    **payée après annulation** : `applied` aussi, l'argent est gardé et la
    cloche `payment_link.paid_after_cancel` sonne ;
  - `onPaymentFailed` : rien, le client réessaie ;
  - `isCancelled` : vrai si annulée (et pas payée depuis) ;
  - `onRefundOutcome` : journal `payment_link.refunded` sur la société,
    l'état ne change pas ; cloche `payment_link.refund_failed` quand un
    remboursement n'a pas rendu l'argent ;
  - `describe` : « <nature> — <libellé> » (« Paiement libre — <libellé> »
    sans nature), l'écran des liens et l'avis à la comptabilité ;
  - `claim` / `referencesSince` : `null` / rien — tout paiement d'un lien
    naît par `attach`.
- **Annuler** (`cancel-payment-link.handler.ts`), sous `loadLocked` :
  - `door` : dans la transaction, `PaymentLink.cancel`, `PayLinks.revoke`
    (la page rend 404) et le fait durable `payment_link.cancelled` ; son
    abonné `OnPaymentLinkCancelled` (`b2b.payments.cancel-payment-link-intent`)
    annule le premier paiement chez le prestataire, s'il existe. Une panne
    lève et la boîte d'envoi rejoue ; `already_paid` fait sonner la cloche
    « payé après annulation », sans relancer ;
  - `checkout` (une ligne historique relue encore ouverte) : la ligne passe
    à `cancelled`, sans appel à Stripe, sans révocation ni fait durable —
    sa session a vécu ses 24 heures, rien ne peut plus la payer.
- **La liste** (`list-payment-links.handler.ts`) : `url` vaut `null` sauf
  pour un lien ouvert — la colonne pour un ancien lien, `PayLinks.urlsOf`
  (une lecture pour la page) pour une demande de paiement libre. Une adresse qui ne se
  compose pas (racine publique absente) laisse sa ligne à `null` et se
  journalise, sans faire tomber la liste.
- **Plafond** : `accounting_settings.payment_link_max_cents` (`null` =
  aucun), lu à la création ; au-delà, refus qui nomme le plafond. Réglage :
  `admin/accounting/settings`.

| Route                                            | Geste            |
| ------------------------------------------------ | ---------------- |
| `GET admin/accounting/payment-links`             | les liens libres |
| `POST admin/accounting/payment-links`            | créer            |
| `POST admin/accounting/payment-links/:id/cancel` | annuler          |

(`lafoliecoffee/payments/http/admin-payment-links.controller.ts`)

## 3. Les anciens liens libres — des lignes historiques

Un lien d'avant la porte (canal `checkout`) a été ouvert sur une page Stripe
Checkout. Plus aucun ne se crée, et **aucun chemin ne le règle plus** : ni
route de webhook des liens (`/payments/links/webhook` répond 404), ni relais
par le webhook des cartes. Le 2026-11-22, la production n'en avait plus
aucun ouvert (relevé par Hugo).

- **Ce qui reste** : la ligne, ses colonnes `stripe_session_id` et `url`,
  leur `CHECK`, et la lecture du canal (`PaymentLink.reconstitute`, la
  liste). Un ancien lien payé, annulé ou expiré se lit comme avant.
- **Un `checkout.session.*`** qui arriverait encore à l'endpoint des cartes
  est réduit en `other` et rangé `card_payment.unmatched` : sans effet.
- **Un remboursement** d'un ancien lien n'a pas de ligne au bloc `payment` :
  il arrive « hors commande » (`on-refund-without-order.handler.ts`).
- **Les tests** : `test/payment-links.e2e-spec.ts` (lecture, annulation sans
  Stripe, route retirée) ; `test/free-charge-links.e2e-spec.ts` pour la
  demande de paiement libre par la porte.

## 4. Le lien vers un sujet — la porte du bloc `payment`

Servie depuis le 2026-11-22 par la demande de paiement libre (`free_charge`) ; la
facture d'une période (I2) suivra
([`plan-le-lien-vers-un-sujet.md`](plan-le-lien-vers-un-sujet.md)).

```mermaid
sequenceDiagram
  participant M as Bloc métier
  participant P as payment/link
  participant B as Boutique /payer/:jeton
  participant C as payment/card
  M->>P: PayLinks.open(sujet, origine, payeur)
  P-->>M: <racine de l'origine>/payer/<jeton>
  B->>P: POST pay-links/view { token }
  P->>M: LinkableSubject.quote(sujet)
  P-->>B: montant, bénéficiaire, payeur, référence
  B->>P: POST pay-links/intent { token }
  P->>C: prepare (hors transaction)
  P->>M: lockSubject, puis relit quote et la vie du lien
  P->>C: attach (first, pay_link_id), ou release et 409
  P-->>B: instruction de collecte
  B->>B: CardCollector monte et confirme
```

- **Le lien** (`payment/link/`) : table `payment.pay_link`, un seul lien
  vivant par sujet, aucun DELETE, révocation posée une fois. Le jeton (32
  octets) n'est jamais gardé en clair : une empreinte HMAC sous
  `payLinkTokenKey()` (dérivée de `FIELD_ENCRYPTION_KEY`) pour le retrouver,
  un scellé (`FieldCipher`) pour le recopier.
- **Le paiement sait qu'il vient d'un lien** : `payment.card_payment.pay_link_id`,
  immuable, indexé.
- **La course avec une annulation** (`start-pay-link-payment.handler.ts`) :
  l'intention se prépare hors transaction, puis, sous le verrou du sujet,
  la porte relit le devis et vérifie que le lien est toujours vivant. Non
  payable ou révoqué : l'intention est libérée et la page reçoit un 409
  (`pay_link.subject.not_payable`, `pay_link.withdrawn`). L'annulation prend
  le même verrou : elle passe avant (le rattachement refuse) ou après (son
  abonné voit le premier paiement et l'annule).
- **Les ports** (`payment/channels/`) : `PayLinks` (ouvrir, révoquer,
  recopier, `urlsOf` pour une page de liste) pour les blocs métier ;
  `LinkableSubject` (`quote`), que chaque bloc sujet implémente.
- **L'avis à l'équipe** (`apps/lfd-api/src/payment/link/application/link-payment-mail-notice.ts`) :
  chaque paiement encaissé par un lien demande l'e-mail
  `staff.link-payment-received` **à l'équipe**, dans la transaction qui
  enregistre le paiement, après la réponse du sujet (ses destinataires :
  le point suivant). Il dit le montant, le canal (le compte
  et son prestataire), le client (`payer_label`), l'application (le libellé
  de l'origine), ce qui est réglé (`SubjectSettlement.describe`, avec le
  bouton vers l'écran du back-office), la provenance du lien (« créé par
  <nom> », « créé par un membre de l'équipe » quand le nom manque, « créé
  automatiquement par le système »), et l'issue (encaissé, ou encaissé puis
  refusé par le sujet, remboursement demandé). Le nom de l'auteur est figé
  sur le lien (`pay_link.created_by_label`), donné par l'appelant à
  l'ouverture : le bloc ne lit pas l'annuaire du staff. La clé
  (`mail:payment.link_paid:<paiement>`) et l'encaissement rejoué qui ne
  repasse pas `paid` empêchent un second avis. Un paiement de la boutique,
  sans lien, n'envoie pas cet avis.
- **Les destinataires de l'avis** (Admin › Destinataires des avis, droit
  `staff_notice_audiences`) : des rôles et des membres du staff, réglés
  dans `public.staff_notice_audience` — une ligne par rôle (`role_key`) ou
  par membre (`staff_user_id`), l'un des deux exactement (`CHECK`), clés
  étrangères en `RESTRICT`. Le geste est journalisé
  (`staff.notice_audience_changed`).

  ```mermaid
  sequenceDiagram
    participant P as payment
    participant M as mail
    participant S as staff
    P->>M: sendToStaffAudience (dans la transaction du paiement)
    M->>S: StaffNoticeRecipients.recipientsOf(modèle)
    S-->>M: identifiants et adresses des membres joignables
    M->>M: une demande par membre, ou une seule à la boîte de l'équipe
  ```

  Le bloc `payment` appelle `StaffAudienceMail.sendToStaffAudience`
  (`mail/channels/requests/staff-audience-mail.ts`). Le bloc `mail` lit la
  lecture que le staff publie, `StaffNoticeRecipients`
  (`staff/notifications/domain/ports/staff-notice-recipients.ts`) : les
  membres non suspendus et avec une adresse des rôles réglés, et les membres
  nommés aux mêmes conditions, une fois chacun, triés par identifiant. Il
  écrit **une demande par membre**, clé `mail:payment.link_paid:<paiement>:<membre>`.
  Personne de joignable : **une** demande à la boîte de l'équipe
  (`mailerConfig().staffInbox`), clé `…:inbox`, et un avertissement sans
  adresse. Sans boîte non plus : rien ne part, et un avertissement.
  Les destinataires sont choisis **au moment du paiement** et figés dans les
  demandes : un membre suspendu juste après reçoit l'avis, c'est assumé. Pas
  de cloche. La demande d'aide et l'alerte de compte gardent la boîte de
  l'équipe.

- **Le registre des origines** (`platform/config/pay-link-origins.ts`) : une
  origine par application, avec sa racine publique ; `lafoliecoffee` prend
  `CLIENT_BASE_URL`.
- **Les routes publiques** : `POST pay-links/view` et `POST pay-links/intent`,
  le jeton dans le corps, limite de débit par route, `no-store`. Un jeton
  inconnu et un lien révoqué rendent le même 404.
- **La page** `/payer/:jeton` (`client/pay-link/`) : sans connexion, dans le
  cadre de la boutique sans menu d'espace, `noindex`. Elle fait payer par le
  service de collecte (`CardCollector`) et dit chaque phase (introuvable,
  réglé, annulé, à renouveler, indisponible, prêt, payé).

## 5. Ce qui reste ouvert

- **Chez Stripe, hors du dépôt** : la destination « lfd-api production —
  liens de paiement » (créée désactivée le 2026-11-09) est à supprimer, et
  les trois `checkout.session.*` à décocher sur l'endpoint des cartes ; le
  secret `STRIPE_LINKS_WEBHOOK_SECRET` à retirer chez Cloudflare et dans
  GitHub. Le dépôt ne l'atteste pas.
- Pas de lettrage automatique entre un lien libre et des commandes.
- Pas de paiement d'une facture par lien (voir le plan).
- Aucun geste de remboursement d'une demande de paiement libre au back-office : un
  remboursement se fait chez le prestataire, et il est observé et rattaché.
