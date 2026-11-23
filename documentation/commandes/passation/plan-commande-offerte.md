# La commande offerte — l'équipe offre une commande depuis le back-office

**État : 📝 plan ; O0 bâti le 2026-11-23, le reste à bâtir.** Demandé par Hugo le
2026-11-23 : « l'équipe passe une commande offerte depuis le back-office ».
Contredit par `vitruve` le 2026-11-23 : cinq bloquants sur la première version
(une remise de panier « offerte »), tous levés par le changement de forme du
§ 2.2. Les questions comptables sont au § 3 ; elles ne bloquent rien.

---

## Partie 1 — en simple

Aujourd'hui, quand l'équipe saisit une commande pour un client, elle choisit
entre deux façons de la régler : **au compte** (elle sera facturée) ou **par
lien** (le client paie par carte). Il manque une troisième façon : **offerte**.
Ça sert pour une dégustation, un geste commercial, un remplacement après une
réclamation, un échantillon.

Une commande offerte est **une vraie commande** : elle part au fournil, au
colisage, en livraison ou au comptoir, comme les autres. La seule différence
porte sur l'argent : le client ne paie rien, on n'émet aucune facture, et on ne
prélève rien.

Mais on garde **ce qu'elle valait**. La commande se compose d'abord comme si le
client la payait (ses prix, les frais de livraison), puis une ligne « offert »
retranche exactement ce total, taux de TVA par taux de TVA. Trois raisons :

1. la comptabilité doit pouvoir dire combien on a offert, à qui et pourquoi ;
2. au-delà d'un certain montant offert à une même personne dans l'année, la TVA
   déjà déduite devrait être reversée — pour le moment on ne reverse rien, la question est notée au § 3 ;
3. une commande offerte « à 0 € » sans trace de sa valeur cacherait la décision
   prise, ce qu'on refuse pour toute exception de l'équipe.

```mermaid
flowchart LR
    S["Saisie par l'équipe"] --> C{"Règlement"}
    C -->|"au compte"| A["facturée en fin de mois"]
    C -->|"lien"| L["payée par carte"]
    C -->|"offerte + motif"| O["composée au prix du client, puis offert = moins le total"]
    O --> F["fournil, colisage, retrait : comme les autres"]
    O --> N["aucune facture, aucun prélèvement"]
    O --> X["hors des audiences, du panier moyen, des habituels"]
```

Offrir est un **droit à part** : pouvoir saisir une commande ne suffit pas. Ce
droit s'accorde à l'écran des rôles, comme tous les autres.

---

## Partie 2 — technique

### 2.1 Ce qui existe (vérifié le 2026-11-23, et par `vitruve` le même jour)

- `staffSettlementSchema = z.enum(["account", "link"])`
  (`packages/contracts/src/admin-order.ts:48`) ; son JSDoc justifie l'absence
  d'une troisième valeur.
- `PlaceOrderForCustomerHandler` appelle `order.deferPayment()` quand
  `settlement === "account" || order.totalCents <= 0`
  (`place-order-for-customer.handler.ts:293`). `staffSettlementRefusal`
  (`application/services/staff-settlement-refusal.ts`) ne connaît que `account`
  et `link`.
- `settlementRegimeOf` rend `free` pour `not_required` à total nul
  (`orders/domain/services/settlement-regime.ts`). L'assiette du prélèvement
  exige `total_cents > 0` (`accounting/infrastructure/billable-order-criterion.ts`),
  la facture carte écarte `totalCents <= 0` (`outsideCardInvoicing`,
  `accounting/domain/services/card-invoicing.ts`). Le schéma « publique ou
  gratuite → pas de facture » est dans `documentation/commandes/parcours-complet.md`.
- **Les remises de panier ne touchent que les lignes** : `chainBasketDiscounts`
  (`packages/money/src/basket-discounts.ts`) ne remise que les `coveredLines`,
  et `deliveryFeeCents` s'ajoute après. Une remise ne peut donc pas ramener une
  commande livrée à 0. Une remise de panier exige un `promotionId`
  (`DraftBasketDiscount`, `order-shapes.ts`), elle compte dans
  `MAX_BASKET_DISCOUNTS_PER_ORDER = 5`, et elle allume `pickup_discount_eligible`
  sur les lignes couvertes. C'est pourquoi l'offre **n'est pas** une remise.
