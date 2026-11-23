# TODO — `Order`, l'entonnoir unique de toute commande

**État : 📝 à faire, pas planifié.** Noté le 2026-11-23 à la demande de Hugo,
pendant la commande offerte (`passation/plan-commande-offerte.md`). À ouvrir
**après** la commande offerte, qui servira de premier cas éprouvé.

## Le constat (mesuré le 2026-11-23)

`Order` (`apps/lfd-api/src/lafoliecoffee/orders/domain/entities/order.ts`)
est le seul passage de toute commande, quelle que soit sa porte : le client,
la saisie de l'équipe, la boutique, le comptoir, la révision. Toute règle
nouvelle doit donc y entrer, même quand une seule porte s'en sert.

| Mesure                                      | Valeur              |
| ------------------------------------------- | ------------------- |
| Champs de l'entrée (`DraftOrderInput`)      | 28                  |
| Champs de la sortie écrite (`OrderToPlace`) | 54                  |
| Arguments positionnels du constructeur      | 27                  |
| Lignes de `order.ts`                        | 604 (règle : ≲ 300) |
| Fichiers de production qui l'appellent      | 4, toutes portes    |

La commande offerte, qui ne concerne que la saisie de l'équipe, a traversé six
fichiers : l'entrée, l'agrégat et son constructeur, la sortie, le dépôt de la
passation, celui de la révision, et le chargeur de la révision. Le bon, la
surtaxe de retard, l'engagement budgétaire, la marque « sur stock » et le
franco ont pris le même chemin.

## Ce que ça dit du modèle

Une seule classe joue trois rôles, et chaque règle neuve touche les trois
alors qu'elle n'appartient en général qu'à un seul :

1. **le calcul** — la suite des règles de prix, de remises, d'offre ;
2. **les invariants de la passation** — acheminement, payeur, stock ;
3. **la forme d'écriture** — les 54 colonnes.

`Order` est en fait une **fabrique de composition** : une fois composé, il ne
change presque plus (`deferPayment`, `payByCard`). Le cycle de vie d'une
commande est ailleurs : la révision (`RevisableOrder`), l'annulation, le
départ incomplet, les projections de paiement du dépôt.

## La direction envisagée (à vérifier dans un plan, puis par `vitruve`)

- **Des morceaux nommés plutôt qu'une liste plate** : montants, acheminement,
  origine de la saisie (équipe, comptoir, offre), règlement. Une règle de plus
  ajoute un champ dans le bon morceau, pas un argument au constructeur.
- **Des règles qui se branchent** : le calcul comme une suite de règles qui
  prennent des montants et rendent des montants (l'offre, `offeredAmountsOf`,
  en est déjà une). Une porte ajoute la sienne sans que les autres la voient.
- **Une écriture par morceau** : chaque morceau a son mappeur de colonnes,
  comme `order-offer.columns.ts`, au lieu d'un bloc unique.

`vitruve` est obligatoire : le chantier touche le calcul de l'argent et
l'écriture en base de toute commande.

## L'export des ventes : l'alerte d'usage (2026-11-23)

Le plan [`export/plan-export-des-ventes.md`](export/plan-export-des-ventes.md)
voulait prévenir le staff d'un usage inhabituel d'une clé d'export. Rien ne
garde l'IP ni la clé d'un appel. Possible sans écriture nouvelle : une tâche
planifiée du bloc `ops` qui lit chaque heure le trafic de la surface
`exports/sales` (Analytics Engine, `gateway/src/traffic.ts`) et sonne la cloche
au-delà d'un seuil (plus de 10 succès en 24 h, ou une rafale de 401 / 429). Elle
ne dira ni quelle clé ni quelle adresse : un vrai journal d'accès est l'autre
voie. À décider par Hugo.
