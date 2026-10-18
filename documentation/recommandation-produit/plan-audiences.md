# Plan — les audiences de la clientèle

> 📐 **Doc-first, rien n'est bâti** (Hugo, 2026-10-18 : « on trie les
> audiences alors ? », puis « fais le plan des audiences »). Après le lot R0 de
> [`plan-recommandation-de-produits.md`](plan-recommandation-de-produits.md).
> Chaque affirmation sur l'existant a été **ouverte le 2026-10-18** ; ce qui ne
> l'a pas été est dit « non vérifié ».
>
> **Hors argent, hors migration de données, hors frontière de sécurité** : pas
> de `vitruve` d'office (CLAUDE.md §9 bis). Le seul point sensible est le
> passage de l'agrégé à la personne (§5) — il est exclu de ce plan.
>
> ✅ **A1 bâti le 2026-10-18** (non commité à l'écriture de ces lignes) :
> le tableau des segments sûrs, décrit au présent dans
> [`audiences.md`](audiences.md). Ce qui a été lu pour le bâtir est au §8 ;
> le regroupement NAF y attend la décision de Hugo (Q4). A2–A4 restent.
>
> **Relu le 2026-10-18 au soir** : R0, dont dépend A1, est bâti (les compteurs
> d'audience anonymes de `growth`) ; rien de ce plan ne l'était alors. Ne pas confondre
> ces segments de **clientèle** avec l'**audience d'un article** (`pro`,
> `public`, `both`), qui dit à qui il est vendu, ni avec celle d'une règle du
> staff ([`suggestions-du-staff.md`](suggestions-du-staff.md)), qui dit à qui
> elle s'adresse.

## 1. Ce qu'on veut

Décrire la clientèle **par ce qu'elle fait** — où, quand, comment, quoi — en
segments **agrégés**, pour deux usages :

1. **Lire** : un tableau de bord au back-office (panier moyen, rayons, heures
   fortes, par segment) ;
2. **Calculer** des suggestions collectives par segment (« souvent pris avec,
   chez les vacanciers »), sous le seuil d'anonymat de
   [`historique-du-particulier.md`](historique-du-particulier.md) §1 bis.

Pas d'âge, pas de sexe, aucune déduction de ce que la personne **est** à partir
de ce qu'elle achète.

## 2. Les segments, et d'où ils viennent

| Segment                                | Source aujourd'hui                                                                                                                                                                    | Fiabilité                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Pro / particulier**                  | `Order.companyId` optionnel : présent = commande d'entreprise (`apps/lfd-api/prisma/schema/public/orders.prisma`, bloc « Tenancy »)                                                   | **sûre**                                                                         |
| **Activité du pro**                    | `Company.nafCode`, résolu depuis le SIRET, vide par défaut (`public/account.prisma:106-109`)                                                                                          | sûre quand renseignée ; regroupement NAF → « hôtel, restaurant, café… » à écrire |
| **Retrait / livraison**                | `Order.fulfillmentMethod` (`orders.prisma:143`)                                                                                                                                       | **sûre**                                                                         |
| **Site de retrait, zone de livraison** | **lu au lot A1 (§8)** : le site dans `pickupAddress` (`orders.prisma:153`, `siteId`), la commune dans `deliveryAddressSnapshot` (`:151`) ; `fulfillment` (`:186`) ne porte aucun lieu | **sûre** (site : absent des commandes d'avant les sites)                         |
| **Fidèle / régulier / de passage**     | nombre de commandes par personne ou société sur la période                                                                                                                            | **sûre** (dérivée)                                                               |
| **Moment** (jour, heure, créneau)      | `Order.createdAt` et le jour de retrait                                                                                                                                               | **sûre**                                                                         |
| **Résident / saisonnier / vacancier**  | **rien de fiable aujourd'hui** — voir §3                                                                                                                                              | à construire                                                                     |

## 3. Résident, saisonnier ou vacancier — le segment qui compte le plus

À Val d'Isère, c'est sans doute la coupe la plus utile, et c'est la seule
qu'on n'a pas.

**Ce qu'on n'a pas** : la langue choisie dans la boutique n'est enregistrée
nulle part (aucune colonne `locale` dans les schémas `public`, seul
`shop-copy.prisma:35` en porte une, pour les textes ; vérifié le 2026-10-18).
L'indicatif du téléphone est dans `users.phone` (`account.prisma:389`), texte
libre.

**Deux voies, cumulables :**

- **(a) Demander, une fois, facultativement.** Une question à l'inscription ou
  après la première commande : « Vous êtes : résident à l'année · saisonnier ·
  en vacances ». Fiable, simple, annoncée dans la politique de
  confidentialité (« pour mieux comprendre notre clientèle »), jamais
  obligatoire, modifiable dans Mon profil. **Recommandée.**
- **(b) Estimer.** Indicatif étranger, rythme « une semaine de commandes puis
  plus rien », livraison à une adresse d'hôtel ou de chalet. Utile pour ceux
  qui ne répondent pas, mais c'est une **estimation**, et le tableau de bord
  doit l'afficher comme telle (« estimé »), jamais la mélanger à la réponse.
  Enregistrer la **langue de la commande** (une colonne sur la commande, pas
  sur la personne) rendrait l'estimation bien meilleure, pour un coût minime.

## 4. Le modèle

- **Lecture seule, à la demande d'abord** : des queries CQRS qui agrègent les
  commandes de la période par segment, sous le mur pour ce qui touche une
  société (CLAUDE.md §3). Précalcul seulement si une mesure le justifie.
- **Les segments d'une personne ne sont jamais stockés** pour la viser. Le
  segment se calcule dans l'agrégat et disparaît avec lui. La seule donnée
  nouvelle par personne est la **réponse** à la question (a), qu'elle a donnée
  et qu'elle peut changer.
- **Seuil d'affichage** : une case du tableau (segment × période) qui compte
  moins de 5 clients distincts s'affiche « trop peu de clients », pas un
  chiffre — même règle que les suggestions collectives.
- **Où ça vit** : `b2b/` (tout est commerce). Les agrégats précalculés, s'il y
  en a un jour, vont dans le schéma `growth`, à côté des compteurs de R0
  (décision du 2026-10-18).

## 5. Ce que ce plan ne fait pas

- **Viser une personne par son segment** (lui montrer autre chose parce
  qu'elle est « vacancière ») : c'est du profilage — information, base légale
  et droit d'opposition, comme « vos habituels ». Hors de ce plan.
- **Âge, sexe, revenus** : ni demandés ni déduits.
- **Outil de marketing** (sources de trafic, parcours) : Plausible ou Matomo,
  plus tard, séparément ([`historique-du-particulier.md`](historique-du-particulier.md) §1 bis).

## 6. Lots

| Lot    | Contenu                                                                                                                                                                                        | Dépend de |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **A1** | Lire le contenu de `fulfillment` et de l'adresse figée ; tableau de bord des segments **sûrs** (pro/particulier, activité, retrait/livraison, site/zone, fidélité, moment) ; seuil d'affichage | R0        |
| **A2** | La question facultative « résident · saisonnier · vacancier », posée **plus tard par e-mail ou notification** (Hugo, 2026-10-18), modifiable dans Mon profil + la phrase de la politique       | campagne  |
| **A3** | La langue de la commande (colonne additive) et l'estimation affichée « estimé »                                                                                                                | Q3        |
| **A4** | Les suggestions collectives par segment (« souvent pris avec, chez les pros »), sous le seuil                                                                                                  | A1, R2    |

## 7. Questions à Hugo

> **Tranché le 2026-10-18 (Hugo) — Q1 et Q2** : **pas de question dans le
> parcours** (ni à l'inscription, ni après la première commande). La question
> « résident · saisonnier · vacancier » viendra **plus tard**, par une
> **campagne d'e-mails** ou une **notification ponctuelle** dans l'application.
> A2 change donc de forme : un canal à choisir le moment venu, la même réponse
> facultative et modifiable dans Mon profil, la même phrase dans la politique.
> D'ici là, le segment n'existe qu'**estimé** (A3), affiché comme tel.
>
> **Q3 tranchée le 2026-10-18 (Hugo) : oui**, la langue de chaque commande est
> enregistrée (A3). **Q4** : une **proposition** est écrite au lot A1 (§8.2),
> bâtie telle quelle ; elle attend la validation de Hugo.

1. **La question « résident · saisonnier · vacancier » : oui ?** _Recommandation :
   oui, facultative._ C'est le seul moyen fiable, et elle ne coûte qu'un clic.
2. **Où la poser — à l'inscription, ou après la première commande ?**
   _Recommandation : après la première commande_, sur l'écran de
   confirmation : le client a déjà obtenu ce qu'il voulait, on ne freine pas
   l'inscription.
3. **Enregistrer la langue de la commande ?** _Recommandation : oui_ — une
   colonne sur la commande, utile aussi au service (répondre dans la langue du
   client).
4. **Le regroupement des codes NAF** en familles d'activité (hôtellerie,
   restauration, café-bar, commerce…) : on le décide ensemble au lot A1.

## 8. Le lot A1 — ce qui a été lu, et la proposition NAF

### 8.1 Ce que portent les colonnes figées (lu le 2026-10-18)

| Colonne                                   | Ce qu'elle porte                                                                                                                                                               | Lu dans                                                                                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `orders.fulfillment` (Json)               | **aucun lieu** : la tranche demandée, le contact et l'exigence de signature, chacun avec sa provenance (`default` / `override`)                                                | `packages/contracts/src/order.ts:545-563` (`OrderFulfillment`, `orderFulfillmentSchema`) ; écrit par `prisma-order.repository.ts:109`                                     |
| `orders.pickup_address` (Json)            | les champs postaux du point (`label`, `ligne1`, `ligne2`, `codePostal`, `ville`, `pays`) **et `siteId`**, facultatif : absent des commandes d'avant le lot S2, jamais rattrapé | `packages/contracts/src/pickup.ts:115-117` (`pickupSnapshotSchema`), `address.ts:258-268` ; écrit par `order-drafting.service.ts:486` et `prisma-order.repository.ts:107` |
| `orders.delivery_address_snapshot` (Json) | les champs postaux livrés (`label`, `ligne1`, `ligne2`, `codePostal`, `ville`, `pays`) ; la zone tarifée (`delivery_zone_id`) se **déduit** du code postal                     | `packages/contracts/src/address.ts:258-268` (`billingAddressPayloadSchema`) ; écrit par `order-drafting.service.ts:497-512` et `prisma-order.repository.ts:103`           |
| `companies.naf_code`                      | le code NAF résolu depuis le SIRET (`56.10A`), vide tant qu'inconnu                                                                                                            | `apps/lfd-api/prisma/schema/public/account.prisma:106-109`                                                                                                                |
| `order_lines.line_total_cents`            | le total HT de la ligne en **centimes** (le prix unitaire est en millicentimes, et n'est pas lu)                                                                               | `orders.prisma`, modèle `OrderLine`                                                                                                                                       |

Donc : le **site de retrait** se lit sur `pickup_address->>'siteId'` (nommé par
son `label`), la **zone de livraison** sur `delivery_address_snapshot->>'codePostal'`
(nommée par sa `ville`). `fulfillment` ne sert à aucune coupe.

### 8.2 Le regroupement NAF proposé (Q4, à valider)

| Famille                 | Codes NAF rév. 2                                           |
| ----------------------- | ---------------------------------------------------------- |
| Hôtellerie              | 55.xx — hôtels, hébergement touristique, campings          |
| Restauration            | 56.1x, 56.2x — restaurants, rapide, traiteurs, cantines    |
| Café, bar               | 56.30Z — débits de boissons                                |
| Commerce alimentaire    | 47.11, 47.2x — magasins ; 10.71 — boulangeries-pâtisseries |
| Autre activité          | tout autre code renseigné                                  |
| Activité non renseignée | code vide, ou commande pro sans société                    |

Deux choix à confirmer : **10.71** (boulangerie artisanale, section
« industrie ») rangé en commerce alimentaire, parce que c'est un revendeur de
fait ; et **56.21Z** (traiteurs) en restauration plutôt qu'à part.

### 8.3 Décisions prises au lot, faute de les trouver dans le plan

- **Commandes saisies par l'équipe : gardées** (RS6 les écarte : elles n'ont vu
  aucune suggestion ; ici elles disent qui commande).
- **Règlement** : une carte en attente, refusée ou remboursée est écartée,
  comme dans le CA de la croissance — le tableau chiffre un CA.
- **Pro ou particulier** : `orders.clientele`, et pour une commande d'avant la
  colonne, la présence d'une société.
- **Moment** : cinq tranches (nuit 0–7 h, matin 7–11 h, midi 11–14 h,
  après-midi 14–18 h, soir 18 h–minuit).
