# Plan — le réapprovisionnement d'un site

> **État : 📐 doc-first, 2026-10-14.** Rien n'est bâti. Planifié par Hugo
> (« oui planifie le réassort après ») à la suite du transfert interne
> ([`plan-transfert-interne.md`](plan-transfert-interne.md)), qui lui a déjà
> réservé sa place : l'élément de transfert de genre `resupply`, le cadre
> « Réapprovisionnement » du colisage, le format de ligne du manifeste.
>
> Chaque affirmation sur l'existant est datée et a été ouverte le 2026-10-14 ;
> ce qui ne l'a pas été est marqué « non vérifié ».

## 1. La demande

Hugo, 2026-10-13 : un même transfert porte « des commandes pour le retrait
village **et** le réassort boutique » ; le réassort, « c'est facile, c'est
comme une commande mais au niveau du site, j'imagine pour l'instant avec les
mêmes limites produit pour simplifier ». Vocabulaire tranché le même jour :
**réapprovisionnement** (`resupply`), jamais « réassort » dans le code.

Hugo, 2026-10-14 : voir dans la démo une tournée de début d'après-midi qui
porte du réapprovisionnement.

## 2. Ce qui existe (vérifié le 2026-10-14)

- `delivery_internal_transfer_item` accepte `kind = 'resupply'` avec un
  `resupply_id` **opaque**, sans clé étrangère ; aucun écrivain ne le produit.
- Le manifeste du transfert a une section « réapprovisionnement » au même
  format de ligne (SKU, libellé, quantité) que les commandes ; elle est vide.
- Le colisage a un cadre `replenishment` dans le cadre du transfert
  (`packing-frames.ts`), alimenté par un argument que rien ne fournit.
- La production ne connaît une commande que par un identifiant opaque et un
  snapshot (CLAUDE.md §3) — un réapprovisionnement peut y entrer de la même
  façon.

## 3. La décision structurante : une commande, ou son propre agrégat ?

|                                 | A — une `Order` dont le client est un site                                                                                                            | B — un agrégat `SiteResupply`                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Production, colisage, transfert | gratuits : ils lisent déjà les commandes                                                                                                              | une seconde source à brancher dans chaque lecteur (fournil, colisage, contenu du transfert) |
| Argent                          | une commande porte prix, TVA, règlement, chiffre d'affaires, facturation : il faudrait les neutraliser partout, et chaque oubli compte un faux revenu | aucun : un réapprovisionnement est un mouvement interne                                     |
| Invariants                      | `Order` suppose une société ou une personne, une clientèle `b2b`/`b2c`                                                                                | les siens : un site destinataire, des lignes, un jour                                       |
| Risque                          | **élevé** — touche l'argent à tous les étages                                                                                                         | modéré — touche des lecteurs                                                                |

**Proposé : B.** L'argent est l'endroit où se tromper coûte le plus, et A
demanderait de prouver partout qu'un réapprovisionnement ne compte pas. B
paie en branchements ce que A paierait en exceptions.

## 4. Le modèle proposé (B)

- **Agrégat `SiteResupply`** dans `b2b/resupply/` : `siteId` (un site
  `supply = transfer`), `serviceDay`, lignes `{ sku, label, quantity }`
  copiées du catalogue au moment de la saisie (snapshot, comme une commande),
  état `draft → placed → cancelled`, auteur (staff).
- **Mêmes limites produit que les commandes** (Hugo) : heure limite de la
  journée, quantités et multiples de l'article — lus par les mêmes règles,
  appliqués à la transition `place()`.
- **Aucun prix, aucune TVA, aucun règlement.** Le snapshot ne porte pas de
  champ monétaire (la porte `lint:price-door` le tiendra).
- **Production** : le fournil lit un réapprovisionnement placé comme une
  commande à produire, par son canal (`production/channels/commerce/`) —
  identifiant opaque préfixé, échéance = celle du transfert du site (T0).
- **Transfert** : à la passation (ou à la clôture si la journée est close),
  l'abonné de T2 range le réapprovisionnement dans le transfert prévu du site
  comme il range une commande ; le manifeste lit son contenu.
- **Colisage** : ses colis vont dans les bacs du transfert (Q-T4 révisée) ;
  le cadre `replenishment` reçoit ses éléments.
- **Droit** : une ressource neuve `lfc_site_resupply` (lecture / écriture),
  accordée à l'écran — jamais par migration.
- **Écran** : Réglages ? Non — c'est un geste du jour. Proposé : une entrée
  « Réapprovisionnement » sous Commandes dans le menu principal, une saisie par
  site et par jour, liste d'articles du catalogue avec quantités.

## 5. Lots

| Lot | Taille | Contenu                                                                                                                             | Dépend de           |
| --- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| R1  | M      | agrégat, table `resupply` + lignes (migration additive), ressource `lfc_site_resupply`, commandes placer / annuler, limites produit | —                   |
| R2  | M      | le fournil le produit (canal), le transfert le porte (abonné), le manifeste lit son contenu                                         | R1, transfert T1–T3 |
| R3  | S      | colisage : ses colis au cadre du transfert, dans les bacs du transfert                                                              | R2                  |
| R4  | M      | écran de saisie au back-office                                                                                                      | R1                  |
| R5  | S      | semis : un réapprovisionnement de Val Village l'après-midi de J                                                                     | R2                  |

`vitruve` d'office avant de bâtir : migration et frontière de droits.

## 6. Questions à Hugo

- **Q-R1** — A ou B (§3) ? Proposé : **B**.
- ~~**Q-R2**~~ — ✅ (Hugo, 2026-10-14) : **les deux**. « Le site commande le
  réassort » — c'est le geste normal, fait par l'équipe du site ; « en cas de
  problème, ou si le site appelle, le labo peut enregistrer le réassort pour
  le village ». Conséquence : le réapprovisionnement porte son **auteur** et
  **pour quel site** il est saisi ; l'écran propose d'office le site de qui
  saisit, et laisse le labo choisir le site. **Non vérifié** : le dépôt
  sait-il rattacher un membre du staff à un site ? Si non, R1 commence par un
  droit unique `lfc_site_resupply` (tout détenteur saisit pour tout site), et
  le cloisonnement par site devient une question à part.
- **Q-R3** — Un site servi **sur place** (le Labo) a-t-il du
  réapprovisionnement ? Proposé : non — il se sert au fournil, sans transport.
- **Q-R4** — Un réapprovisionnement récurrent (le même chaque jour), ou saisi
  chaque fois ? Proposé : saisi chaque fois d'abord, gabarit plus tard.
- **Q-R5** — Faut-il en tenir un coût interne (valorisation du stock du
  site) ? Proposé : non pour R1–R5 ; si oui, c'est un plan d'argent à part.
