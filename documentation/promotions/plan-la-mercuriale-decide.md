# Plan — c'est la mercuriale qui décide si son client profite des promotions

> 📝 **Plan du 2026-10-31**, décision de Hugo le même jour. Touche
> l'**argent** (quel prix paie un client négocié) et porte une **migration** :
> `vitruve` avant le bâti.

## 1. La décision (Hugo, 2026-10-31)

> « Je ne suis pas certain que définir dans la promotion si elle touche les
> mercuriales corresponde à la vraie division de responsabilité des gens qui
> vont toucher ces réglages. »

Celui qui pose une promotion pense à une opération ; le commercial qui
négocie une mercuriale sait ce qu'il a promis au client (« prix net » ou
« prix négociés + promotions du moment »). Décisions :

- une case sur la **mercuriale** : « Ce client profite aussi des promotions »,
  **non** par défaut ;
- elle vaut pour **toutes** les promotions, au prix affiché **et** au panier ;
- la case « Aussi pour les clients à tarif négocié » de la promotion
  (`stacksOverMercuriale`) **disparaît** ;
- reprise : les promotions qui l'avaient cochée gardent leur effet pour les
  clients concernés — rien ne change sans décision.

## 2. L'existant (ouvert le 2026-10-31)

- La mercuriale **scelle** : quand elle pose le prix d'un SKU, les étages
  suivants (dont l'étage `promotion`) n'agissent plus, sauf une règle qui
  porte `stacksOverMercuriale` (`pricing/domain/resolve-price.ts:137`,
  `cumulative-promotions.ts:44`). Le scellement est **par SKU** : seules les
  lignes dont la mercuriale fixe le prix sont scellées.
- Une promotion porte `stacksOverMercuriale` (`promotions/domain/promotion-terms.ts:64`),
  refusé au point panier (l. 116) et traduit en règle de prix par
  `pricing/domain/promotion-as-rule.ts:93`.
- **Au panier**, rien ne regarde la mercuriale aujourd'hui : une remise de
  panier s'applique à un client sous mercuriale s'il est dans le public visé
  (à confirmer par vitruve).
- Les règles de prix ordinaires portent aussi `stacksOverMercuriale`
  (`pricing/domain/entities/pricing-rule.ts:45`) : **hors champ** — seules les
  promotions changent.
- Modèles : `CompanyMercuriale`, `CompanyMercurialeAmendment`,
  `MercurialeDraft` (`prisma/schema/public/pricing.prisma:304`, `:363`,
  `:422`).

## 3. La règle

Par **ligne** (SKU), pour un client donné :

- la ligne est **scellée par une mercuriale qui refuse les promotions** si
  une mercuriale de sa société fixe son prix et que sa case est décochée ;
- une ligne ainsi scellée ne reçoit **aucune** promotion : ni l'étage
  `promotion` du prix affiché, ni une remise de panier — elle sort de
  l'assiette de toute remise de panier (comme un SKU exclu) ;
- une ligne scellée par une mercuriale qui **accepte** les promotions les
  reçoit toutes, comme un client sans mercuriale ;
- une ligne qu'aucune mercuriale ne fixe : rien ne change.

Le scellement des **autres** étages (barème, plancher…) par la mercuriale ne
change pas.

## 4. Les données

- Colonne `accepts_promotions boolean NOT NULL DEFAULT false` sur la
  mercuriale (et ce qui la porte dans ses avenants et brouillons : à
  trancher par vitruve — un avenant daté change-t-il la case ?).
- ~~Reprise booléenne~~ (périmée par le § 7) : pour chaque mercuriale active, `accepts_promotions = true` si une
  promotion **non archivée** avec `stacksOverMercuriale = true` vise
  aujourd'hui un SKU de cette mercuriale pour sa société — sinon `false`.
  Cas mixtes (une promotion cochée, une autre non, même client) listés
  « à trancher » par le script, jamais tranchés en silence. Passe du script
  de reprise, rejouable, à blanc par défaut.
- `promotions.stacks_over_mercuriale` : n'est plus lu ni écrit ; la colonne
  reste en base (§ 0 du CLAUDE.md).

## 5. L'écran

- Mercuriale (back-office, écran de la mercuriale d'une société) : la case,
  avec l'aide « Si décochée, ce client paie son prix négocié sans aucune
  promotion en plus — ni au catalogue, ni au panier. »
- Page de promotion : la case disparaît de « Quand, et à quelles
  conditions ? » ; une phrase d'aide dit que les clients à tarif négocié
  suivent le réglage de leur mercuriale.

## 6. Les tests

- Prix affiché : client sous mercuriale qui refuse → pas de promotion sur
  ses SKU négociés, promotion sur les autres ; qui accepte → promotion.
- Panier : remise de panier sur un panier mixte → l'assiette exclut les
  lignes scellées par une mercuriale qui refuse.
- Reprise : les deux cas et le cas mixte listé.
- Révision (prix verrouillé) : une commande passée garde ses prix ; le
  changement de case sur la mercuriale n'agit que sur les commandes neuves.
- Factur-X et bons : rien de spécial (les remises existantes sont figées).

## 7. Précision de Hugo (2026-10-31) — fait foi sur les §§ 1, 3, 4 et 5

> « Pouvoir sélectionner quelles promotions sont applicables à la
> mercuriale, plutôt qu'un arbitraire non à tout : oui, non, souple. »

La case devient un **choix à trois positions** sur la mercuriale :

| Position                  | Effet sur les lignes que la mercuriale fixe                  |
| ------------------------- | ------------------------------------------------------------ |
| **Aucune promotion**      | prix négocié net — ni prix affiché, ni panier (défaut)       |
| **Toutes les promotions** | comme un client sans mercuriale                              |
| **Au choix**              | seulement les promotions **sélectionnées** sur la mercuriale |

- « Au choix » porte une **liste de promotions** (table
  `mercuriale_accepted_promotions (mercuriale_id, promotion_id)`, clé
  composée) ; une promotion créée plus tard n'y entre pas d'elle-même.
- Une promotion archivée reste dans la liste (elle n'agit plus) ; l'écran la
  montre « archivée ».
- **Reprise** : une mercuriale dont des promotions cochées
  `stacksOverMercuriale` touchent aujourd'hui les SKU passe en « Au choix »
  avec exactement ces promotions — le cas mixte du § 4 n'en est plus un ;
  sinon « Aucune promotion ».
- **Écran de la mercuriale** : le choix à trois positions ; en « Au choix »,
  une sélection multiple des promotions non archivées, chacune avec son
  résumé en une phrase.
- **Page de promotion** : une ligne d'information « Clients à tarif
  négocié : N mercuriales l'acceptent » (lecture seule, renvoi vers elles) —
  le réglage reste du côté de la mercuriale.

## 8. Après vitruve (2026-10-31) — fait foi sur tout ce qui précède

Trois BLOQUANTS, levés :

1. ⚠️ **Réorienté par Hugo le 2026-10-31, après vitruve** — la table
   `mercuriale_promotion_policies` décrite ci-dessous n'est **pas** créée.
   La politique passe par le mécanisme qui date déjà la mercuriale : le
   document porte sa politique de départ (`promotion_mode` + `promotion_ids`,
   fixée à la pose, et sur le brouillon) ; un **avenant** peut porter une
   nouvelle politique à partir de son `validFrom`, seul ou avec des lignes de
   prix (un avenant qui ne fait que la changer est valide) ; la politique à
   une date est celle du dernier avenant qui en porte une avant cette date,
   sinon celle du document. Le reste du § 8 tient. Détail bâti :
   [`comprendre-une-mercuriale.md`](../pricing/mercuriales/comprendre-une-mercuriale.md), § 7 bis.
   Texte d'origine : **La politique est une décision datée, pas un champ vivant.** Une
   mercuriale est un document immuable qui entre dans la résolution datée
   (`pricing.prisma:300`, `lint:dated-decisions`) : modifier sa politique sur
   place ferait payer au passé le réglage d'aujourd'hui (la panne R17 du
   plancher). Mais reposer un avenant à chaque nouvelle promotion « au
   choix » serait impraticable. Donc : une **table de politiques datées**
   `mercuriale_promotion_policies (id, mercuriale_id, valid_from, valid_to,
mode none|all|selected)` et sa liste `…_promotions (policy_id,
promotion_id)`. Changer la politique = clore l'entrée en cours et en
   ouvrir une neuve à partir de maintenant (ou d'une date) ; jamais de mise à
   jour sur place. Une lecture datée lit l'entrée de sa date. La porte
   `dated-decisions` doit connaître cette famille (l'inscrire).
2. **Le panier apprend qu'une ligne est scellée** : la ligne tarifée porte
   déjà `sealedByRuleId` (`orders/domain/services/price-line.ts:39`) — l'id du
   document mercuriale ; il voyage jusqu'à `BasketLine`, et le choix des
   remises de panier exclut une ligne **par promotion** (pas dans
   `ineligibleSkus`, global) si la politique datée de cette mercuriale ne
   l'accepte pas. Appelants : composition de commande, devis boutique,
   `cart-adjustments`.
3. **Le prix affiché lit la politique de la mercuriale qui scelle** :
   `mercurialeRuleFor` porte la politique datée dans la règle de mercuriale ;
   `resolve-price.ts:137` et `cumulative-promotions.ts:44` laissent passer
   une promotion si la règle ordinaire porte `stacksOverMercuriale` (règles
   de prix ordinaires, inchangées) **ou** si la politique de la mercuriale
   scellante l'accepte (`all`, ou `selected` avec son id). Les deux sources,
   jamais un `false` en dur.

Sérieux, intégrés :

- **Reprise par script applicatif** (le script de reprise, à blanc par
  défaut), pas en SQL : pour chaque mercuriale **active ou future** (et son
  brouillon en cours), une politique `selected` datée de sa propre date de
  début avec les promotions **non archivées** (programmées comprises, en
  pause comprises) cochées `stacksOverMercuriale` qui visent sa société par
  leur public ; sinon `none`. Le jugement fin par article n'est pas refait :
  une promotion sélectionnée qui ne touche aucun article de la mercuriale
  est sans effet.
- **Changement de sens à dire à Hugo** : aujourd'hui une promotion cochée
  vaut pour tous les clients négociés, futurs compris ; demain, une
  mercuriale neuve démarre en « Aucune » — le commercial choisit.
- **Rayon et annonces** : une mention de promotion sur un article n'est pas
  faite à un client dont la politique, sur CET article négocié, l'exclut
  (`shelf-promotion-offers.ts`, offres de connexion) ; sur ses articles non
  négociés, rien ne change.
- **Sites** : la politique suit `pricingCompanyId` (un site hérite de la
  mercuriale et de la politique du principal), au prix, au panier et au
  rayon.
- **Journal** : un fait à chaque politique ouverte ou close (mode, liste
  nommée, date d'effet, auteur).
- **Promotion archivée** dans une liste : elle y reste, montrée « archivée »,
  sans effet ; rien ne la purge.
- **Recouvrement** : inchangé (la politique filtre l'application, pas la
  pose des promotions entre elles).
- **Coût** : politiques et listes dans `PricingMaterials` (chargées une
  fois), jamais une requête par ligne.
- **Commandes passées** : prix figés et remises rejouées (prix verrouillé) —
  un changement de politique n'agit que sur les calculs neufs.
- **Retour arrière** gratuit jusqu'au premier merge sur `main` ; après, les
  promotions posées sans `stacks_over_mercuriale` ne le retrouvent pas.
- Mort à retirer : `stacksOverMercuriale` des promotions (termes, vue,
  contrat, lignes, `assertTerms:116`, `PromotionLineOnlyOptionError`) ;
  colonne gardée en base.
- **Palier** : une mercuriale ne scelle qu'à partir de son premier palier —
  l'aide de l'écran le dit (« sur les quantités où le tarif négocié
  s'applique »).
