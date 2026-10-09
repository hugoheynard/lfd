# TODO — l'accusé au paiement d'une commande carte vit sur le bus en mémoire

**Ouvert le 2026-10-09**, sorti du plan
[`plan-carte-reglee-avant-tout.md`](plan-carte-reglee-avant-tout.md) (§4.6)
après `vitruve`. Hors de ce lot ; rien n'est pris.

## Le constat (vérifié le 2026-10-09)

- `ConfirmOrderPaymentHandler` (`b2b/orders/application/commands/confirm-order-payment.handler.ts`)
  écrit `markPaid` et le fait **durable** `order.paid` dans la même unité de
  travail, puis publie `OrderPaymentSettledEvent` **en mémoire**, après la
  transaction.
- L'accusé de réception d'une commande carte (« commande enregistrée », bon
  joint et QR de retrait) part de `SendOrderSettledMail`
  (`send-order-settled-mail.handler.ts`), un `@EventsHandler` sur ce fait en
  mémoire — pas un `@DurableHandler` sur `order.paid`.
- Un redémarrage du processus entre l'écriture et l'envoi perd donc le
  courriel, sans trace ni reprise. La clé d'idempotence `order.placed:<id>`
  protège du doublon, pas de la perte.

## Pourquoi ce n'est pas bloquant aujourd'hui

Le QR reste lisible dans « Mes commandes » dès que la commande est réglée :
la vue client sert le jeton par `exposedHandoverToken`, et la page
`/mes-commandes/:id/retrait` l'affiche. Le client perd un courriel, pas son
retrait.

## La piste

Abonner l'accusé à `order.paid` par un `@DurableHandler`, comme la facture
carte (lot E5a), en gardant la clé `order.placed:<id>` : le balayage de la
boîte d'envoi le rejouerait après une panne, et la clé empêcherait le second
envoi.
