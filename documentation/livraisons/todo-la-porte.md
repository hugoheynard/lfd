# TODO — la porte (lot 6), mise en dette

> 🟡 **Partiellement bâti — relevé le 2026-10-01.** Le **lot A** de
> [`plan-a-la-porte.md`](plan-a-la-porte.md) est bâti (arriver, signaler un
> problème, clore sans remise, rentrer : `5ebc47e6f`, `a93bb3a88`), ainsi que
> B0 (`5bde2266f`, effets différés après la validation) et BQ (`40ab0467f`, la
> garde passe au livreur au départ). **Reste** : la remise et le dépôt avec
> preuve (lot B, en cours) et le code de retrait par e-mail. Le texte
> ci-dessous, « rien n'est bâti », est celui du 2026-09-29.

> **Mise en dette le 2026-09-29** par Hugo : « met le 6 en dette et avance, j'ai
> besoin de voir le reste fini avant ». La conception est écrite et contredite
> deux fois par `vitruve` : elle vit dans
> [`plan-preparation-de-tournee.md`](plan-preparation-de-tournee.md), section
> « Plus tard » → **Lot 6 — La porte** (L6-C1 à L6-C14, L6-Q1 à Q9 tranchées).
> Rien n'est bâti.

## Ce qui est tranché, et qu'il ne faudra pas redécider

- Le livreur : un membre avec compte (rôle `livreur`), ou sans compte (6 b, un
  lien à jeton par tournée — frontière de sécurité neuve).
- La preuve : le code de retrait envoyé **par e-mail** au contact de livraison,
  **au départ** ; sinon, dépôt avec **photo obligatoire**. Le code n'est
  **jamais** sur le sac.
- Le scan du code vaut signature ; sinon, tracé au doigt et nom tapé.
- Un geste, une transaction : `delivery` déclare un port que `handover`
  implémente (L6-C7). Les preuves sont des pièces du retrait (L6-C9).
- Le snapshot du départ se garde 90 jours.
- Qui compose affecte le livreur.

## Ce qui bloque, avant même de bâtir

- 🔴 **Les livraisons ratées (6 c)** : relivrer, retrait au comptoir, annuler.
  **Aucun** des trois gestes n'existe au commerce, et deux remboursent : ils
  supposent les **avenants** (`../order/architecture-commande-immuable-avenants.md`,
  doc-first depuis le 2026-08-10). Proposé à Hugo et non tranché : un 6 c-1
  « relivrer le jour X, sans nouveaux frais », les deux autres plus tard.
- Sans 6 c, une livraison ratée reste bloquée (L6-C14) : le 6 a ne part pas en
  production seul.

## Ce qui en dépend et reste éteint en attendant

- L'alarme de retard en livraison (`latenessOf`) : sans remise attestée à la
  porte, toute livraison serait « en retard » après sa fenêtre.
- Le lot 5 (tranche horaire promise), qui la rallume.

## Les pièces de remise : conservées sans limite, purgeables (Hugo, 2026-10-01)

> « Pour l'instant infini, mais câbler la possibilité d'une purge, et noter en
> TODO que ça peut être purgeable. »

- **Aujourd'hui** : `production.order_handover_proof` (nom du réceptionnaire,
  photo, signature, livreur) et ses images sont gardées **sans limite**.
- **Câblé, non planifié** (lot « purge des pièces », après B2) : une commande
  qui efface les pièces plus anciennes qu'une durée donnée — la ligne **et**
  les images au stockage —, et l'effacement des pièces d'une commande à la
  demande d'une personne. Aucune minuterie ne l'appelle.
- **À décider plus tard** : la durée (90 jours proposés, plus si les litiges
  le demandent), l'appel planifié, et ce qu'un écran de contestation montre
  d'une pièce purgée.
