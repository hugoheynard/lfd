# Nos promotions comparées à Salesforce Commerce Cloud

Comparé à : [promotions.md](promotions.md)

> 📝 **Étude du 2026-10-31** (demande de Hugo : « voir ce qui est au niveau
> Salesforce »). Notre côté : `promotions.md` et le code de
> `apps/lfd-api/src/b2b/promotions/domain/` ouverts le 2026-10-31. Côté
> Salesforce : chaque affirmation renvoie à une source du § 5 ; ce qui n'a pas
> pu être vérifié est marqué **(non vérifié)**. La référence est **B2C Commerce
> Cloud** (ex-Demandware, Business Manager) ; Salesforce Commerce « on Core »
> (B2B/D2C) n'est cité que quand il apporte quelque chose.

Légende de la colonne « nous » : ✅ bâti, 📝 étudié (plan écrit, rien de bâti),
❌ absent.

---

## 1. Les deux modèles en une phrase

- **Salesforce B2C** : une **campagne** (calendrier + qualificateurs : groupe
  de clients, coupon, code source) contient des **promotions** d'une
  **classe** (produit, commande, livraison) ; chacune a un type de remise,
  une **exclusivité** (`NO` / `CLASS` / `GLOBAL`), un **rang** (10 à 100) et
  un nombre maximal d'applications [S1][S2][S3].
- **Nous** : une promotion est **une réduction, pour un public, sur un
  acheminement, sur une portée, pendant une période** ; elle agit au **prix
  de l'article** (acheminement « tous ») ou au **panier** (retrait, point,
  livraison), et se cumule seulement si elle est cochée « Cumulable »
  (`promotions.md`, partie 1).

Leur axe premier est le **déclencheur marketing** (coupon, source, groupe) ;
le nôtre est **le public et l'acheminement**. C'est la différence de fond.

## 2. Capacité par capacité

### 2.1 Types de remise

| Capacité                                           | Salesforce B2C                                               | Nous                               | Commentaire                                                                                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pourcentage                                        | ✔ [S2]                                                       | ✅ `percent_off` (ligne et panier) | `promotion-effect.ts`                                                                                                                                      |
| Montant par article                                | ✔ amount off [S2]                                            | ✅ `unit_amount_off` (ligne)       |                                                                                                                                                            |
| Prix fixe par article                              | ✔ fixed price [S2]                                           | ✅ `fixed_unit_price` (ligne)      |                                                                                                                                                            |
| Montant sur la commande                            | ✔ classe Order [S2]                                          | ✅ `basket_amount_off` (panier)    |                                                                                                                                                            |
| Prix tiré d'un autre tarif (« price book price »)  | ✔ [S2]                                                       | ❌                                 | Nos « règles de prix » (société, volume, mercuriale) couvrent l'usage, hors promotion                                                                      |
| X articles pour un total (« Buy X for Total »)     | ✔ [S2]                                                       | ❌                                 | « 3 croissants pour 3 € »                                                                                                                                  |
| X achetés, Y remisé/offert (« Buy X / Get Y »)     | ✔ percent/amount/fixed/free [S2] ; BOGO aussi côté Core [S6] | ❌                                 |                                                                                                                                                            |
| Produit offert / bonus au choix                    | ✔ bonus product, choice of bonus products [S2][S4]           | ❌                                 |                                                                                                                                                            |
| Paliers (10 % dès 50 €, 15 % dès 100 €…)           | ✔ tiered [S2]                                                | ❌                                 | Faisable chez nous en posant plusieurs promotions non cumulables à seuils différents, mais seule condition bâtie : `min_quantity`, pas de seuil en montant |
| Remise sur le port (livraison offerte / port fixe) | ✔ classe Shipping [S2]                                       | ❌ en tant que tel                 | Un `basket_amount_off` limité à la livraison s'en approche, mais ne touche pas les frais                                                                   |
| Remise sur option de produit                       | ✔ [S2]                                                       | ❌                                 | Sans objet pour nous                                                                                                                                       |
| Plancher (ne pas descendre sous un prix)           | non trouvé **(non vérifié)**                                 | ✅ plancher facultatif             |                                                                                                                                                            |

### 2.2 Qui en profite, et comment on y a droit

