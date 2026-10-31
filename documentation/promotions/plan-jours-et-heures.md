# Plan — une promotion récurrente : jours et heures

> 📝 **Étude du 2026-10-31**, doc-first. Touche l'**argent** (quand une remise
> s'applique) : `vitruve` avant le bâti. Rien n'est bâti. Les questions du § 6
> attendent Hugo.

## 1. La demande (Hugo, 2026-10-31)

Un anti-gaspi façon « Too Good To Go » sur le pain : la remise ne doit valoir
qu'à certaines heures, et revenir d'elle-même. « On doit pouvoir faire de la
récurrence. » Exemples visés :

- « −50 % sur le pain, tous les jours de 17 h à 19 h » ;
- « −10 % le mardi et le jeudi, toute la journée » ;
- « −20 % du lundi au vendredi, de 7 h à 9 h et de 17 h à 19 h ».

## 2. L'existant (ouvert le 2026-10-31)

- `apps/lfd-api/src/b2b/promotions/domain/promotion-condition.ts` : une union
  de conditions, toutes doivent tenir ; une seule bâtie, `min_quantity`. Son
  JSDoc prévoit « jours et heures » comme une variante de plus, « chacune
  sera une variante et son évaluateur, sans toucher aux autres ».
- Une promotion a déjà une **période** (`validFrom`, `validTo` nullable) et une
  **pause** (`suspendedFrom`), jugées par `inForceAt` (`live-promotion.ts`).
  La récurrence s'inscrit DANS la période : hors période, rien ; dans la
  période, seulement aux jours et heures dits.
- L'heure du métier est celle d'**Europe/Paris** : les heures limites de
  commande s'écrivent `HH:MM`, « pendule d'Europe/Paris »
  (`order-cutoffs/domain/general-order-cutoff.ts:6`) ; les créneaux de retrait
  publics portent un `weekday` et une plage `startTime`/`endTime`
  (`pickup-addresses/domain/public-pickup-slot-rule.ts`). Le temps se lit par
  le port `Clock` (`lint:clock-port`), jamais par `new Date()`.

## 3. La forme proposée

Une nouvelle condition, à côté de `min_quantity` :

```ts
type PromotionCondition =
  | { readonly kind: "min_quantity"; readonly value: number }
  | {
      readonly kind: "weekly_hours";
      /** Une ou plusieurs plages, chacune ses jours. */
      /** L'instant jugé — choisi par promotion (Hugo, Q1). */
      readonly moment: "ordered_at" | "handover_at";
      /** Hors des heures, la boutique dit-elle les heures ? (Hugo, Q2). */
      readonly announceOutside: boolean;
      readonly windows: readonly {
        readonly weekdays: readonly Weekday[]; // lundi … dimanche, au moins un
        readonly start: string; // "HH:MM", Europe/Paris
        readonly end: string; // "HH:MM", après start, le même jour
      }[];
    };
```

- **Refus à la pose** (value object) : aucune plage, aucun jour, heure mal
  formée, fin avant ou égale au début, plages qui se chevauchent un même
  jour, doublon de jour. Une plage qui passe minuit (22 h → 2 h) s'écrit en
  deux plages — à confirmer (§ 6).
- **Évaluateur** : `weeklyHoursAdmit(condition, instant)` convertit l'instant
  en jour et heure de Paris (heure d'été comprise), puis cherche une plage.
  Pur, testé aux bascules d'heure (dernier dimanche de mars et d'octobre).
- **Toutes les conditions doivent tenir** : `weekly_hours` + `min_quantity`
  se combinent comme aujourd'hui.

## 4. Ce que ça touche

- **Le prix affiché** (promotion « dans le prix affiché ») : le prix d'un
  article au catalogue change à 17 h et à 19 h. La résolution est déjà datée
  (`resolvePrice` à un instant, `dated-decisions`), mais tout **cache** de
  prix ou de catalogue servi (boutique, matériaux de prix) doit expirer aux
  bornes — sinon la boutique montre le prix de 16 h 59 à 17 h 05. À recenser
  au bâti (`documentation/` « Cache »).
- **Le panier** : la remise s'applique si l'instant jugé est dans une plage
  (question du § 6).
- **L'annonce et l'offre de connexion** : une promotion à heures annonce
  seulement quand elle s'applique maintenant — ou dit ses heures (« −50 % de
  17 h à 19 h ») : à trancher (§ 6). Elle ne doit jamais promettre hors de
  ses heures.
- **La révision d'une commande (L9)** : une commande passée à 17 h 30 avec la
  remise, révisée à 20 h — garde-t-elle la remise ? Aujourd'hui une révision
  recompose ; à trancher (§ 6), c'est le cas le plus sensible.
