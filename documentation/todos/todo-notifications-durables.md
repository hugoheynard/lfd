# TODO — les notifications sont-elles durables ?

> 📋 **Noté le 2026-11-06**, à la revue des changements de S2 avec Hugo :
> « tout envoi de mail ou notification doit outbox ? ». Pour les e-mails,
> c'est tenu : tout passe par le bloc `mail` (`lint:mail-through-block`), et
> `mail.sendAndAwaitReceipt` n'est permis que depuis une liste admise
> (`lint:mail-receipt-admitted`, ex-`sendNow` et `lint:send-now-admitted`).
> Pour les autres canaux, **rien n'est relevé** — d'où ce TODO.

## Ce qu'il faut relever avant d'écrire une règle

Pour chaque canal qui prévient quelqu'un hors d'un e-mail :

- la **cloche du back-office** (`apps/lfd-api/src/staff/notifications/`) ;
- les **notifications push** (clés VAPID) ;
- les **alertes** (`apps/lfd-api/src/b2b/alerts/`), hors leur e-mail ;
- tout autre envoi vers l'extérieur (SMS, webhooks sortants…) s'il en existe.

… dire **qui envoie**, **en direct ou par un abonné durable**, et **ce qui est
perdu si l'API redémarre** entre le geste et l'envoi. C'est le cas 1 de la
revue de S2 (`documentation/editeur-de-contenu/plan-service-e-mails.md`,
« Revue des changements avec Hugo ») : un e-mail envoyé en fond était perdu
sans trace ; une notification peut l'être de la même façon.

## Ensuite

Selon le relevé : une règle « toute notification passe par un abonné
durable », tenue par une porte sur le modèle de `lint:durable-cross-block`.