- La révision (`order-revision.ts`, `revisionOf`) garde `free → ≠free` et
  `account → ≠account`, **pas** `due`/`paid → free`.
- Lisent `not_required` comme une commande réelle : les audiences
  (`AUDIENCE_COUNTED_PAYMENT_STATUSES`, `audiences/domain/audience-scope.ts`),
  le chiffre d'affaires (`REVENUE_PAYMENT_STATUSES`, `growth/domain/revenue-scope.ts`),
  les recommandations (`usuals.ts`, `bought-with.ts`).
- Droit de saisie : `b2b_place_order` (`prisma/schema/public/staff.prisma:67`).
  Un droit neuf s'inscrit aussi dans `packages/contracts/src/staff-access.ts`
  (liste, libellés, dérivation) et `staff-resource-scopes.ts`.
- Les liens `free_charge` (`payments/application/free-charge/`) encaissent un
  montant **sans commande** ; les dérogations (`order-waivers/`) portent l'heure
  limite et la pénalité de retard, pas le prix. Aucun des deux n'offre une
  commande.

### 2.2 Décisions proposées

| #    | Décision                                                                                                                                                                                                                                                                                          | Raison                                                                                                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| O-1  | Troisième valeur `offered` dans `staffSettlementSchema`, toujours sans défaut. Le JSDoc est réécrit au présent.                                                                                                                                                                                   | Offrir est une décision commerciale, au même rang que facturer ou réclamer.                                                                                                          |
| O-2  | **L'offre est un ajustement de commande, pas une remise de panier.** La commande se compose entière par le chemin du client (lignes, remises de clientèle, frais de livraison). L'agrégat ajoute ensuite une ligne d'offre égale à **moins** le montant de chaque taux, déjà arrondi : HT et TVA. | Retrancher des montants déjà arrondis donne 0 exactement, sans nouvel arrondi. Les frais sont couverts. Aucune interaction avec la chaîne, le plafond ni `pickup_discount_eligible`. |
| O-3  | **La composition est celle du client, sans sélection** : promotions comprises, elles consomment leur usage comme sur toute commande. Seul le bon de fidélité reste hors de la saisie de l'équipe, comme aujourd'hui.                                                                              | Décidé par Hugo le 2026-11-23 : « on ne refait pas le calcul de manière sélective ». Une seule arithmétique : la valeur offerte est ce que le client aurait payé.                    |
| O-4  | Colonnes sur `orders` : `offer_nature` (nullable, CHECK contre le registre), `offer_note`, `offered_value_cents` (TTC). Les montants par taux vont dans la table des montants de TVA déjà tenue par la commande, sous une ligne d'offre.                                                          | Un discriminant en SQL : une commande offerte se distingue d'une commande tombée à 0 par une promotion à 100 %. Ce choix ne se défait plus après le premier merge.                   |
| O-5  | Motif obligatoire : nature du registre `ORDER_OFFER_NATURES` (`tasting`, `event`, `goodwill`, `replacement`, `sample`) et texte court.                                                                                                                                                            | Distinct de `FREE_CHARGE_NATURES`, qui qualifie un encaissement sans commande : les deux registres répondent à deux questions et divergeront.                                        |
| O-6  | Nouveau droit `b2b_offer_order` : valeur de `StaffResource` par migration, **jamais accordée par elle**, inscrite dans `staff-access.ts` et `staff-resource-scopes.ts`. `staffSettlementRefusal` refuse `offered` sans ce droit.                                                                  | Règle du § 3 de `CLAUDE.md`, porte `lint:no-role-grants-in-migrations`. La garde vit dans le refus existant, pas à côté.                                                             |
| O-7  | **Révision.** Une commande offerte reste offerte : la révision recompose comme toute révision et recalcule la ligne d'offre (O-2), donc le total reste 0. Elle refuse de rendre offerte une commande qui ne l'était pas, et l'inverse.                                                            | Changer qui paie après coup est une autre décision : annulation, puis nouvelle saisie.                                                                                               |
| O-8  | Fait `lfc.orders.order_offered` à la passation, **et** `lfc.orders.order_offer_revalued` à chaque révision ou annulation qui change la valeur offerte, avec la valeur par taux après le geste.                                                                                                    | Le cumul par bénéficiaire (§ 3) se lit sur le dernier fait de chaque commande, jamais sur une valeur périmée.                                                                        |
| O-9  | **Les lecteurs qui comptent des achats écartent les commandes offertes** (`offer_nature IS NULL`) : audiences, chiffre d'affaires et panier moyen, habituels et « acheté avec ». La fidélité aussi, si elle crédite `not_required` (à vérifier au lot O4).                                        | Une dégustation offerte à un prospect ne le fait pas basculer en client actif, ni n'apprend ses « habituels ».                                                                       |
| O-10 | E-mail de commande passée : « offerte » à la place du montant à régler, sans prix. Bon de livraison : mention « Commande offerte — sans facturation ». Back-office : libellé « Offerte » et motif sur la fiche.                                                                                   | Le client n'a rien à faire. La valeur offerte est un document interne.                                                                                                               |