- **Le recouvrement** : deux promotions non cumulables aux plages disjointes
  (« 7 h-9 h » et « 17 h-19 h ») ne se recouvrent pas ; aux plages qui se
  croisent, si. Le juge du recouvrement apprend les plages.
- **L'écran** : la carte « Quand, et à quelles conditions ? » gagne
  « Seulement certains jours et heures » — jours à cocher et plages, avec le
  résumé en une phrase (« tous les jours de 17 h à 19 h »).
- **Le journal** : la phrase dit les jours et heures.

## 5. Les données

Les conditions vivent déjà dans la promotion (`conditions`) ; la nouvelle
variante s'y range sans nouvelle table si la colonne est en `jsonb`, à
vérifier au bâti (`promotions.prisma`). Aucune promotion existante ne change.

## 6. Réponses de Hugo (2026-10-31)

1. **L'instant** : **réglé dans la promotion** — « à la commande »
   (`ordered_at`, l'instant de passation) ou « au retrait / à la livraison »
   (`handover_at`, le début du créneau choisi). Sans créneau choisi, une
   promotion `handover_at` ne s'applique pas (rien n'est promis sur un
   instant inconnu).
2. **L'annonce hors des heures** : **réglée dans la promotion** — dire les
   heures (« −50 % sur le pain, de 17 h à 19 h ») ou ne rien dire ; jamais
   présentée comme active hors de ses heures.
3. **La révision** : la commande **garde** la remise acquise à la passation ;
   une modification ne la retire pas pour une question d'heure. (Pour
   `handover_at`, changer de créneau hors des heures, lui, la retire : c'est
   l'acheminement qui change, déjà jugé en L9 — à confirmer par vitruve.)

Restent ouvertes :

4. **Passer minuit** : utile (soirée), ou deux plages suffisent ?
5. **Jours fériés et fermetures** : à ignorer pour l'instant ?

### Les questions telles que posées

1. **Quel instant compte ?** Celui où le client **commande**, ou celui où il
   **retire / est livré** (le créneau choisi) ? Pour un anti-gaspi, on vise
   d'ordinaire « commander entre 17 h et 19 h, retrait le jour même ».
2. **L'annonce hors des heures** : ne rien dire, ou dire les heures
   (« −50 % sur le pain, de 17 h à 19 h ») ?
3. **La révision** : une commande passée dans la plage et modifiée après
   garde-t-elle la remise ?
4. **Passer minuit** : utile (soirée), ou deux plages suffisent ?
5. **Jours fériés et fermetures** : à ignorer pour l'instant ?

## 7. Hors champ

- Le **stock limité** (« les 10 dernières baguettes ») : une autre condition,
  la limite d'usage, prévue et non bâtie.
- L'anti-gaspi **au comptoir** : rien ne s'encaisse en boutique par notre
  système ; seules les commandes en ligne sont concernées.

## 8. Après vitruve (2026-10-31) — fait foi là où il diverge

Cinq BLOQUANTS, six SÉRIEUX. Ce qui est tranché :

1. **La révision garde la remise par un mécanisme nommé** : une promotion à
   `weekly_hours` de moment `ordered_at` se juge, en révision, **à l'instant
   de passation** de la commande, pas à `clock.now()` — la composition de
   révision (`order-revising.service.ts:173-208`) passe cet instant à
   `BasketPromotions` (`basket-promotions.service.ts:53`) pour la seule
   condition d'heure ; une ligne ajoutée en révision reçoit donc la même
   remise de panier que les autres. (Aujourd'hui la révision rejuge tout à
   `now` : sans ce mécanisme, Q3 serait faux.)
2. **Le créneau entre dans L9** pour `handover_at` : `window` et `date`
   rejoignent les changements jugés (`fulfillment-promotion.ts:14-18`), et le
   refus nomme le cas réel — une erreur propre, « Ce créneau tombe hors des
   heures de la promotion « X » (de 17 h à 19 h) », pas l'erreur
   d'acheminement.
3. **Créneau sans début** (« avant 10 h », `start` nul) : l'instant jugé est
   la **fin** du créneau. Sans créneau du tout (livraison sans tranche,
   `requestedWindow` absent) : une promotion `handover_at` ne s'applique pas.
4. **`handover_at` est réservé au panier** : refus à la pose pour une
   promotion « dans le prix affiché », dont le rayon ne connaît pas de
   créneau.