| Capacité                                                                      | Salesforce B2C                       | Nous                                                                          | Commentaire                                                               |
| ----------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Groupes de clients statiques                                                  | ✔ [S3]                               | ✅ publics fixes + « une société (± ses sites) »                              | `promotion-audience.ts` : 10 publics                                      |
| Groupes dynamiques (règle sur un attribut : anniversaire…)                    | ✔ [S3]                               | ❌                                                                            |                                                                           |
| Plusieurs publics à la fois                                                   | via plusieurs groupes [S1]           | ✅ ensemble de publics (L8b)                                                  |                                                                           |
| Invité / inscrit                                                              | via groupes **(non vérifié)**        | ✅ `individuals_guest` / `individuals_registered`, + offre « connectez-vous » |                                                                           |
| Code promo (coupon)                                                           | ✔ [S3][S5]                           | ❌                                                                            | Prévu comme « variante de plus » des conditions (plan audience § 695-707) |
| Limites d'un coupon : par code, par client, par période (jours), par commande | ✔ [S5][S7]                           | ❌                                                                            |                                                                           |
| Code source (URL d'affiliation, cookie N jours)                               | ✔ [S3]                               | ❌                                                                            |                                                                           |
| Tous / au moins un qualificateur                                              | ✔ `qualifierMatchMode` ALL/ANY [S4b] | —                                                                             |                                                                           |

### 2.3 Quand

| Capacité                                                      | Salesforce B2C                                                                                                                                                                                                | Nous                                                             | Commentaire                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| Période début/fin, ouverte à un bout                          | ✔ [S3][S4b]                                                                                                                                                                                                   | ✅ `validFrom` / `validTo` nullable                              |                                                                   |
| Pause / reprise                                               | `enabled` [S4b]                                                                                                                                                                                               | ✅ pause, reprise, archivage motivé                              |                                                                   |
| Récurrence jours et heures                                    | **non vérifié** : les sources consultées ne décrivent que début/fin [S3][S4b] ; de mémoire, Business Manager offre une restriction par jours de semaine et plage horaire sur l'affectation campagne-promotion | 📝 `plan-jours-et-heures.md`                                     | À confirmer sur la doc Business Manager avant de s'en réclamer    |
| Remise acquise à la passation (pas reprise à la modification) | non vérifié                                                                                                                                                                                                   | 📝 `plan-remises-acquises.md` ; aujourd'hui le panier est rejugé | Le plan dit lui-même « de mémoire, non revérifié » sur Salesforce |

### 2.4 Cumul, priorité, limites

| Capacité                                                  | Salesforce B2C                                                                              | Nous                                                                          | Commentaire                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Exclusivité globale                                       | ✔ `GLOBAL` [S2]                                                                             | ✅ par défaut (non cumulable)                                                 | Chez nous le défaut est l'exclusivité ; chez eux, `NO` (combinable) [S2]   |
| Exclusivité par classe                                    | ✔ `CLASS` [S2]                                                                              | ≈                                                                             | Nos deux points (ligne / panier) jouent le rôle de classes, sans réglage   |
| Liste de promotions combinables / mutuellement exclusives | ✔ `combinablePromotions`, `mutuallyExclusivePromotions` [S4b]                               | ❌                                                                            | Nous : une case « Cumulable » globale                                      |
| Rang manuel                                               | ✔ 10-100 [S2]                                                                               | ❌ (rang calculé : spécificité du public puis de l'acheminement, puis valeur) | Notre rang est déduit, pas saisi                                           |
| Meilleure valeur pour le client                           | ✔ en départage [S2]                                                                         | ✅ deux plans comparés, le meilleur l'emporte                                 |                                                                            |
| Enchaînement des pourcentages                             | ordre d'application des promotions de commande [S4]                                         | ✅ 20 % puis 15 % du reste = −32 %                                            |                                                                            |
| Max d'applications par commande                           | ✔ maximum application [S2]                                                                  | ❌                                                                            |                                                                            |
| Plafonds techniques                                       | 50 auto + 50 coupons évalués par panier ; 5 000 promotions, 1 M coupons par org (Core) [S7] | 5 remises de panier par commande                                              |                                                                            |
| Refus à la pose d'un chevauchement                        | non trouvé                                                                                  | ✅ `OverlappingPromotionError`, `BasketPromotionsWouldCombineError`           | Nous empêchons une configuration ambiguë ; Salesforce la tranche au calcul |

### 2.5 Affichage et calcul

| Capacité                                                    | Salesforce B2C                                | Nous                                                     | Commentaire                       |
| ----------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------- | --------------------------------- |
| Message d'accroche (callout)                                | ✔ `calloutMsg` [S4b]                          | ✅ libellé client FR/EN/IT, distinct particuliers / pros |                                   |
| « Plus que X € pour… » (approaching discounts)              | ✔ [S4]                                        | ❌                                                       | Seule l'offre de connexion existe |
| Annonce au rayon d'une remise conditionnée à l'acheminement | —                                             | ✅ « −X % avec retrait à … »                             |                                   |
| Répartition de la remise de commande sur les lignes         | ✔ prorata sur les lignes non exclues [S4][S8] | ✅ parts par ligne couverte et par taux de TVA           |                                   |
| Exclusions globales de produits                             | ✔ [S2]                                        | ≈ portée « tout SAUF » par promotion                     |                                   |
| Tests A/B de promotions                                     | ✔ (promotions d'A/B test) [S4b]               | ❌                                                       | Sans intérêt à notre volume       |

## 3. Ce que nous faisons et que Salesforce ne fait pas, ou autrement

- **L'acheminement est un axe de la promotion** : retrait, un point précis,
  livraison, des zones (`promotion-fulfillment.ts`). Chez Salesforce, la
  classe Shipping remise le **port** [S2] ; elle ne réserve pas une remise
  sur les articles à un mode ou à un lieu — aucune source consultée ne le
  décrit.
- **Prix affiché vs remise au panier, par construction** : une promotion
  limitée à un acheminement ne descend jamais dans le prix catalogue, pour ne
  pas afficher un prix qu'on ne paiera pas (`promotions.md` § 2.2).
- **Remise ventilée par taux de TVA**, une remise de document Factur-X
  (BG-20) par promotion et par taux, validée Schematron EN 16931 et Mustang
  (§§ 2.11, 2.13). Salesforce proratise sur les lignes [S8] ; la facture
  électronique française n'est pas son affaire.
- **Remises figées par commande** (`order_discounts`, libellé figé, archivage
  sans suppression, déclencheur de contrôle des sommes) et refus d'une
  révision qui ferait changer la remise (L9).
- **Unité de la commande** : comparaison des plans en TTC pour un
  particulier, en HT pour un pro.
- **Publics propres au B2B français** : société active / en attente, une
  société et ses sites, libellé différent particuliers / pros.
- **Garde-fous à la pose** plutôt qu'un arbitrage silencieux au calcul.
- **Garantie annonce ≤ caisse** : le retiré est toujours au moins l'annoncé
  (`announcement-vs-checkout.spec.ts`).

## 4. Les écarts qui comptent pour une boulangerie-café

Valeur : pour un commerce qui vend du pain et des viennoiseries à des pros
(restaurants, cafés) et à des particuliers (retrait, livraison). Coût : estimé
sur notre modèle (une condition = une variante de `promotion-condition.ts` et
son évaluateur ; un effet = une variante de `promotion-effect.ts` et sa place
dans le calcul et les documents). Estimations, pas des devis.

| #   | Écart                                                                    | Valeur                                                | Coût                      | Pourquoi                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------ | ----------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Récurrence jours et heures** (anti-gaspi 17 h-19 h)                    | Haute                                                 | Moyen — 📝 déjà étudié    | Le cas boulanger par excellence ; dépend des remises acquises                                                                                                                              |
| 2   | **Paliers de panier en montant** (« dès 50 € », 10/15/20 %)              | Haute (pros)                                          | Faible à moyen            | Condition `min_amount` à côté de `min_quantity` ; le palier = plusieurs promotions non cumulables, le meilleur plan gagne déjà                                                             |
| 3   | **« Plus que X € pour… »**                                               | Haute                                                 | Faible une fois le 2 bâti | Pousse le panier moyen ; la mécanique d'annonce existe                                                                                                                                     |
| 4   | **Codes promo + limites d'usage** (par code, par client, une fois)       | Moyenne-haute (particuliers, lancement, fidélisation) | Moyen-élevé               | Condition « code » simple, mais les **compteurs** d'usage demandent une table, une réservation à la passation et un retour à l'annulation (Salesforce a des appels increase/decrease [S6]) |
| 5   | **X achetés, Y offert / produit offert** (« 6 + 1 », « un café offert ») | Moyenne-haute                                         | Élevé                     | Nouvel effet qui crée ou remise une ligne : touche bons, facture, Factur-X, colisage                                                                                                       |
| 6   | **X pour un total** (« 3 croissants 3 € »)                               | Moyenne                                               | Moyen                     | Un effet « total fixe pour N » au point ligne ; arrondi et ventilation à soigner                                                                                                           |
| 7   | **Max d'applications par commande**                                      | Faible seule ; nécessaire avec le 5                   | Faible                    |                                                                                                                                                                                            |
| 8   | **Exclusivité fine** (combinable avec telle promotion seulement)         | Faible                                                | Moyen                     | Notre case « Cumulable » + rangs calculés suffisent à notre échelle                                                                                                                        |
| 9   | **Livraison offerte au-delà d'un seuil**                                 | Moyenne (particuliers)                                | Moyen                     | Remise sur les frais de livraison, pas sur les articles : nouvel objet de remise                                                                                                           |
| 10  | Groupes dynamiques, codes source, A/B                                    | Faible                                                | Élevé                     | Outils de marketing de masse                                                                                                                                                               |

Ordre conseillé : 1 (plan prêt) → 2 → 3 → 4 → 5/6/7 ensemble. Tous touchent
l'argent : `vitruve` avant chaque bâti.

## 5. Sources

Consultées le 2026-10-31.

- [S1] Trailhead, _Learn About B2C Commerce Campaigns and Promotions_ — https://trailhead.salesforce.com/content/learn/modules/cc-digital-merchandising/digital-campaigns-and-promotions
- [S2] Trailhead, _Explore Discount Types and Promotion Controls_ (classes, types de remise, exclusivité, rang 10-100, ordre de traitement, maximum application, paliers) — https://trailhead.salesforce.com/content/learn/modules/b2c-campaigns-and-promotions/b2c-explore-discount-types-promotion-controls
- [S3] Trailhead, _Create Qualifiers_ (coupons, groupes statiques/dynamiques, codes source, calendrier début/fin) — https://trailhead.salesforce.com/content/learn/modules/b2c-campaigns-and-promotions/b2c-create-qualifiers ; _Create Campaigns_ — https://trailhead.salesforce.com/content/learn/modules/b2c-campaigns-and-promotions/b2c-create-campaigns
- [S4] Salesforce Developers, _Customize Promotions_ (approaching discounts, bonus products, ordre produit → commande) — https://developer.salesforce.com/docs/commerce/b2c-commerce/guide/b2c-promotions-for-developers.html
- [S4b] B2C Script API, classe `dw.campaign.Promotion` (`calloutMsg`, `exclusivity`, `rank`, `combinablePromotions`, `mutuallyExclusivePromotions`, `qualifierMatchMode`, `startDate`/`endDate`, A/B tests) — https://salesforcecommercecloud.github.io/b2c-dev-doc/docs/current/scriptapi/html/api/class_dw_campaign_Promotion.html (la page developer.salesforce.com équivalente a répondu 403)
- [S5] B2C Script API, classe `dw.campaign.Coupon` (`getRedemptionLimitPerCustomer`, `getRedemptionLimitPerTimeFrame`) — https://developer.salesforce.com/docs/commerce/b2c-commerce/references/b2c-script-api/dw.campaign.Coupon.html ; _Commerce Cloud Coupon Codes Platform Adoption Playbook_ (limites par code, client, période, commande) — https://resources.docs.salesforce.com/rel1/doc/en-us/static/pdf/Commerce_Cloud_Coupon_Codes_Platform_Adoption_Playbook.pdf
- [S6] Salesforce Commerce on Core, _Pricing and Promotions API_ (évaluation, compteurs de coupons increase/decrease) — https://developer.salesforce.com/docs/commerce/salesforce-commerce/guide/b2b-d2c-comm-pricing-promotions-apis.html ; objet `Promotion` (BOGO, API 56.0+) — https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/api/sforce_api_objects_promotion.htm
- [S7] Salesforce Commerce on Core, _Promotions Limits_ (50 + 50 évaluées par panier, 5 000 promotions, 1 M coupons) — https://developer.salesforce.com/docs/commerce/salesforce-commerce/guide/b2b-b2c-comm-data-model-promotions-limits.html
- [S8] `dw.order.PriceAdjustment` (prorata des remises de commande sur les lignes non exclues) — lu sur un miroir tiers, **non vérifié sur la source officielle** : https://glama.ai/mcp/servers/@taurgis/sfcc-dev-mcp/blob/4753526c80a6f57468f9a84cf789f62c8af65dd9/docs/dw_order/PriceAdjustment.md

**Non vérifié** : la récurrence jours/heures dans Business Manager ; le
comportement d'une commande modifiée après passation ; l'existence d'un
plancher de prix. Pages help.salesforce.com non atteintes par la recherche.
