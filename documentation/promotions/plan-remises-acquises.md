# Plan — une remise acquise reste acquise, à la manière des grandes plateformes de commerce

> 📝 **Plan du 2026-10-31**, doc-first. Touche l'**argent** : `vitruve` avant
> le bâti. Rien n'est bâti. Préalable du plan
> [`plan-jours-et-heures.md`](plan-jours-et-heures.md) (§§ 9-10), qu'il
> généralise.

## 1. La décision (Hugo, 2026-10-31)

> « On s'aligne sur [l'ancien canal de vente en ligne] et Salesforce. » (le nom de la plateforme est retiré du dépôt, cf. `lint:former-channel-name`)

Ce qu'on en retient, pour **toutes** les promotions (pas seulement à
heures) : la remise est figée à la passation, **par article et pour la
quantité commandée** ; modifier la commande ne la retire pas — ni parce que
la plage horaire est passée, ni parce que la promotion a été archivée ou a
expiré, ni parce qu'une autre de ses conditions ne tient plus. Ce qui est
**ajouté** (ligne neuve, quantité augmentée) se juge aux règles du moment.

Ce que l'on sait de ces plateformes (de mémoire, non revérifié le
2026-10-31) : une commande passée fige ses prix et ses remises ; à la
modification, les articles déjà commandés gardent leur remise ; un article
ajouté n'en reçoit pas d'office.

## 2. L'existant (ouvert le 2026-10-31)

- La révision d'une commande (`orders/application/services/order-revising.service.ts`,
  `compose`, l. 170-213) recompose toute la commande par la composition de la
  passation, avec trois exceptions écrites en tête du fichier (l. 40-56),
  dont **R3** : « les lignes déjà présentes à leur prix figé ».
- Les **remises de panier** sont rejugées à `clock.now()`
  (`basket-promotions.service.ts:53`) : une promotion archivée ou expirée
  entre-temps disparaît de la commande révisée.
- Les remises d'une commande sont figées par promotion dans `order_discounts`
  (§ 18, M2-M3), par ligne dans `order_line_discounts`, pointant
  `order_line_id` — or la révision recrée les lignes
  (`prisma-order-revision.repository.ts:120`).
- **À vérifier au bâti, et c'est une faille possible aujourd'hui** : R3 fige
  le prix d'une ligne déjà présente — l'applique-t-il aussi à la quantité
  **augmentée** ? Si oui, une promotion « dans le prix affiché » expirée
  reste offerte sur tout ce qu'on ajoute à une ligne existante.

## 3. La règle

Pour chaque remise active d'une commande (une par promotion), une
**couverture** par SKU : la quantité (pièces ou grammes) que la remise
couvre.

- **Passation** : la couverture d'une remise est la quantité de chaque ligne
  qu'elle touche.
- **Révision** : pour chaque promotion déjà appliquée à la commande,
  `couverture' = min(couverture, quantité révisée)` — elle reste acquise même
  si la promotion n'est plus admise maintenant. Le **surplus** (quantité
  au-delà de la couverture, ligne neuve) se juge aux règles du moment : il
  peut recevoir la même promotion si elle est encore admise (la couverture
  grandit alors par ce nouveau jugement), une autre, ou rien.
- Une seule remise par promotion dans l'ensemble actif ; la chaîne des
  cumulables (M7) et son plafond s'appliquent à l'ensemble ainsi formé.
- **Assiette** d'une remise : par SKU, la quantité couverte × le prix net de
  la ligne après les remises de rang inférieur.

## 4. Le point ligne (« dans le prix affiché »)

Une ligne a **un** prix unitaire (`@@unique([orderId, sku])`,
`orders.prisma:771` ; « prix unitaire × quantité = montant »). Si une
promotion de ligne n'est plus admise et que la quantité augmente, la ligne
aurait deux prix. Options, à trancher par `vitruve` :

- **(a)** Le surplus d'une ligne à prix promotionnel figé se refuse quand la
  promotion n'est plus admise : « pour en ajouter, passez une nouvelle
  commande » ;
- **(b)** la ligne garde son prix figé pour tout (aujourd'hui, si R3 le fait
  déjà) — c'est la faille du § 2 ;
- **(c)** deux lignes pour un même SKU — lever l'unicité, coûteux.

Recommandation de départ : **(a)**.

## 5. Les données

