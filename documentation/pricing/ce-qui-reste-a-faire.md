# Le prix — ce qui reste à faire

**Vérifié contre le code le 2026-11-11.** C'est le seul registre du dossier :
aucun autre document de `pricing/` ne tient de liste d'ouverts. Chaque ligne
porte le fichier qui la prouve ; une entrée close sort du registre (git la
garde), sauf si elle porte une décision à ne pas défaire (§ 3).

Les identifiants R… sont stables : d'autres documents et le journal de
remédiation les citent.

---

## 1. Les points ouverts

| #       | Gravité | Ce qui casse                                                                                | Preuve                                                                                                                           | Prochain geste                                        |
| ------- | ------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **R16** | 🔴      | Un engagement de portée famille ouvre le palier promis sur chaque article, mesuré par SKU   | `loaded-pricer.ts:440`, `volume-commitment.ts:113`                                                                               | Décision commerciale, puis test rouge et correctif    |
| **R2**  | 🔴      | La simulation rejoue les paliers et les régimes dans le navigateur                          | `simulation/revenue-model.ts:234`, `simulation/pricing-regime.ts:99`                                                             | Conception + `vitruve` (argent)                       |
| **R6**  | 🟠      | L'engagement de volume n'a aucun écran : il se signe en base                                | `admin-volume-commitments.controller.ts:31` ; front : seul le report l'appelle                                                   | Un lot front                                          |
| **R15** | 🟠      | La projection ne reçoit que des cumuls : la courbe peut dépasser la grille des paliers      | `pricing.ts:1570` (`cumulativeQuantities` seul) ; `commitment-bench.ts:123` calcule la quantité sans l'envoyer                   | Contrat additif + lot front                           |
| **R29** | 🟠      | Trois colonnes d'argent dont l'unité n'est tenue par rien                                   | `dev-toolbox/gates/money-units.mjs:289-294`                                                                                      | Type nominal `Millicents` / `Cents` dans `@lfd/money` |
| **P1**  | 🟠      | La saisie de commande liste les articles au prix d'étiquette, pas au prix du client         | `admin-catalog.controller.ts:49` (`ListCatalogQuery`), `commandes/catalog.service.ts:35`                                         | Re-planifier avec une mesure de coût                  |
| **R11** | 🟡      | Le volume prévu appartient au gabarit, pas au client                                        | `pricing.ts:1638`, `entities/price-template.ts`                                                                                  | Conception (voisin de R2)                             |
| **R24** | 🟡      | États inatteignables et colonnes mortes                                                     | `pricing.prisma:50-51`, `price-rule.ts:24,39`, `prisma-company-mercuriale.repository.ts:107`                                     | Retirer, ou donner un geste — pas les deux            |
| **H1**  | 🟡      | Trois écrivains de `catalog_price_history` ; qu'ils écrivent la même chose n'est pas prouvé | `prisma-catalog-item.repository.ts:161`, `prisma-catalog-product-facts.projection.ts:176`, `prisma-catalog-price-retracer.ts:51` | Un test de parité, ou un seul écrivain                |
| **B1**  | 🟡      | Le comparatif des mercuriales : la requête dit « par palier », le domaine sert par client   | `mercuriale-benchmark.query.ts:64`, `domain/services/mercuriale-benchmark.ts:13`                                                 | Aligner le commentaire de la requête                  |
| **R9**  | 🟡      | Jours convertis en minuit UTC hors tarification — aucun défaut avéré                        | [`todo-jours-convertis-hors-tarification.md`](../todos/todo-jours-convertis-hors-tarification.md)                                | Suivi dans ce TODO                                    |
| **R13** | 🔵      | Prix vivant / prix bloqué : la question de fond n'est pas tranchée                          | [`architecture-prix-vivant-prix-bloque.md`](moteur/architecture-prix-vivant-prix-bloque.md)                                      | Une décision de Hugo                                  |

---

## 2. Les points, un par un

### R16 🔴 Un engagement de portée famille

`commitmentOf` (`loaded-pricer.ts:425-447`) choisit l'engagement par portée
(`commitmentFor`, qui accepte `global` et `category` —
`volume-commitment.ts:110-114`), mais mesure le cumul **par SKU**
(`orderedBySku.get(item.sku)`, `:440`). Comme `retainedQuantity` prend
`max(promis, cumul)`, une promesse `category:viennoiserie / 10 000` ouvre le
palier 10 000 sur **chaque** article de la famille : le prix est trop bas dans
le cas courant, trop haut seulement quand le cumul de famille dépasse la
promesse.

La question qui commande la suite est commerciale : **une promesse de famille
se partage-t-elle entre ses articles, ou s'applique-t-elle à chacun ?** Deux
remèdes : mesurer par portée (joindre le catalogue, `order_lines` ne portant
que le SKU), ou rendre la famille inexprimable en bornant la portée d'un
engagement à `product` / `variant` — la moins chère, tous les exemples du
dossier étant par article. Les branches et leur coût :
[journal de remédiation](journal-de-remediation.md) § 7.