5. **Déploiement** : la condition vit dans le JSONB `conditions` (vérifié :
   `20261031110000_les_promotions:51`, `promotions.prisma:74`) — pas de
   migration. Le lecteur (`promotion-rows.ts:250`) refuse toute condition
   inconnue et charge les promotions en bloc : une instance ancienne qui lit
   une promotion à heures fait tomber toutes les promotions. Pré-release :
   un seul déploiement, **et aucune promotion à heures posée avant que le
   déploiement soit fini** (consigne dans le runbook). Au lancement
   commercial, ce genre de variante se livre en deux temps (lecteur, puis
   écriture).

Sérieux, intégrés :

- **Recouvrement** : deux promotions de `moment` différent se recouvrent dès
  que leurs jours se croisent (une commande à 17 h 30 pour un retrait à 8 h
  satisfait les deux) ; de même `moment`, seules les plages qui se croisent.
- **Caches** : côté serveur, rien n'expire — `inForceAt` et l'évaluateur sont
  jugés à chaque requête (`pricing-materials.cache.ts`), l'évaluateur appelé
  dans `promotionsAdmitted` (`live-promotion.ts:114`). Le risque est le
  **client** : un panier affiché à 18 h 59 et passé à 19 h 00. La caisse juge
  à la passation ; le panier relu affiche alors « La remise sur le pain a
  pris fin à 19 h » plutôt qu'un total qui change sans explication.
- **Un seul évaluateur de Paris** : celui des suggestions existe déjà
  (`suggestion-conditions-gate.ts:55`, `weekdayOfDate` ; migration
  `20261018200000_les_conditions_des_suggestions`, qui refuse déjà de passer
  minuit). Il est **extrait et partagé**, pas réécrit.
- **Bascules d'heure** : heure murale de Paris — une plage de 2 h à 3 h
  n'existe pas le dernier dimanche de mars et vaut deux fois le dernier
  dimanche d'octobre.
- **Annonce et offre de connexion** (`promotion-offers.ts:83`, `:170`,
  `pickup-discount-announcement.ts:107`) : elles appellent l'évaluateur, et
  distinguent trois cas — active maintenant, hors heures montrable (si
  `announceOutside`, avec ses heures), hors heures tue.
- **Types à élargir** : `PromotionWriteRow.conditions`
  (`promotion-rows.ts:77`), le contrat Zod (`promotions.ts:146-147`, `:223`),
  le domaine, le brouillon du back-office.
- **Exemple corrigé** : un jour peut figurer dans plusieurs plages ; deux
  plages ne se chevauchent pas un même jour.

Questions 4 et 5, tranchées par défaut (cohérent avec les suggestions) : une
plage **ne passe pas minuit** (deux plages) ; **jours fériés et fermetures
ignorés** pour l'instant.

## 9. La faille de la révision, et la règle juste (Hugo, 2026-10-31)

Le § 8.1 ouvrait une faille : une baguette commandée à 17 h 30 dans la plage,
puis cinquante ajoutées à 22 h, recevaient toutes le −50 %. L'heure limite de
commande borne la révision, pas le principe. **Le § 8.1 est remplacé** :

> La remise d'une promotion à heures est **acquise pour ce qui a été commandé
> dans la plage, et pour cela seulement.**

- **À la passation**, la commande retient, par ligne (SKU) et par promotion à
  heures appliquée, la **quantité couverte** (pièces, ou grammes au poids).
- **À la révision**, chaque promotion à heures s'applique à au plus
  `min(quantité couverte, quantité de la ligne révisée)` ; le surplus — ligne
  ajoutée, quantité augmentée — se juge à l'instant de la révision, comme une
  commande neuve. Une quantité baissée fait baisser la couverture : on ne
  garde jamais plus que ce qui reste commandé, et une couverture baissée ne
  remonte pas.
- **Exemple** : 2 baguettes à 17 h 30 (−50 %), puis +3 à 20 h → 2 à −50 %,
  3 au prix plein. Puis −4 à 20 h 30 → 1 baguette, à −50 %.
- **Où ça vit** : la couverture est figée avec les remises de la commande
  (`order_discounts` porte déjà une remise par promotion ; la couverture par
  SKU est une table fille ou un `jsonb` de cette ligne — à trancher par
  vitruve), écrite à la passation et réduite à la révision, jamais accrue.
- **Calcul** : au point **panier**, l'assiette d'une remise à heures en
  révision est la somme, par ligne, de `min(couverte, révisée) × prix net
unitaire de la ligne` ; le reste de la ligne entre dans l'assiette des
  promotions jugées à `now`. Au point **ligne** (dans le prix affiché), la
  ligne se scinde en deux prix — couverte au prix remisé, surplus au prix du
  moment — ce qui demande deux lignes de commande ou une ligne à deux prix :
  **à trancher par vitruve** (la forme Factur-X d'une ligne est quantité ×
  prix net unique).
