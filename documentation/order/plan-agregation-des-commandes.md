# L'agrégation des commandes — le relevé avant la facture

> 🟡 **Plan v2 — A1, A2 et la vue payeur bâtis le 2026-10-05** (`c46572f` et
> suivant) ; A3 attend S4. Contredit par `vitruve` le
> même jour : une objection BLOQUANTE, quatre SÉRIEUSES, reprises au §6.
> Prérequis de la facturation des
> sous-comptes ([`../b2b/comptes-client/plan-sous-comptes.md`](../b2b/comptes-client/plan-sous-comptes.md),
> S4), et premier pas vers la facture.
>
> 🔴 **Décision de Hugo, 2026-10-05** : « c'est nous qui allons produire le
> document facture. On est encore libres jusqu'en 2027, mais pour l'instant
> fais plutôt les vues "agrégation des commandes" ; on fera la facture plus
> tard. » Cette décision **remplace** celle du 2026-09-10 (« le comptable
> importe nos commandes et sort la facture »), écrite dans
> [`todo-export-des-commandes-pour-le-comptable.md`](todo-export-des-commandes-pour-le-comptable.md).
>
> Touche **l'argent** (totaux HT, TVA par taux, TTC) : passe par `vitruve`
> avant Hugo.

## 0. Ce qui existe (relu le 2026-10-05)

- **La commande fige déjà tous ses montants** (`orders.prisma`) :
  `subtotal_cents`, `discount_cents`, `voucher_discount_cents`,
  `delivery_fee_cents`, `late_fee_cents`, `vat_cents`, **`vat_shares`** (la
  ventilation par taux, figée), et `total_cents` (TTC). Chaque ligne porte
  son taux (`vat_rate`) et ses totaux.
- **L'arrondi de la TVA est fait une fois**, dans `ventilateVat`
  (`@lfd/money`). Il proratise les extras (livraison, surtaxe de retard)
  entre les taux. Personne ne doit resommer la TVA depuis les lignes : on
  n'obtiendrait pas nos chiffres (`todo-export-des-commandes-pour-le-comptable.md`).
- **L'assiette du prélèvement** (`BillableOrdersReader`) rend des **sommes
  par société** sur un cycle. Le relevé a besoin des **commandes une par
  une**, avec le même critère.
- **Le cycle** va d'une clôture à la suivante (`billing-cycle.ts`). Aucune
  clôture n'est encore enregistrée : ce sera le travail de S4-0.
- **Aucune vue** ne montre aujourd'hui « ce que ce client doit pour ce mois ».

## 1. Ce qu'on construit : un relevé, pas une facture

Un **relevé de cycle** liste, pour **un payeur** et **un cycle**, les
commandes passées au compte et leurs totaux. Il n'a ni numéro légal ni
mentions de facture. Il sert à trois choses :

1. **Lire** ce qu'un client doit, cycle par cycle, en admin et côté client ;
2. **Rapprocher** le montant prélevé des commandes qui le composent ;
3. **Préparer** la facture : le jour où on l'émettra, elle sera ce relevé,
   plus un numéro et des mentions légales.

### 1.1 La maille

| Niveau       | Contenu                                                                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Commande** | date, référence, site de livraison (nom du sous-compte), HT, remises, livraison, surtaxe de retard, TVA par taux (**`vat_shares` lu tel quel**), TTC      |
| **Groupe**   | un par site si le site a la **facturation séparée**, sinon un seul pour le payeur. Totaux = **sommes des commandes**, jamais recalculés depuis les lignes |
| **Relevé**   | payeur, cycle, groupes, total TTC du cycle, TVA totale par taux                                                                                           |

🔴 **Sommer des `vat_shares` par taux est permis ; recalculer une TVA ne
l'est pas.** Le total d'un taux est la somme des parts déjà arrondies des
commandes. On n'applique jamais un taux à une base agrégée. C'est la
condition pour que le prélèvement, le relevé et la facture future tombent
sur le même centime.