### R2 🔴 La simulation rejoue les paliers dans le navigateur

`apps/lfd-backoffice-frontend/src/app/commercial/tarification/simulation/`
résout un prix sans appeler le serveur : `revenue-model.ts:234` et
`pricing-regime.ts:99` divisent un chiffre d'affaires par un volume, et
`pricing-regime.ts` réimplémente les régimes d'engagement. C'est un écran
d'hypothèse — il n'annonce pas un prix facturé —, mais un commercial y décide
d'accorder une grille, et rien ne garantit l'accord avec le moteur.

Remède à trancher : passer par la projection du serveur (attention, l'écran est
interactif), ou descendre le calcul dans un paquet pur que les deux côtés
importent, comme `@lfd/money`. Touche l'argent : `vitruve` avant de bâtir.

### R6 🟠 L'engagement de volume n'a aucun écran

Le backend a l'agrégat, le dépôt et les routes
(`admin-volume-commitments.controller.ts` : lister, poser, clore, reporter). Le
back-office n'en appelle que le report
(`b2b/tarification/sale-reference-decisions.service.ts:26`) ; aucune page ne
liste, ne pose ni ne clôt un engagement. C'est pourtant le mécanisme qui fait
payer à un client le palier de sa **promesse** dès sa première commande. À
faire après R16 : un écran qui pose un engagement de famille figerait la
sémantique non tranchée.

### R15 🟠 La projection juge sur des cumuls

Une projection ne peut plus annoncer un prix sous le mur dur
(`UnlockEvidence.quantity` nullable : faute de commande, la porte d'un plancher
dynamique reste fermée). Reste l'écart d'écran : la charge
(`priceProjectionPayloadSchema`, `pricing.ts:1561-1571`) ne porte que des
cumuls, alors que la grille des paliers rouvre la porte au seuil sondé ; la
courbe peut donc être plus haute que la grille. L'écran calcule déjà la
quantité de chaque échéance (`commitment-bench.ts:123`) et ne l'envoie pas.
Raisonnement : [journal de remédiation](journal-de-remediation.md) § 8.

### R29 🟠 L'unité d'un champ dont le nom ne la dit pas

`lint:money-units` lit les noms. Trois colonnes n'ont qu'un commentaire pour
dire leur unité, et la porte l'écrit elle-même
(`money-units.mjs:289-294`) : `price_rules.value`, `price_rules.floor_value`,
`price_floors.value`. Remède : un type nominal `Millicents` / `Cents` dans
`@lfd/money`. Renommer les colonnes serait une migration de données pour un
défaut que le type ferme sans toucher aux données.

### P1 🟠 La liste de la saisie de commande au prix d'étiquette

`GET /admin/catalog/sellable` (`admin-catalog.controller.ts:49`) rend le
catalogue au prix d'étiquette, et la saisie de l'équipe
(`commandes/catalog.service.ts:35`) l'affiche tel quel. La résolution qui
facture refuse tout le lot au premier SKU refusé, et un appel par SKU coûte une
résolution complète par article. À re-planifier avec une mesure de coût ; un
article refusé pour ce client ne doit jamais garder le prix d'étiquette en
silence. Détail : [`commande-passee-par-l-equipe.md`](../commandes/passation/commande-passee-par-l-equipe.md) § 8.3.

### R11, R24 🟡 Les traces mortes et les états inatteignables

- **R11** — `plannedVolume` vit dans le gabarit (`pricing.ts:1638`) : un
  gabarit posé chez trois clients porte une seule hypothèse de saison. Le
  volume prévu devrait être une donnée du client.
- **R24** — `price_rules.floor_mode` / `floor_value` (`pricing.prisma:50-51`)
  ne sont lus par aucun code ; `company_mercuriales.paused_at` est écrit
  (`prisma-company-mercuriale.repository.ts:107`) sans aucun geste de pause sur
  `CompanyMercuriale` ; `AuthoredPriceStage` (`price-rule.ts:39`) accepte
  encore l'étage `mercuriale`.

### H1, B1 🟡 L'historique du tarif et le comparatif

- **H1** — trois écrivains de `catalog_price_history` (preuves au tableau),
  là où un seul passage est attendu. Vérifier qu'ils écrivent la même ligne,
  ou n'en garder qu'un.
- **B1** — `mercuriale-benchmark.query.ts:64` émet une observation par palier
  et son commentaire le revendique ; `benchmarkByProduct`
  (`mercuriale-benchmark.ts:13-32`) les ramène à une par client (le plus haut
  prix). Le servi est par client : c'est le commentaire de la requête qui ment.

### R9, R13

- **R9** — l'inventaire est tenu par
  [`../todos/todo-jours-convertis-hors-tarification.md`](../todos/todo-jours-convertis-hors-tarification.md) ;
  rien n'est bâti, aucun défaut avéré.
- **R13** — le total vu est désormais opposé au total débité (ce que R4
  demandait), mais qui porte le risque d'un prix qui bouge entre devis et
  livraison reste une décision.

---

## 3. Refermé — ne pas rouvrir

