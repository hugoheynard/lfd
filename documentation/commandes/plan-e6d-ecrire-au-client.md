# Plan E6d — « Écrire au client » après un départ incomplet

> 🟡 **Bâti le 2026-10-25, pas encore commité** (migration
> `20261025180000_le_client_prevenu_du_depart`). Le gabarit
> `customer.order-shortfall` ne rend que son cadre (objet, titre, pied) ;
> ses « Paragraphes » sont la **proposition** — au manifeste, réécrivables à
> l'écran des textes —, et le corps envoyé est le texte relu, une donnée
> (`mail-layouts.spec.ts` les tient hors du rendu, avec leur raison). La
> langue est celle de la commande (`orders.locale`), le français sans elle.

> **Doc-first, 2026-10-25.** Lot E6d de
> [`plan-e6-le-depart-incomplet.md`](plan-e6-le-depart-incomplet.md). Décision de
> Hugo (commandes-incompletes.md § 4) : **avertir le client est un choix du
> décideur, jamais un envoi automatique.** Ni argent, ni migration de données,
> ni frontière : pas de `vitruve` d'office ; affirmations rouvertes le
> 2026-10-25. **Rien n'est bâti.**

## 0. Ce qui existe (ouvert le 2026-10-25)

- **Le modèle à suivre** : « Nous n'avons pas pu modifier votre commande »,
  avec le mot de l'équipe — `MailOrderChangeRefused`
  (`b2b/contact/application/handlers/mail-order-change-refused.handler.ts`) :
  gabarit `customer.order-change-refused` du dictionnaire des e-mails, clé
  d'idempotence par demande, envoi en fond (`BackgroundWork`), échec journalisé
  **sans l'adresse**, la réponse restant lisible sur la commande.
- **Le dictionnaire** : `platform/mailer/copy/` (fr, en, it) et son manifeste
  `mail-copy-manifest.json`, régénéré par `pnpm mail-copy:digest`
  (`lint:mail-copy-digest`).
- **La décision** (E6b) : `order_shortfall_decision` — auteur, instant,
  quantités partantes, reste.

## 1. Ce que fait E6d

- **Un geste à part** sur la fiche commande, après la décision et sous la même
  permission (`b2b_orders_shortfall`) : « **Écrire au client** ».
- **Un texte pré-rempli et modifiable** : le gabarit
  `customer.order-shortfall` du dictionnaire (fr, en, it ; la langue de la
  commande) rédige ce qui manque, ce qui part et la suite (« le reste ne sera
  pas livré » tant que seul « abandonné » existe) ; le décideur relit,
  corrige, puis **envoie** — ou ferme sans rien envoyer. Le texte envoyé est le
  texte relu, pas le gabarit.
- **Une seule fois par décision** : clé d'idempotence `order-shortfall:<décision>` ;
  la décision garde `customer_notified_at` et l'auteur de l'envoi ; la fiche
  dit « Client prévenu le … par … ».
- **Destinataire** : l'adresse de contact de la commande (ou du compte), comme
  les autres courriels de commande ; jamais l'adresse dans un journal.
- **Aucun abonné** à la décision, au BL ou à la remise n'envoie quoi que ce
  soit : un test le garde (E6 § 1, Hugo).

## 2. Tests

Domaine : le texte pré-rempli contient les articles partis et manquants. E2E :
écrire au client envoie un courriel (double du mailer), trace l'envoi, refuse
un second envoi ; décider sans écrire n'envoie rien.