**Une commande sans ventilation.** `vat_shares` vaut `null` pour les
commandes antérieures au 2026-09-07, qui n'ont volontairement pas été
rétro-remplies (`orders.prisma:204-213`). `prisma-order.reader.ts:558` rend
aussi `null` pour un JSON mal formé. Une telle commande n'est **ni exclue ni
re-ventilée** : son `vat_cents` va dans une ligne « **TVA non ventilée** »
du relevé, et le relevé le dit. La TVA totale reste donc égale, au centime,
à Σ `vat_cents`. Le test de A1 contient une commande avec `vat_shares` à
null.

**La clé d'un taux** est le `rate` numérique de `vat_shares`, produit par
`ventilateVat` (`packages/money/src/vat.ts:50-54`). On ne regroupe **jamais**
sur le `Decimal(5,2)` des lignes : `5.50` n'est pas `5.5`.

**Le HT** d'une commande = `subtotal_cents − discount_cents −
voucher_discount_cents`, avec la livraison et la surtaxe de retard en
colonnes à part. Chaque colonne est lue telle quelle sur la commande.

**Le périmètre** est celui de l'assiette du prélèvement (`not_required ∧
total > 0`, `PrismaBillableOrdersReader`) : les commandes payées par carte,
les commandes gratuites et les particuliers n'y sont **pas**. Le relevé et
le CSV ne couvrent donc pas tout le chiffre d'affaires, et le disent dans
leur en-tête.

### 1.2 Le payeur et le groupe

- **Payeur** : `COALESCE(billed_company_id, company_id)`, la commande figée
  (sous-comptes, S4). **Avant S4** (bâti le 2026-10-05, Hugo veut voir le
  rendu) : le payeur est résolu à la date de la commande sur
  `company_follows` (un site qui suivait `billing` à cette date est payé par
  son principal), dans **un seul** endroit, `billed-payer.ts`, que S4
  remplacera par la colonne figée. Le relevé d'un principal a un groupe
  par site et un sous-total ; celui d'un site porte « payé par ».
- **Groupe** : le sous-compte de la commande, si ce site a la facturation
  séparée **à la date de la commande** (décision datée, comme les autres).
  Sinon, le groupe du payeur.

## 2. Les vues

| Où                                           | Qui                                      | Ce qu'elle montre                                                                                                                                               |
| -------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fiche client → Facturation** (admin)       | `b2b_accounting` ou `b2b_companies:read` | le relevé du cycle choisi, avec un sélecteur de cycle. Pour un principal : un groupe par site, les entités rattachées listées à part avec un lien, sans montant |
| **Espace client → Mes relevés** (plateforme) | `owner`, `admin`, `billing` du payeur    | le même relevé, en lecture. Un site sans facturation séparée ne voit que **ses** commandes, sans le total du principal                                          |
| **Export CSV** (admin)                       | `b2b_accounting`                         | une ligne par commande, avec `total_cents`, `vat_cents`, `vat_shares` détaillé par taux, livraison et surtaxe séparées, site, payeur, cycle                     |

La colonne **état** (« dans le lot », « écartée », « prélevée ») n'apparaît
qu'une fois S4-0 bâti (`order_collection`). Avant, la vue montre les montants
sans état, et le dit.

**Provisoire jusqu'à S4-0.** Avant que le lot soit figé, le relevé est
**recalculé à chaque lecture** : une commande annulée après coup
(`failAtClosing`, `markAbandoned`, `prisma-order.repository.ts:253-290`) en
sort, même si elle a été montrée. L'écran porte donc la mention « relevé
provisoire ». Après S4-0, le relevé d'un cycle constitué lit le **lot
figé**, et une annulation postérieure s'y montre comme un **écart**, pas
comme une disparition.

**Les cycles.** Avant S4-0, aucun cycle passé n'est enregistré, et
`cycleAt` ne sait calculer que le cycle en cours. Le sélecteur propose donc
des **mois civils** (du 1er au 1er), ce qui est exactement le cycle par
défaut. S4-0 devra poser sa **première** clôture enregistrée sur un 1er du
mois, pour qu'aucune commande déjà affichée ne change de relevé. C'est une
contrainte que S4-0 hérite de ce plan.

**Le mur côté client.** Le `where` porte la société **déclarée** par la
requête, résolue par le mur actuel, et jamais une société lue ailleurs :

- un membre d'une société voit les commandes **de cette société** ;
- après S4, un membre du **payeur** voit aussi les commandes facturées à
  lui (`billed_company_id`), groupées par site. C'est la vue « payeur »,
  réservée à `owner`, `admin` et `billing` du payeur.

## 3. Ce que ce plan ne fait pas

- **Pas de facture** : ni numéro légal, ni série continue, ni mentions, ni
  PDF signé. Elle viendra par-dessus le relevé, avant l'échéance de 2027.
  ⚠️ **La facture ne sera pas « le relevé + un numéro »** (Hugo,
  2026-10-05) : une commande réglée **par carte** est hors du relevé, qui ne
  montre que ce qui reste à prélever, mais elle doit être facturée elle
  aussi, au nom du payeur, avec la mention « réglée ». Le lot facture
  élargit donc le périmètre au-delà de l'assiette du prélèvement.
- **Pas d'avoir** : une commande annulée après coup sort simplement du
  relevé si elle est `cancelled`. Le traitement comptable d'une annulation
  après prélèvement attend la facture et S4-0.
- **Pas de format d'import** pour un logiciel tiers : le CSV est un export
  de lecture.

## 4. Les lots

| Lot    | Contenu                                                                                                                                                                                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A1** | port `cycleOrders(payerId, cycle)` (commandes une par une, même critère que l'assiette) ; agrégation pure (groupes, totaux par taux à partir des `vat_shares`) ; route admin ; export CSV ; tests, dont un relevé dont la TVA totale égale au centime la somme des `vat_cents` |
| **A2** | onglet Facturation de la fiche client (sélecteur de cycle, groupes par site)                                                                                                                                                                                                   |
| **A3** | « Mes relevés » côté client — **après S4**                                                                                                                                                                                                                                     |

**A1 et A2 se bâtissent avant S4**, par société (`company_id`) seulement :
le groupe par site et la vue payeur arrivent avec S4, qui y branche le payeur
figé et la décision datée « facturation séparée ».

**A3 attend S4.** Ouvert avant, il montrerait au rôle `billing` d'un
sous-compte le relevé de sa propre société. Après S4, il ne verrait plus que
ses commandes sous le payeur : le contrat client changerait de sens entre
les deux.

## 5. Questions pour Hugo

- **Q1 — Le client voit-il ses relevés dans son espace ?** _Défaut : oui,
  en lecture, **après S4** (voir §4)._
- **Q2 — Quel cycle par défaut à l'ouverture de l'onglet ?** _Défaut : le
  cycle en cours, avec la mention « en cours, non clos »._
- **Q3 — Un site sans facturation séparée voit-il le total de la
  société ?** _Défaut : non, seulement ses propres commandes._

## 6. Ce que `vitruve` a changé (2026-10-05)

| Objection                                              | Réponse                                                |
| ------------------------------------------------------ | ------------------------------------------------------ |
| BLOQUANT — `vat_shares` null avant le 2026-09-07       | ligne « TVA non ventilée », jamais re-ventilée (§1.1)  |
| SÉRIEUX — rapprochement sans mécanisme, relevé mouvant | « provisoire » avant S4-0, écart après (§2)            |
| SÉRIEUX — aucun cycle passé énumérable                 | mois civils ; première clôture de S4-0 sur un 1er (§2) |
| SÉRIEUX — A1/A3 avant S4                               | A3 après S4 ; A1 par société seulement (§4)            |
| SÉRIEUX — mur client contradictoire                    | société déclarée ; vue payeur après S4 (§2)            |
| MINEUR — HT, périmètre, nom du reader, clé de taux     | §1.1                                                   |
