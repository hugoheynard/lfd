# Plan — une commande carte n'existe qu'une fois réglée

**Statut** : 📐 plan du 2026-10-09, décidé par Hugo le même jour (« oui vas-y »).
Rien n'est bâti. Touche le règlement et le retrait → `vitruve` avant de bâtir.

## 0. Le constat (production, 2026-10-09, après `592fbfe`)

> « j'ai une commande à régler et elle apparaît déjà en carte de suivi avec le
> QR de retrait donc non ce n'est pas encore assez strict » — Hugo.

Relu dans le code le même jour :

- Le suivi (`mes-commandes/order-rows.ts`, `isLive`) retient toute commande ni
  `fulfilled` ni `cancelled` ; le bien-être de l'accueil (`accueil-public.ts`)
  le réutilise.
- `toCustomerOrder` (`packages/contracts/src/order.ts`) sert `handoverToken`
  quel que soit `paymentStatus` ; la page `/mes-commandes/:id/retrait`
  (`retrait-page.ts`) l'affiche.
- 🔴 **Le comptoir ne vérifie pas le règlement** : `handoverBlocker`
  (`apps/lfd-api/src/handover/domain/services/handover.ts`) refuse
  `cancelled`, `draft`, déjà retirée, retenue qualité — pas une carte non payée.
- Le courriel `customer.order-placed` part à la passation
  (`send-order-placed-mail.handler.ts`, `order-placed-mail.service.ts`) avec le
  QR et, depuis `592fbfe`, le bon PDF (QR compris en retrait) — avant tout
  paiement.

## 1. La règle

**Une commande dont le règlement est dû par carte et n'est pas `paid` n'a ni
suivi, ni QR, ni retrait, ni courriel de confirmation.** Elle n'existe pour le
client que comme « À régler » (déjà bâti, `plan-commandes-non-reglees.md`).

« Réglée » = `paymentStatus ∈ { paid, not_required }`. `refunded` après retrait
ne change rien de ce qui est déjà fait ; `refunded` avant retrait n'a pas de QR.
La définition vit à UN endroit du contrat (`isSettled(paymentStatus)`), lue par
le front, la vue client et le commerce.

## 2. Ce qu'on bâtit

1. **Vue client** : `toCustomerOrder` pose `handoverToken: null` tant que la
   commande n'est pas réglée. La page de retrait d'une commande non réglée dit
   « À régler » et mène à `/reglement/:id`.
2. **Suivi** : `isLive` exige aussi une commande réglée ; la commande « À
   régler » reste dans la liste (étiquette + bouton), pas dans le suivi.
3. **Comptoir** : le retrait d'une commande non réglée est refusé, avec un
   message qui nomme le cas (« Cette commande n'est pas réglée : … »). Le fait
   vient du commerce par le canal existant (`handover/channels/commerce/`, le
   sujet du retrait) — le retrait ne lit pas les tables du commerce. Commandes
   au compte et gratuites : inchangées.
4. **Courriel de confirmation d'une commande carte** : il part au paiement
   accepté (le fait `order.paid` / la projection du webhook `succeeded`), avec
   le bon et le QR ; plus à la passation. Au compte / gratuit : inchangé, à la
   passation. Idempotence : une seule confirmation par commande (clé existante
   `order.placed:<id>`, gardée).
5. **Le bon PDF** d'une commande carte n'est plus fabriqué à la passation
   (il le serait sans QR et figé ainsi) : il l'est au paiement, pour la pièce
   jointe. Le téléchargement avant paiement reste possible ; il ne porte pas
   de QR et n'est PAS archivé (sinon la version sans QR serait figée) — ou est
   refusé : au bâtisseur de dire ce que le code permet le plus simplement.

## 3. Tests attendus

- Vue client : pas de jeton avant paiement, jeton après.
- `isLive` : non réglée exclue, réglée incluse, au compte incluse.
- Comptoir : refus nommé pour une carte non réglée ; au compte passe.
- Courriel : rien à la passation carte ; un envoi au paiement, une seule fois ;
  au compte : à la passation, comme avant.
- Bon : pas de version sans QR archivée pour une commande carte en retrait.

## 4. Arbitrages après `vitruve` (2026-10-09) — ils l'emportent sur le §2

1. **§2.4 est déjà bâti** : `send-order-placed-mail.handler.ts` sort sur
   `pending` (décision du 2026-09-17) et `send-order-settled-mail.handler.ts`
   envoie l'accusé au paiement, même service, même clé. Le bon joint part donc
   déjà au paiement. Ce qu'Hugo a vu, c'est le **suivi et la page de retrait**,
   pas un courriel. §2.4 sort du lot ; le bâtisseur vérifie seulement que
   l'accusé au paiement porte bien le bon et le QR.
2. **Une seule source du jeton exposé, côté serveur** : une fonction pure du
   commerce, `exposedHandoverToken(view)` (jeton si la commande est réglée,
   `null` sinon), lue par `toCustomerOrder` (ou en amont de lui), les deux
   handlers du bon PDF (client et admin), `order-sheet-archive`, et les
   courriels « passée/réglée » et « prête ». Plus aucun lecteur ne sert
   `view.handoverToken` brut à un client ou à un PDF.
3. **`isSettled(paymentStatus)` dans `@lfd/contracts`** = `paid` ou
   `not_required`. Il **remplace** la lecture propre du front
   (`order-rows.ts`), il ne s'y ajoute pas. `refunded` (remboursée en entier)
   n'est pas réglée : ni suivi ni QR ; une commande déjà retirée n'est pas
   concernée (le retrait a eu lieu).
4. **Le comptoir** : `HandoverSubject` (canal `handover/channels/commerce/`)
   gagne `settled: boolean`, posé par ses implémenteurs du commerce
   (`prisma-handover-subject.reader.ts`, `handover-order.query.ts`) avec
   `isSettled`. `HandoverCandidate` le porte, `handoverBlocker` refuse en le
   nommant. TOUS les lecteurs de `handoverBlocker` suivent (file
   `get-handover-queue` / `queue-state` / `prisma-handover-queue.reader`,
   `b2b/orders/domain/services/handover.ts`, `packing.ts`, le semis
   `counter-day.seed.ts`) : la file ne montre pas « remettable » ce que le scan
   refuse.
5. **Liens de paiement Checkout** : ils ne portent aucune commande
   (`settle-payment-link.handler.ts`) ; une commande saisie par le staff se
   règle par la page `/reglement/:id` (PaymentIntent), donc devient `paid`. Une
   commande au compte naît `not_required`. Aucune commande légitime ne reste
   bloquée `pending` au comptoir — le bâtisseur le vérifie et le signale sinon.
6. **Durabilité de l'accusé au paiement** (abonné en mémoire sur
   `OrderPaymentSettledEvent`, seul `order.paid` est durable) : hors lot, une
   TODO datée dans `documentation/order/` — le QR reste lisible dans « Mes
   commandes » même si le courriel se perd.