Table `order_discount_coverages (order_discount_id, sku, covered_quantity)`,
clé primaire sur les deux premières, `covered_quantity > 0`, RESTRICT vers la
remise, pas de clé vers la ligne (recréée à chaque révision). Écrite à la
passation et à chaque révision, avec la remise neuve. **Reprise** des
commandes existantes : la couverture d'une remise existante est la quantité
des lignes qu'elle touche (`order_line_discounts`) — une passe de la reprise
§ 2.12, ou une migration de données, à trancher par `vitruve`.

## 6. Ce que ça touche

Composition de révision, `BasketPromotions`, M7 (chaîne, plafond), bons
partiels (`delivery_note_discounts` : prorata des livrées), facture (M5),
déclencheur différé (`le_controle_des_remises` : sommes inchangées),
annulation partielle (chemin à nommer), affichage (« remise acquise à la
commande » sur la fiche commande ?).

## 7. Les tests

- Promotion archivée après la passation : la révision garde la remise sur
  la quantité commandée, n'en donne pas au surplus.
- Promotion à heures : 2 à 17 h 30, +3 à 20 h → 2 remisées, 3 pleines ;
  +3 à 17 h 45 → 5 remisées.
- Baisse puis hausse : la couverture baissée ne remonte que par un nouveau
  jugement admis.
- Point ligne : l'option retenue au § 4.
- M7 : une remise acquise et une cumulable neuve forment une chaîne de
  au plus cinq.
- Bon partiel et facture : sommes au centime, déclencheur satisfait.

## 8. vitruve et la vérification des plateformes (2026-10-31) — le plan est à refaire

**Cinq BLOQUANTS**, dont un qui vaut pour le code d'aujourd'hui :

1. **La faille existe sur `dev`** : `revised-lines.ts:49-76` met dans `frozen`
   tout SKU déjà présent avec la quantité demandée totale, et `frozenLineOf`
   (l. 83-96) recopie prix et trace ; `order-composition.service.ts:295-316`
   ne retarife que les SKU neufs. Deux pièces au prix promo, puis cinquante :
   les cinquante au prix promo, promotion expirée ou non. Le même mécanisme
   garde un palier de volume atteint quand la quantité redescend.
2. Le point ligne n'a pas de ligne `order_discounts` : la « couverture » n'a
   pas de support pour lui.
3. Une remise fixe à seuil (« −5 € dès 30 € ») acquise « quelles que soient
   les conditions » s'exploite en révisant à un article.
4. M7 classe sur la promotion vivante ; une acquise archivée n'y est plus,
   et la relire appliquerait ses conditions d'aujourd'hui.
5. L9 refuse toute révision d'acheminement qui change l'ensemble des remises
   rang par rang : incompatible avec une chaîne mêlant acquis et neuf.

**Les plateformes, vérifiées** (recherche du 2026-10-31) : la plus répandue des plateformes de boutique en ligne étend une
remise en pourcentage aux articles ajoutés et pas une remise fixe de
commande, recalcule certains codes au changement de quantité ; Salesforce
n'a pas de doc officielle claire trouvée (le service client recalcule avec
les règles de la boutique) ; Dynamics 365 « verrouille le prix » des lignes
après la commande ; Commerce Layer garde les promotions de la passation sans
en ajouter. Le point commun : **ce qui a été commandé garde son prix** ; ce
qui est ajouté, chacun le traite à sa façon. Le § 1 (« de mémoire ») était
inexact.

**Proposition soumise à Hugo, non tranchée** — « prix verrouillé », à la
Dynamics :

- ce qui a été commandé garde son prix et sa remise ;
- baisser ou retirer reste libre ; la remise de panier se recalcule sur ce
  qui reste, et une remise à seuil tombe sous son seuil ;
- **augmenter** un article déjà commandé n'est accepté que si son prix du
  moment est identique au prix figé — sinon refus nommé (« Le prix de cet
  article a changé depuis votre commande : passez une nouvelle commande pour
  en ajouter ») ;
- un article neuf se juge aux règles du moment.

Elle ferme la faille 1 et celle des promotions à heures sans couverture à
mémoriser ni cas M7 insoluble. Le reste du plan (§§ 3-7) est en attente de
cette décision.

## 9. Décision de Hugo (2026-10-31) : A, le prix verrouillé — fait foi sur les §§ 3 à 7