**Écart découvert, hors de ce chantier** : la révision ne garde pas `due`/`paid
→ free`, alors qu'une commande à lien pourrait devenir gratuite par révision.
Il n'est pas créé par ce plan. Il se ferme à part, avec un test de régression
(cf. `documentation/commandes/modification/modifier-une-commande.md`).

### 2.3 Lots

| Lot | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Tests                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O0  | ✅ bâti le 2026-11-23. Contrat : `offered`, libellés, `ORDER_OFFER_NATURES`, champ `offer` exigé ssi `settlement === "offered"`. L'API refuse `offered` (`OfferedOrderUnavailableError`) jusqu'à O3. Le droit va avec sa migration, en O2 : un droit au contrat sans valeur en base casserait l'écran des rôles.                                                                                                                                                   | Spec du contrat : `offered` sans motif refusé, motif sans `offered` refusé.                                                                                                         |
| O1  | Domaine : ligne d'offre (O-2) posée après la composition complète (O-3), recomposition à la révision (O-7).                                                                                                                                                                                                                                                                                                                                                        | Unitaire : total 0 en retrait **et** en livraison, avec une promotion, avec plusieurs taux, avec un poids au kilo ; révision qui garde 0 ; refus des deux bascules.                 |
| O2  | Migration additive : `b2b_offer_order` (et son inscription dans `staff-access.ts`, `staff-resource-scopes.ts`), colonnes O-4 nullables avec leur CHECK. Passe par `lecteur-de-migrations`.                                                                                                                                                                                                                                                                         | `schema-drift`, `lint:no-role-grants-in-migrations`, `lint:rgpd-staff` si la note nomme une personne.                                                                               |
| O3  | Application : `staffSettlementRefusal`, `PlaceOrderForCustomerHandler`, faits O-8, clé d'intention inchangée.                                                                                                                                                                                                                                                                                                                                                      | Unitaire + e2e : 403 sans le droit, mur tenant, total 0, absente de l'assiette du prélèvement et de la facture carte.                                                               |
| O4  | Lecteurs O-9 et vérification de la fidélité.                                                                                                                                                                                                                                                                                                                                                                                                                       | Un test par lecteur : une commande offerte n'y compte pas.                                                                                                                          |
| O5  | Lectures O-10 : e-mail, bon de livraison, fiche et liste du back-office.                                                                                                                                                                                                                                                                                                                                                                                           | Planche des PDF (`lint:pdf-specimens`), manifeste des e-mails régénéré.                                                                                                             |
| O6  | Écran de saisie : troisième choix, grisé sans le droit, motif obligatoire, total annoncé 0 avec la valeur offerte.                                                                                                                                                                                                                                                                                                                                                 | Spec de composant.                                                                                                                                                                  |
| O7  | **Destinataire libre** (demandé par Hugo le 2026-11-23) : offrir à quelqu'un qui n'est pas dans le système. L'équipe saisit prénom, nom, e-mail ou téléphone, et une adresse de livraison ou un point de retrait. Le destinataire est enregistré par `GuestBuyerRegistrar` (un `User` sans `auth0Sub`, la figure de `architecture-commande-sans-compte.md`), la commande se compose sans société au prix particulier, et seule `offered` est admise sur ce chemin. | e2e : commande offerte sans société, en retrait et en livraison ; refus de `account` et `link` sans société ; un second don à la même adresse e-mail retrouve le même destinataire. |

### 2.4 Ce qui n'est pas fait ici

- **Offrir une partie** d'une commande (une ligne sur trois). La forme O-2
  retranche un total, pas une ligne.
- **Un plafond** par commande ou par mois. Rien n'a été demandé ; le droit à
  part et les faits suffisent pour commencer.