- **R10** — un gabarit s'archive (décidé par Hugo le 2026-11-11) :
  `POST /admin/pricing/templates/:id/archive`
  (`archive-price-template.handler.ts`), geste « Archiver le gabarit » sur
  l'écran des gabarits. Il sort des listes ; les mercuriales déjà posées ne
  bougent pas. Un second archivage rend 409.
- **R12** — les trois contrôles en production rendent 0 (lancés par Hugo le
  2026-11-11) : aucun palier de gabarit ni de mercuriale sous le centime
  (`D10`), aucun article sans taux de TVA propre dont la famille en a un
  (`D8`), aucune commande dont la remise dépasse le panier (`P4`).
- **R4** — le total vu : `expectedTotalCents` est obligatoire sur la passation
  boutique et la saisie (`shop-order.ts:110`, `admin-order.ts:139`), et un
  écart rend 409 `orders.total_changed` (`seen-total.values.ts`).
- **R14** — la conception des conditionnements est rangée dans
  [`obsolete/`](obsolete/architecture-conditionnements-pricing.md) : ne pas
  construire contre elle.
- **R15, première moitié** — une projection n'ouvre jamais la porte d'un
  plancher : « pas de commande » est un mot du type.
- **R25** — `supersedes` ne sera pas persisté : son défaut de relecture `[]`
  rendrait indistinguables « aucune rivale » et « on ne consignait pas ».
- **R27** — la trace de prix ne part pas au client : `toCustomerOrder` filtre
  champ par champ ; le plancher est la marge.
- **Un gabarit se pose d'un bloc** sans transaction : une mercuriale est une
  ligne.
- **La quantité est bornée** (`MAX_LINE_QUANTITY`, `MAX_ORDER_LINES`, 100
  lignes sur `/shop/quote`).

---

## 4. L'ordre

1. **R16** — la décision, puis un test rouge et le correctif : seul point qui
   fausse un prix facturé.
2. **R6** — après R16, pour ne pas figer la sémantique de famille à l'écran.
3. **R2** (avec R11) — conception, `vitruve`, puis un lot front.
4. **P1** — mesurer le coût d'une résolution pour toute la liste.
5. **R15**, **R29**, puis les 🟡.

**Ne pas toucher au moteur** — `resolvePrice`, la spécificité, le plancher, la
grille des paliers. R15 et R16 sont dans `LoadedPricer`, sa porte, pas dans le
moteur.

---

## 6. Le pourquoi

### 6.1 Ce qu'il faut refuser si on le propose

| Proposition                                        | Pourquoi c'est pire                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------ |
| Des handlers injectés à la place de `PRICE_STAGES` | L'ordre est la sémantique ; un tableau le rend lisible à un seul endroit |
| Faire du plancher un étage                         | Il gagnerait une fenêtre de validité qu'il n'a délibérément pas          |
| Un moteur de règles configurable (DSL, table)      | Perte du compilateur et d'une trace nommée dans la langue du métier      |
| Séparer le calcul de la trace                      | Casse la propriété 3 ci-dessous : le moyen sûr de faire mentir un écran  |

### 6.2 Les propriétés qui rendent le moteur fiable

1. **`resolvePrice` est pure** : l'instant est dans le contexte ; ni base, ni
   horloge, ni réseau.
2. **Un seul arrondi, en fin de chaîne.**
3. **La trace est produite par la passe qui calcule**, pas tenue à côté.
4. **`compareSpecificity` et `winnerOf` sont réutilisés par l'écran** : la
   frise désigne le gagnant avec l'arbitrage qui facture.

### 6.4 La racine des recalculs au front

Dès qu'un écran a besoin d'un total avant la commande, la réponse est **une
route** (comme `POST /shop/quote`), jamais une multiplication côté client.
R2 et P1 en sont les deux occurrences restantes.

### 6.5 L'unité, et D10

- un prix unitaire dérivé est en **millicentimes** (10⁻⁵ €) ;
- un montant est en **centimes entiers** ;
- la traversée se fait par `lineTotalCents(unitMillicents, quantity)`, qui
  arrondit une fois.

**D10** : trois sites écrivaient `unitPriceMillicents × quantity` et nommaient
le résultat `*Cents` ; deux tombaient sur un formateur juste, le troisième sur
un faux. Le même idiome fautif écrit trois fois n'attendait qu'un site pour
atterrir du mauvais côté. `lint:money-units` en a trouvé dix-huit. Sa limite
est celle de R29 : elle croit les noms, et ne voit ni une colonne appelée
`value` ni un `Exact` qui change d'unité.

### 6.6 Ce qui rend l'extension coûteuse

- La chorégraphie d'entrée (`{ sku, name, category, canonicalMillicents }`)
  est recopiée par plusieurs appelants de `Pricer`.
- `loaded-pricer.ts` fait 532 lignes (compté le 2026-11-11), au-delà de la
  règle des ≲ 300.
- L'audience `segment` existe dans les types sans chemin pour en créer une : la
  spécificité arbitre sur un axe sans donnée.
