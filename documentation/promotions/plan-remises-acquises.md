# Plan — une remise acquise reste acquise, à la manière de Shopify et Salesforce

> 📝 **Plan du 2026-10-31**, doc-first. Touche l'**argent** : `vitruve` avant
> le bâti. Rien n'est bâti. Préalable du plan
> [`plan-jours-et-heures.md`](plan-jours-et-heures.md) (§§ 9-10), qu'il
> généralise.

## 1. La décision (Hugo, 2026-10-31)

> « On s'aligne sur Shopify et Salesforce. »

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

**Les plateformes, vérifiées** (recherche du 2026-10-31) : Shopify étend une
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