Options présentées : A prix verrouillé, B couverture quantité par quantité,
C aucune hausse, D statu quo. **Hugo choisit A.** Les §§ 3 à 7 (la
couverture) sont abandonnés.

### 9.1 Les lignes (point ligne)

- Une ligne déjà commandée garde son **prix figé** (R3) pour sa quantité.
- **Baisser** ou **retirer** : toujours possible ; le prix figé ne bouge pas.
- **Augmenter** une ligne déjà commandée : la composition tarife le SKU **au
  moment de la révision** pour la quantité révisée ; si ce prix unitaire
  diffère du prix figé, la révision est **refusée** par une erreur nommée
  (« Le prix de « X » a changé depuis votre commande (1,20 € → 1,08 €) :
  gardez la quantité commandée, ou passez une nouvelle commande pour en
  ajouter »). S'il est identique, la hausse passe au prix figé (identique).
  Ferme la faille du § 8.1 (`revised-lines.ts:49-76`,
  `order-composition.service.ts:295-316`), palier de volume compris : une
  quantité qui change de palier change de prix, donc est refusée à la hausse
  — et à la **baisse**, le prix figé reste (un palier acquis le reste ; à
  confirmer par vitruve : c'est une remise acquise de plus, pas une faille,
  puisqu'on ne baisse pas pour gagner).
- Un **SKU neuf** se tarife au moment de la révision.

### 9.2 Les remises de panier

- Les remises de panier d'une commande sont **celles de la passation**
  (`order_discounts` actives : promotion, ajustement, rang, cumulable, SKU
  couverts via `order_line_discounts`) ; la révision ne rejuge PAS les
  promotions du moment et n'en ajoute aucune — à la manière de Commerce
  Layer (« les promotions de la passation sont rafraîchies, les nouvelles ne
  sont pas appliquées »).
- Elles se **recalculent sur ce qui reste** : même ajustement, même rang, sur
  les lignes révisées des SKU qu'elles couvraient ; un pourcentage suit
  l'assiette, un montant fixe est borné à son assiette (`discountCentsOf`).
- **Une condition qui ne tient plus fait tomber la remise** : la quantité
  minimum se rejuge sur la quantité révisée. Pas d'acquis contre une
  condition de seuil (bloquant 3 du § 8).
- Un SKU neuf ne reçoit **aucune** remise de panier (ni acquise, ni du
  moment) ; le client le voit au devis de révision.
- Ce qu'il faut figer à la passation pour ne jamais relire une promotion
  archivée (bloquant 4) : le caractère cumulable et la portée en SKU sont
  déjà déductibles de `order_line_discounts` ; le caractère cumulable et le
  point d'application sont à figer sur `order_discounts` si absents.
- **L9** : un changement d'acheminement en révision ne rejuge pas non plus
  les promotions — les remises de la passation restent, sauf si leur
  acheminement ne correspond plus (ex. remise « retrait à l'adroit » et
  passage en livraison) : alors la révision est refusée, comme aujourd'hui,
  avec l'erreur d'acheminement.

### 9.3 Les promotions à heures

Rien de plus : une remise à heures acquise à la passation reste (§ 9.2) ; une
hausse au même prix ne la change pas, un SKU neuf n'en reçoit pas. Les §§ 9-10
de `plan-jours-et-heures.md` (la couverture) sont remplacés par ce plan.

## 10. Après vitruve, la version validée par Hugo (2026-10-31) — fait foi sur le § 9

> **Une modification ne change jamais un prix convenu en silence.**

Trois BLOQUANTS du § 9 (seuil acquis à la baisse, seuil de panier non figé,
comparaison de prix non définie) et six SÉRIEUX, levés ainsi :

### 10.1 Les lignes déjà commandées

- À chaque révision (et à son devis), chaque ligne déjà commandée est
  **retarifée au moment de la révision pour sa quantité révisée**.
- **Égal** au figé — même `unitPriceMillicents` (au kilo pour une vente au
  poids), même `vatRate`, et en `exact_ht` même `unitPriceTtcCents` — : la
  ligne garde son figé, la révision passe.
- **Différent**, à la hausse comme à la baisse de quantité, quelle que soit la
  cause (promotion finie, seuil de quantité ou palier de volume quitté,
  canonique, mercuriale ou taux changés) : **refus** nommé, `BusinessError`
  (409), distinct de `FrozenLinePriceChangedError`
  (`order-revision-errors.ts:115`, qui reste l'alarme technique) :
  « Changer la quantité de « X » change son prix (0,90 € → 1,20 €) : gardez
  la quantité commandée, ou annulez et passez une nouvelle commande. »
- Un SKU retiré du catalogue depuis la commande : ne peut plus se retarifer —
  refus nommé (« « X » n'est plus vendu : gardez la quantité commandée ou
  retirez-le »), jamais une erreur de résolution brute. Retirer la ligne
  reste possible.
- Même règle pour l'équipe (M4) : aucune dérogation.

### 10.2 Les remises de panier

- **Rejouées, jamais rejugées** : les remises actives de la commande, avec
  leur ajustement, leur rang, leur caractère cumulable, leur seuil
  (`min_quantity`), leur cible d'acheminement (mode, points, zones) et leurs
  SKU couverts — à la manière des bons partiels
  (`delivery-notes/domain/services/note-basket-discounts.ts`, qu'on
  réutilise). Aucune promotion du moment n'est ajoutée ; une promotion
  archivée depuis reste acquise.
- **Seuil** : si la quantité révisée d'une ligne couverte passe sous le seuil
  figé, **refus** nommé (« Cette modification ferait perdre la remise « X »
  (dès 10 pièces) ») — jamais une perte silencieuse.
- Un SKU couvert retiré entièrement sort de l'assiette ; une remise dont tous
  les SKU sont retirés disparaît (aucune perte cachée : il n'y a plus rien à
  remiser).
- M7 : le plan choisi à la passation (chaîne ou non cumulable) est figé ; la
  comparaison n'est pas refaite ; le plafond de cinq est sans objet (rien ne
  s'ajoute).
- **L9** : un changement d'acheminement se juge contre la **cible figée** de
  chaque remise ; s'il sort de la cible (ex. « retrait à l'adroit » →
  livraison, ou une adresse d'une autre zone), refus comme aujourd'hui.
- Un SKU neuf ne reçoit aucune remise de panier.
- Remise reprise en `origin = frozen` (sans ajustement ni promotion) : son
  montant figé est gardé, borné à l'assiette restante de ses SKU.

### 10.3 Données

Migration additive sur `order_discounts` : `cumulative boolean`,
`min_quantity int null`, et la cible d'acheminement figée
(`fulfillment_pickup` / `fulfillment_delivery` + listes, même forme que la
promotion, § 2.14 de `promotions.md`) ; une colonne `frozen_terms_origin`
(`placed` · `backfilled`) distingue le figé réel du déduit. Reprise des
remises actives existantes par le script de reprise (§ 2.12), depuis la
promotion de chaque remise, marquée `backfilled`. `lecteur-de-migrations`
avant `main`.

### 10.4 Le devis de révision

Le devis partage `compose` : il ne lève pas pour un refus de prix ou de
seuil ; il rend, par ligne et par remise, le refus et ses deux prix, et le
front l'affiche à côté de la ligne ; la révision, elle, lève l'erreur
nommée. Les deux fronts (boutique et back-office) affichent ces refus.

### 10.5 Bâti côté serveur (2026-10-31) — trois lectures retenues

1. Seules les lignes dont la **quantité change** sont retarifées ; une ligne
   inchangée garde son figé (sinon changer une note de commande serait
   bloqué par un prix qui a bougé).
2. **L9 sans cible connue** (remise pas encore reprise) : tout changement
   d'acheminement est refusé — plus strict qu'avant, jusqu'à la reprise.
3. Jusqu'à la passe de reprise en `--write`, les remises existantes n'ont pas
   de seuil connu : le refus `below_threshold` ne les protège pas encore.
   Une promotion révisée depuis la commande donne à la reprise ses termes
   d'aujourd'hui (limite écrite dans le script).

Écart : `noteBasketDiscountsOf` (bons) n'est pas importé — il saute les
remises sans ajustement, et l'importer ferait dépendre `orders` de
`delivery-notes` ; son mécanisme de couverture est repris dans `orders`.
Comportement changé : un article sorti du catalogue dont on change la
quantité est refusé par son nom (admis depuis le 2026-10-29). Reste : les
écrans (refus par ligne et par remise dans l'aperçu).
