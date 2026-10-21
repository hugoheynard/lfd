# Plan — le réapprovisionnement d'un site

> **État au 2026-10-21 : partiel.** La **réception** est bâtie (agrégat
> `ResupplyReceipt`, `b2b/resupply/`, et la page Comptoir › Réassort boutique —
> [`plan-jour-meme-sur-stock.md`](../../limites-de-commande/plan-jour-meme-sur-stock.md)
> §7), ainsi que le réglage « soumis à l'heure limite / sans limite », stocké
> sans effet. Restent : la **commande au fournil** (`SiteResupply`, lots R1–R5)
> et son branchement aux lecteurs du fournil, du colisage et du transfert ; la
> décision A/B est tranchée en B (§9).
>
> **Doc-first d'origine, 2026-10-14.** Planifié par Hugo
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

## 7. Contradiction de `vitruve` (2026-10-14) — le §3 est à refaire

L'option B a été chiffrée trop bas. Toute la chaîne aval est **en forme de
commande**, et un réapprovisionnement qui y entre par un identifiant préfixé
en devient un discriminant implicite :

- `ProducibleOrder` exige `fulfillmentMethod` (`pickup` | `delivery`),
  `clientele`, `customerLabel` ;
- `production.day_closed`, `production.packing_list_drawn` et la table
  `packing_order` (clé `(service_day, order_id)`, `fulfillment_method` non
  nul) supposent une commande ;
- `packing.order_packed` → `MarkOrderReadyCommand` lève
  `OrderReferenceNotFoundError` sur un id inconnu : un abonné durable en
  lettre morte à chaque réapprovisionnement colisé ;
- le rangement au transfert lit `TransferOrdersReader` (commandes seulement)
  et part du fait `commerce-order-placed` ; il faut un fait neuf et son
  annulation, et l'ordre des verrous de `OrderWithdrawalDesk` ;
- l'échéance du transfert vit dans `delivery` : le commerce la lirait par un
  port à nommer.

Et deux promesses fausses : les « quantités et multiples » de l'article
**n'existent pas** (`OrderLine` ne vérifie qu'un entier > 0) ; l'heure limite
est indexée par point de retrait et jour de semaine, et la limite par
article se lit par **audience** (`pro` | `public`), qu'un réapprovisionnement
n'a pas. `lint:price-door` ne tiendrait pas l'absence de champ monétaire.

**Suite** : mesurer honnêtement ce que coûterait l'option A (où une commande
compte de l'argent : chiffre d'affaires, facturation, règlement), puis
re-trancher Q-R1 avec un champ `kind` explicite au contrat dans les deux cas.

## 8. L'option A mesurée (2026-10-14)

Lecture du code (exploration, lignes citées dans l'échange du jour) : une
commande touche l'argent ou le client à **20 endroits** — 16 points de
changement, 4 contraintes de l'agrégat. **6** se règlent par un filtre unique
(`revenueWhere`, `billableOrderWhere`, l'écrivain du journal `order.placed`,
le volume par SKU des paliers, `earningFor`, le courriel « prête ») ; **10**
demandent une branche. **10 sont dangereux** : un oubli y compte un faux
chiffre d'affaires, **facture ou prélève réellement** une société
(`billableOrderWhere`), ouvre une intention Stripe (`settleOrder`) ou envoie un
courriel. Et l'agrégat `Order` calcule toujours prix, TVA et total : A exige
une branche dans l'agrégat lui-même.

|                    | A — une commande                                    | B — un agrégat à part                                  |
| ------------------ | --------------------------------------------------- | ------------------------------------------------------ |
| Endroits à toucher | ~20                                                 | ~8 (3 faits durables, 4 abonnés, réception/annulation) |
| Un oubli…          | se tait : faux revenu, vraie facture, vrai courriel | crie : abonné en lettre morte, visible à la santé      |
| Argent             | partout                                             | nulle part                                             |

**Recommandation maintenue : B**, avec un **genre explicite** (`kind:
order | resupply`) au contrat de ce que le fournil produit et dans les faits
`production.*` / `packing.*`, plutôt qu'un identifiant préfixé.

## 9. Décision de Hugo (2026-10-21) : B

« Pas de prix, part sur B. » Le réapprovisionnement d'un site est un **agrégat
à part** (`SiteResupply`), jamais une commande : pas de prix, pas de TVA, pas
de règlement, pas de chiffre d'affaires. Le coût est de le brancher dans les
lecteurs du fournil, du colisage et du transfert (§3), le jour où il sera
commandé au fournil. La **réception** au comptoir (lignes produit, quantités
reçues, stock estimé du jour) est bâtie avant la commande, le 2026-10-21 —
voir [`../../limites-de-commande/plan-jour-meme-sur-stock.md`](../../limites-de-commande/plan-jour-meme-sur-stock.md).