- **Le registre RGPD** pour O7 : un destinataire libre est une personne dont
  on garde des données sans qu'elle ait créé de compte. À traiter au lot O7,
  avec le texte d'information de la commande sans compte.
- **Offrir après coup** une commande déjà payée : c'est un remboursement, par
  le bloc `payment`.

---

## 3. Les questions comptables — notées, non bloquantes

**Décidé par Hugo le 2026-11-23 : on ne reverse aucune TVA pour le moment.**
Ces questions ne retiennent aucun lot. Elles sont écrites pour que la
réflexion ne se perde pas, et pour que le jour où le cabinet répondra, les
données soient déjà là : les faits O-8 gardent, pour chaque commande offerte,
le bénéficiaire, la nature et la valeur par taux après le dernier geste.

Rien dans ce chantier ne calcule, ne déclare ni ne passe d'écriture de TVA
sur les cadeaux.

### 3.1 La TVA sur les biens offerts

Ce que l'on croit savoir, **à faire confirmer par le cabinet** :

- un bien remis sans contrepartie n'est pas une vente, donc pas de TVA
  collectée sur la commande offerte (d'où le total à 0) ;
- en revanche, la TVA **déduite** à l'achat de ce qui a servi à le fabriquer
  (matières, emballages) n'est en principe pas déductible pour un cadeau, et
  devrait être reversée ;
- sauf pour les **cadeaux de faible valeur** : un plafond annuel par
  bénéficiaire, 73 € TTC selon le BOFiP (valeur à vérifier) ;
- les **échantillons** commerciaux suivent en principe un régime à part.

### 3.2 Les questions à poser

- **Q-C1.** Le seuil de faible valeur s'apprécie-t-il sur la valeur de vente
  (ce que les faits O-8 portent) ou sur le coût de revient (que le dépôt ne
  connaît pas aujourd'hui) ?
- **Q-C2.** Faut-il suivre le cumul par bénéficiaire et par année civile, et
  qui est le bénéficiaire : la société, ou la personne pour un particulier ?
- **Q-C3.** Une dégustation, un événement, un échantillon, un remplacement
  après réclamation : lesquels sont des cadeaux au sens fiscal ? Un
  remplacement est peut-être l'exécution de la vente d'origine plutôt qu'un
  don. Le registre O-5 les distingue déjà, pour pouvoir répondre par nature.
- **Q-C4.** Qui passe l'écriture (compte de cadeaux à la clientèle, reversement
  de TVA), à quelle fréquence, et faut-il un état que la comptabilité exporte ?
- **Q-C5.** Une commande offerte à un particulier se traite-t-elle comme une
  dégustation commerciale ou comme un don ?

### 3.3 Ce qu'il faudrait bâtir si la réponse l'exige

Un état annuel « valeur offerte par bénéficiaire et par nature », lu sur les
faits O-8, et un seuil d'alerte. Pas avant la réponse du cabinet.

## 4. Décisions de Hugo (2026-11-23)

- **La ligne « offert » qui met tout à zéro** (O-2) est retenue contre une
  remise de 100 % par article plus la livraison offerte. La TVA facturée est
  nulle dans les deux cas ; la question de la TVA récupérée sur les achats
  (§ 3) ne dépend pas de la façon d'arriver à zéro.

- **Pas de deuxième validation**, quel que soit le montant.
- **Une société non active peut recevoir une commande offerte** : des
  dégustations servent à l'acquisition, donc à des prospects. Le refus
  d'`offered` n'interroge ni le statut de la société ni son crédit, à la
  différence du compte. La saisie exige toujours une fiche de société et un
  acheteur qui en est membre (vérifié le 2026-11-23 dans
  `staff-order-preparation.ts` : le statut n'est lu que pour le lien au
  comptoir). Conséquence : une société non active est servie en clientèle
  particulier (`commande-passee-par-l-equipe.md`, § 2), et la valeur offerte
  est son prix de particulier.
- **Un particulier peut recevoir une commande offerte** : c'est un usage
  attendu (dégustations de mariage, événements), d'où la nature `event`.
- **La valeur offerte est le calcul normal**, promotions comprises (O-3).
  Doute assumé : une promotion à usage limité est consommée par une commande
  que le client n'a pas payée. C'est la conséquence d'un calcul unique ; si
  elle gêne, la réponse sera de ne pas proposer la promotion à la saisie, pas
  de la retirer du calcul.