- **`handover_at`** : la couverture ne s'applique pas (l'instant est le
  créneau, pas la passation) ; changer de créneau reste jugé par L9 (§ 8.2).

## 10. Troisième passe de vitruve (2026-10-31) — fait foi sur le § 9

1. **La couverture se rejuge, elle ne se recopie pas seulement.** À la
   révision, pour une promotion à heures `ordered_at` :
   - si l'instant de révision est **dans la plage**, la couverture devient la
     quantité révisée entière (un nouveau jugement à l'heure, comme une
     commande neuve) ;
   - sinon, elle devient `min(couverte, révisée)`.
     Une seule remise par promotion dans l'ensemble actif : la chaîne M7 et son
     plafond de 5 ne voient jamais deux fois la même promotion. « Jamais
     accrue » se lit : jamais accrue **hors de la plage**.
2. **`weekly_hours` + `ordered_at` est réservé au panier** : refus du domaine
   à la pose pour une promotion « dans le prix affiché ». Une ligne à moitié
   couverte aurait deux prix pour un même SKU, ce que l'unicité
   `@@unique([orderId, sku])` (`orders.prisma:771`) et la règle « prix
   unitaire × quantité = montant » interdisent. `handover_at` reste permis au
   point ligne ? Non : § 8.4 l'a déjà réservé au panier (le rayon ne connaît
   pas de créneau). **Une promotion à heures est donc toujours une remise au
   panier.**
3. **Où vit la couverture** : une table fille de `order_discounts`,
   `order_discount_coverages (order_discount_id, sku, covered_quantity)`,
   clé primaire sur les deux premières, `covered_quantity > 0` (pièces ou
   grammes), RESTRICT vers la remise, clé par SKU sans clé étrangère vers la
   ligne — les lignes sont recréées à chaque révision
   (`prisma-order-revision.repository.ts:120`). La révision lit la
   couverture de la remise active de même promotion et l'écrit, rejugée, sur
   la remise neuve avant d'archiver l'ancienne. Le déclencheur différé ne
   contrôle que des sommes : la règle du point 1 est tenue par le domaine
   (testée), pas par la base. La reprise n'a rien à écrire : aucune remise
   d'avant n'a d'heures.
4. **Assiette** : en révision hors plage, l'assiette d'une remise à heures
   est la somme, par SKU, de `min(couverte, révisée)` × le prix net de la
   ligne **après les remises de rang inférieur** (comme `base_cents`).
5. **Bons partiels et annulation partielle** : un bon répartit la remise à
   heures **au prorata** des quantités livrées de chaque SKU, comme les autres
   remises (`delivery_note_discounts`) — pas « les couvertes d'abord ».
   L'annulation partielle passe par la révision (à vérifier au bâti ; si un
   autre chemin existe, il réduit la couverture de même).
6. **Au poids** : la couverture est en grammes ; un ajustement de pesée
   après passation ne passe pas par la révision et ne touche pas la
   couverture (à vérifier au bâti).

**Reste à Hugo** : une couverture acquise survit-elle si la promotion est
**archivée**, ou si une **autre condition** (quantité minimum) cesse de tenir
après la révision ? Proposition : non — la couverture protège seulement
contre l'**heure** ; les autres règles se rejugent comme pour toute
promotion.

## 11. Prêt à bâtir (2026-10-31) — ce qui fait foi

- **Révision** : les §§ 9 et 10 (la couverture par quantité) sont
  **remplacés** par le prix verrouillé
  ([`plan-remises-acquises.md`](plan-remises-acquises.md) § 10) : une remise
  à heures acquise à la passation est rejouée comme toute remise de panier ;
  une hausse de quantité qui changerait le prix est refusée ; un SKU neuf
  n'en reçoit pas. Plus de table de couverture.
- **Une promotion à heures est une remise au panier** (refus à la pose au
  prix affiché) : `handover_at` l'exige (§ 8.4), et on garde la même règle
  pour `ordered_at` — un seul cas à expliquer.
- **Jours fériés** (Hugo) : ignorés — un jour compte sauf indication
  contraire ; les fermetures datées d'un point de retrait suffisent (un
  point fermé ne prend pas de commande).
- **Minuit** (Hugo, option a) : une plage ne passe pas minuit ; deux plages.
- Le reste du § 8 tient : instant réglé par promotion (`ordered_at` /
  `handover_at`, créneau sans début → sa fin, sans créneau → ne s'applique
  pas), annonce hors des heures réglée par promotion, créneau jugé par L9
  (la cible figée du prix verrouillé), un seul évaluateur de Paris partagé
  avec les suggestions, heure murale aux bascules, recouvrement par moment,
  aucune promotion à heures posée avant la fin du déploiement.
