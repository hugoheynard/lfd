# TODO — aucun appel réseau sortant dans une transaction

> 📋 **Noté le 2026-11-06**, à la revue des changements de S2 avec Hugo (cas 3,
> `documentation/mail/plan-service-e-mails.md`, « Revue des
> changements avec Hugo »). Rien n'est relevé ni bâti.
>
> Le même jour, plus tard : le relevé, le garde et la porte sont posés, et les
> violations mesurées — voir « Mesuré le 2026-11-06 ». Rien n'est corrigé.

## La règle

**Une transaction de base de données ne contient aucun appel réseau sortant.**
Un appel se fait _avant_ (lire, réserver avec une clé d'idempotence) ou
_après_ la validation (agir, par l'outbox) — jamais au milieu.

Pourquoi : un appel au milieu d'une transaction peut agir pour une écriture
qui sera annulée, partir deux fois quand la transaction expire après l'appel
(5 s par défaut), et tenir une des 15 connexions du pool pendant toute la
durée de l'appel. C'est le défaut que S1b et S2a ont retiré des e-mails.

Ce n'est pas un obstacle à un découpage futur en services : c'est la brique
de base d'une « saga » — chaque service fait sa transaction locale, publie par
l'outbox, et le suivant réagit ; un échec se compense, il ne s'annule pas en
arrière. Les transactions distribuées par le réseau (_two-phase commit_) sont
évitées partout pour les mêmes raisons.

## Ce qui est déjà tenu

Les e-mails : tout passe par le bloc `mail` (`lint:mail-through-block`) ;
`mail.send` n'enregistre qu'une demande ; `mail.sendAndAwaitReceipt` lève une
erreur dans une unité de travail.

## À faire

1. **Le relevé** : chaque appel sortant de `apps/lfd-api/src` — Stripe, Auth0,
   stockage (R2), planificateur de tournées, géocodage, tout `fetch` — et,
   pour chacun, s'il peut être appelé dans une unité de travail aujourd'hui.
   Ceux qui le sont : le même défaut que les e-mails, à corriger d'abord
   (Stripe et Auth0 en priorité : l'argent et les comptes).
2. **Le garde** : partagé depuis `platform/`, sur le modèle de celui de
   `sendAndAwaitReceipt` ; chaque adaptateur sortant l'appelle, et lève une
   erreur nommée si une transaction est ouverte.
3. **La porte** : tout fichier qui fait un appel sortant passe par le garde ou
   figure sur une liste admise et datée, avec sa raison.

## Mesuré le 2026-11-06

Les points 1, 2 et 3 ci-dessus sont posés, le garde en mode `report`. Ce qui
reste : corriger ce que la mesure a trouvé (tableau 2), puis passer en
`enforce`.

### Ce qui est posé

- **Le garde** : `assertOutsideTransaction(what)`
  (`apps/lfd-api/src/platform/database/outside-transaction.ts`). Il voit
  l'unité de travail **et** la transaction directe (`runWithCommitQueue`, dont
  le cadre a `tx: undefined` : `currentTransaction()` ne la voit pas, d'où
  `isInsideTransaction()` dans `transaction.store.ts`). Hors de toute
  transaction, et dans un rappel d'après validation, il ne dit rien.
- **Le réglage** : `NETWORK_IN_TRANSACTION`, lu par `AppConfig`. `off` ;
  `report`, **le défaut** (avertissement structuré
  `network_call_inside_transaction` avec la pile, l'appel part quand même) ;
  `enforce` (lève `NetworkCallInsideTransactionError`, une `TechnicalError`).
  Rien n'est en `enforce`, nulle part.
- **La porte** : `pnpm gate network-outside-transaction`
  (`dev-toolbox/gates/network-outside-transaction.mjs`). Tout fichier de
  `apps/lfd-api/src` qui fait un appel sortant appelle le garde, ou est inscrit
  (admis ou délégué) avec sa raison datée. Depuis le 2026-11-06 (Hugo), elle
  tient aussi **le classement des dépendances**
  (`lint/dependency-network-class.json`) : chaque paquet externe importé par
  l'API — `node:*` et `@lfd/*` compris, relevé par les imports — est classé
  `network` ou `local` avec sa raison ; un paquet non classé échoue
  (« nouvelle dépendance… », fichier:ligne), une entrée que plus rien
  n'importe aussi, et un import non typé d'un paquet `network` fait du
  fichier un appel sortant. Une entrée `network` peut restreindre le réseau à
  certains noms (`networkImports`) : `@lfd/storage` et `@lfd/mailer` exportent
  aussi des utilitaires purs, `jose` ne lit le réseau que par
  `createRemoteJWKSet`. Les motifs restent, `fetch` étant global.
- **La mesure e2e** : `E2E_NETWORK_LOG=<fichier>` allume
  `apps/lfd-api/test/network-measure.ts`, une ligne JSON par violation (suite,
  cas, appel, pile, pile d'ouverture de la transaction). Comme les e2e doublent
  les tiers, la mesure enveloppe aussi l'instance servie sous chaque jeton
  sortant (doubles, adaptateurs « désactivés »), sauf l'adaptateur réel, qui
  se garde déjà.

### Tableau 1 — les adaptateurs sortants

32 fichiers font un appel sortant : 25 gardés, 4 délégués (le fichier construit
le client, un autre fait les appels et se garde), 3 admis. Le garde est posé
en tête de 41 méthodes. Chemins sous `apps/lfd-api/src/`.

| Tiers                         | Fichier                                                                                                                                                   | Garde                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Stripe                        | `card-payment/infrastructure/stripe/stripe-card-provider.ts`                                                                                              | `createIntent`, `retrieveIntent`, `cancelIntent`     |
| Stripe                        | `b2b/payments/infrastructure/stripe-checkout-gateway.ts`                                                                                                  | `createCheckoutSession`, `expireCheckoutSession`     |
| Stripe                        | `card-payment/infrastructure/stripe/stripe-card-provider.ts`                                                                                              | `refundRemainder`, `findRefund`                      |
| Stripe                        | `card-payment/infrastructure/stripe/stripe-refund-calls.ts`                                                                                               | délégué au remboursement ci-dessus                   |
| Stripe                        | `card-payment/infrastructure/stripe/stripe-intent-translation.ts`                                                                                         | admis : classes d'erreur, aucun appel                |
| Auth0 (Management, jeton M2M) | `platform/identity/auth0-management.client.ts`                                                                                                            | `call`, `diagnose`                                   |
| Auth0 (clés de signature)     | `platform/auth/remote-key-set.ts`                                                                                                                         | admis : à l'entrée de la requête, avant tout handler |
| Stockage S3 (documents)       | `platform/storage/s3-document-store.ts`                                                                                                                   | `save`, `read`, `readIfPresent`, `delete`            |
| Stockage R2 (médias)          | `platform/storage/r2-media-store.ts`                                                                                                                      | `put`, `remove`                                      |
| Resend (envoi)                | `mail/templates/effective-copy/effective-copy-mailer.ts` (depuis T1b), délégué par `mail/templates/mail-transport.providers.ts`                           | `send`                                               |
| Resend (réception)            | `platform/mailer/inbound/resend-inbound-mail.reader.ts`, délégué par `platform/mailer/mailer.module.ts`                                                   | `read`                                               |
| Resend (webhooks)             | `platform/mailer/webhook/resend-webhook.checker.ts`                                                                                                       | `check`                                              |
| Planificateur (OSRM)          | `delivery/infrastructure/osrm-distance-matrix.ts`, `osrm-route-geometry.ts`, `osrm-road-routing-waker.ts`                                                 | `build`, `trace`, `wake`                             |
| Géocodage (BAN)               | `delivery/infrastructure/ban-geocoder.ts`                                                                                                                 | `geocode`                                            |
| Cloudflare (cache des rayons) | `b2b/catalog/infrastructure/durable-object-shop-shelf-cache.ts`, `durable-object-shop-shelf-switch.ts`, `internal-public-shelf.ts`                        | `read`, `store`, `erase`, `apply`, `purge`           |
| Cloudflare (purges)           | `b2b/shop-copy/infrastructure/internal-shop-copy-edge-cache.ts`, `b2b/shared/public-settings-cache/infrastructure/internal-public-settings-edge-cache.ts` | `purge`                                              |
| Cloudflare (mesures)          | `ops/container/graphql-container-metrics.reader.ts`, `ops/traffic/analytics-engine-traffic.reader.ts`                                                     | `read`                                               |
| Sondes                        | `ops/probes/external.probes.ts` (Auth0, Resend, Stripe, R2), `ops/probes/frontend.probe.ts`                                                               | `check`                                              |
| API des entreprises           | `b2b/account/infrastructure/recherche-entreprises-establishment.directory.ts`, `b2b/growth/infrastructure/recherche-entreprises.directory.ts`             | `resolveNaf`, `countEstablishments`                  |
| Webhooks sortants (vitrine)   | `platform/outbound/pinned-https-webhook-poster.ts`, délégué par `platform/outbound/host-resolver.ts` (DNS)                                                | `post`                                               |
| Notifications (web-push)      | `staff/notifications/infrastructure/web-push-sender.ts`                                                                                                   | `send`                                               |
| Semis local                   | `dev/seeding/storage.seed.ts`                                                                                                                             | admis : hors de toute requête                        |

### Tableau 2 — les violations trouvées

Deux passes avec `E2E_NETWORK_LOG`, après `db:test:setup`, une chaîne à la
fois :

- la liste du chantier : `payments-*`, `shop-order*`, `order-*refund*`,
  `payment-links`, `staff-invitation`, `admin-companies`, `password-link`,
  `login-methods`, `media-*`, `issued-invoices`, `mail-*`, `client-notes*`,
  `delivery-*`, `card-*` — 99 suites, 761 cas, tous verts ;
- les autres chemins sortants : `kbis`, `admin-company-pieces`,
  `admin-customer-access`, `accounting-legal-entity`, `contact*`,
  `production-day-close*`, `production-dossier*`, `invoice-dossiers`,
  `*mandate*`, `resend-webhook`, `shop-copy`, `staff-notification*`,
  `sub-account*`, `vitrine*`, `invitation-expiry` — 44 suites, 397 cas, tous
  verts.

**896 appels en transaction, à 3 endroits du code** :

| #   | Appel sortant                                                       | Appelant                                                                                                                                                                                              | Transaction ouverte par                                                                                                                              | Constaté                                            |
| --- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1   | S3 `customers` : `readIfPresent` puis `save` du bon de commande PDF | `b2b/orders/application/services/order-sheet-archive.service.ts:134` et `:136`, depuis `b2b/orders/application/handlers/send-order-placed-mail.handler.ts:75` (`SendOrderPlacedMail`, abonné durable) | `platform/outbox/durable-delivery-guard.ts:35` : la livraison d'un fait durable ouvre une unité de travail autour de l'abonné (`outbox-relay.ts:87`) | 686 appels, 157 cas, 34 suites                      |
| 2   | le même archivage du bon                                            | même service, depuis `b2b/orders/application/handlers/send-order-settled-mail.handler.ts:49` (`SendOrderSettledMail`, abonné durable)                                                                 | idem                                                                                                                                                 | 208 appels, 69 cas, 14 suites                       |
| 3   | OSRM : `DistanceMatrix.build` (temps de trajet d'un site)           | `b2b/orders/application/services/site-deadlines.service.ts:106`, depuis `production/application/commands/close-production-day.handler.ts:74` (`arrest`)                                               | `close-production-day.handler.ts:57` : l'unité de travail de la clôture, **sous le verrou de la journée**                                            | 2 appels, 1 suite (`delivery-notes-terms-scenario`) |

Ce que ça dit :

- **Le défaut n'est pas dans un adaptateur, il est dans la forme d'un abonné
  durable.** `DurableDeliveryGuard.deliver` exécute chaque abonné dans une
  unité de travail (l'accusé de livraison et les écritures de l'abonné
  partent ensemble). Tout abonné durable qui touche le réseau est donc en
  violation par construction. Les deux trouvés écrivent le PDF du bon au
  stockage avant d'envoyer l'e-mail (l'e-mail, lui, passe déjà par
  `mail.send`).
- **Le n° 3 est le plus cher** : la clôture du fournil tient le verrou de la
  journée pendant un appel au planificateur de tournées, qui peut se
  réveiller à froid. Une seule suite le voit, parce que les autres n'ont pas
  de site approvisionné par transfert avec des coordonnées.
- **Aucune violation Stripe, Auth0, R2 (médias), webhook, web-push, purge de
  cache ni géocodage** sur les chemins lancés.

### Ce que les suites lancées ne couvrent pas

- **Le vrai client des tiers.** Les e2e doublent Stripe, l'envoi, R2, les
  identités (adaptateur de dev, faute de M2M), OSRM et BAN (versions
  désactivées ou à vol d'oiseau). La mesure voit l'appel au port, pas ce que
  l'adaptateur réel ferait de plus.
- **Les chemins hors e2e** : les sondes et lecteurs d'`ops`, le contrôle du
  webhook Resend, le réveil du planificateur, les tâches planifiées qu'aucune
  suite ne déclenche, le semis de dev.
- **Les 447 autres suites e2e**, pas lancées en mesure. Le mode `report` en
  production, ou `E2E_NETWORK_LOG` sur la suite complète, les couvrira.
- **Un appel sortant hors des motifs de la porte** (`fetch(`, `new Stripe(`,
  `S3StorageService`, `node:https`…) : un nouveau client qui n'en emprunte
  aucun ne serait pas vu. **Fermé le 2026-11-06** par le classement des
  dépendances (ci-dessus) : une bibliothèque nouvelle doit être classée avant
  que la porte repasse. Ce qui reste hors de vue : un nom réseau ajouté à un
  paquet déjà classé avec `networkImports` sans que la liste suive.
