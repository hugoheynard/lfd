# Plan — exporter une grille de prix pour une plaquette

> 📝 **Plan du 2026-10-31**, demande de Hugo. Lecture seule : aucun prix n'est
> écrit, aucune règle ne change.
>
> 🟦 **Bâti le 2026-10-31** (non commité) : `ExportPriceGridQuery` et
> `ListPriceGridPromotionsQuery` (`apps/lfd-api/src/lafoliecoffee/pricing/`, module
> `apps/lfd-api/src/lafoliecoffee/pricing/price-grid.module.ts`), routes `POST /admin/pricing/price-grid/{promotions,export}`
> sous `b2b_pricing:read`, contrat `@lfd/contracts` (`packages/contracts/src/price-grid.ts`), panneau
> « Exporter une grille de prix » sur `/pim/catalogue`. **Écarts au plan**, chacun
> en suspens chez Hugo :
>
> - ~~**« Les pros » en public type n'est pas bâti**~~ — bâti le 2026-10-31
>   par le § 8 (non commité) : « Pros (société active) » et « Pros en cours
>   d'inscription ».
> - **Les promotions du prix affiché ne se décochent pas** : la porte les applique
>   sans paramètre d'exclusion. Elles sont listées et nommées en tête.
> - **Un jour passé est refusé pour un particulier** (l'historique ne garde que
>   le tarif pro — `architecture-la-porte-du-prix.md`, § 1) ; un jour se lit à
>   00 h 00, heure de Paris ; une remise « à certains jours et heures » ne s'y
>   applique pas (pas de créneau, comme au devis).

## 1. La demande (Hugo, 2026-10-31)

> « Dans Catalogue › Vue d'ensemble, un export CSV où on peut demander pour
> une audience, et sélectionner quelle promo on prend en compte, et quelle
> partie de la promo. En pré-release les tarifs changent vite, et notre
> dernier choix du −20 % chez tout le monde qui a un compte fait que les
> commerciaux ont besoin de ressortir une plaquette. »

Précisions du même jour : **HT pour les pros, TTC pour les particuliers** ;
**option** pour le **prix au kilo**. Format : **CSV** (à retravailler dans un
tableur ; un PDF mis en page n'est pas demandé).

## 2. Ce qu'on choisit

1. **Pour qui** : un public type — pros (société active), particuliers
   inscrits, invités — ou **une société** précise (sa mercuriale et son
   réglage de promotions s'appliquent alors, cf.
   [`../promotions/plan-la-mercuriale-decide.md`](../promotions/plan-la-mercuriale-decide.md)).
2. **Quand** : aujourd'hui par défaut, ou une date (lecture datée de la
   résolution).
3. **Comment il reçoit** : retrait (à quel point) ou livraison (dans quelle
   zone) — les remises au panier en dépendent.
4. **Quelles promotions** : par défaut, toutes celles que ce public reçoit à
   cette date et pour cet acheminement ; on peut en décocher.
5. **Quelle partie** :
   - les remises **dans le prix affiché** sont dans le prix de l'article ;
   - pour chaque remise **au panier** retenue : « colonne à part » (le
     pourcentage ou le montant, son libellé), « prix net estimé » (appliquée
     article par article), ou « ignorée ».
6. **Prix au kilo** (option) : ajoute le prix au kilo **saisi** de la
   déclinaison (pro HT ou public TTC selon le public), quand il existe — une
   donnée informative, pas un calcul
   ([`saisie/plan-prix-au-kilo.md`](saisie/plan-prix-au-kilo.md)).

## 3. Le fichier

Une ligne par déclinaison vendue à ce public : famille, produit,
déclinaison, SKU, unité (pièce / kilo) ; prix de base ; prix après les
remises du prix affiché ; une colonne par remise de panier retenue en
« colonne à part » ; prix net (estimé si une remise de panier y entre) ;
prix au kilo (option). **HT pour un public pro, TTC pour un public
particulier.** Pour un article vendu au poids, les prix sont au kilo. Un
article non concerné par une remise a la cellule **vide**, pas zéro.

En tête du fichier (lignes de commentaire du CSV ou première ligne) : le
public, la date, l'acheminement, les promotions retenues et la mention
« Prix nets estimés : une remise de panier se calcule sur le panier entier,
avec un seul arrondi ; écart possible d'un centime par ligne. Document
indicatif, non contractuel. »

## 4. Comment

- **Serveur** : une requête de lecture (`ExportPriceGridQuery`) dans
  `lafoliecoffee/pricing`, qui résout chaque prix par la **porte du prix** (le
  `Pricer`, `lint:price-door`) avec les faits d'audience du public choisi,
  à la date choisie, puis applique les remises de panier retenues par la
  **règle même** de la caisse (`basket-promotion-choice` / la portée
  partagée `@lfd/contracts/promotion-scope`) — jamais un calcul parallèle.
  Une route admin sous `b2b_pricing:read` qui rend le CSV (UTF-8 avec BOM
  pour le tableur, séparateur `;`, virgule décimale française).
- **Écran** : un bouton « Exporter une grille de prix » sur la vue
  d'ensemble du catalogue (`/pim/catalogue`), qui ouvre un panneau fold avec
  les choix du § 2 ; la liste des promotions se remplit selon le public, la
  date et l'acheminement.

## 5. Les tests

- Un public pro : HT, mercuriale absente ; un public particulier : TTC.
- Une société sous mercuriale en « Aucune » / « Au choix ».
- Une remise de panier en colonne, en net estimé, ignorée ; un article
  exclu → cellule vide.
- Un article au poids → prix au kilo ; l'option prix au kilo saisi.
- Parité : le prix après remises du prix affiché = celui du rayon pour le
  même public et la même date.

## 7. Le « pro type » de l'aperçu staff (décision de Hugo, 2026-10-31, option a)

L'export ne peut proposer « les pros » comme public : la porte du prix ne
sait établir « société active » que d'une société réelle, et l'aperçu
déclaré (`previewed`, `promotion-targeting.ts`) n'admet volontairement que
« tout le monde » — sans quoi `?audience=pro` sur la boutique publierait une
promotion réservée.

**Proposition** : un acheteur **déclaré par le staff**, distinct de
`previewed`, qui porte des faits d'audience types — le modèle existe déjà :
`TYPICAL_BUYER` de l'annonce d'un point
(`promotions/domain/pickup-discount-announcement.ts` : `b2b` = société active
sans identité, `b2bPending`, `b2c`).

- Nouveau `PricedBuyerKind` (ex. `staff_typical`) qui porte la clientèle
  type (`pro_active` · `pro_pending` · `individual_registered` ·
  `individual_guest`) ; `LinePromotionSupply` et les remises de panier
  prennent ses faits **sans** lire de société ; le tarif (prix pro / prix
  public, service `pro` ou `public`) suit la clientèle type.
- **Mur** : ce genre d'acheteur ne se construit QUE dans un contrôleur admin
  sous permission staff (ici `b2b_pricing:read`), jamais depuis une route de
  la boutique — tenu par le type (la valeur n'est produite que par une
  fabrique du module d'export) et par un test qui vérifie qu'aucune route
  `/shop` ne l'accepte. Les publics nommés (une société, ses sites) n'y
  jouent pas : un pro type n'est aucune société.
- L'export propose alors : « Pros (société active) », « Pros en cours
  d'inscription », « Particuliers inscrits », « Particuliers sans compte »,
  ou « Une société précise ».

## 8. Après vitruve (2026-10-31) — fait foi sur le § 7

> 🟦 **Bâti le 2026-10-31** (non commité). `TypicalBuyer`
> (`apps/lfd-api/src/lafoliecoffee/promotions/domain/lot-buyer.ts`, constructeur privé,
> classe nominale) et sa fabrique `priceGridTypicalBuyer`
> (`apps/lfd-api/src/lafoliecoffee/pricing/application/price-grid-typical-buyer.ts`) ; `LotRequest.buyer`
> et `LotBuyer` = `real | typical` ; `lotBuyerFacts` (le `switch` du point
> ligne et du rayon) ; `TYPICAL_BUYER` dans `promotion-targeting.ts` ; ports
> `PriceGridViewerReader` et `PriceGridShelfReader.shelfFor(viewer)` ; contrat
> `pro_active` · `pro_pending` ; porte `lint:typical-buyer`
> (`dev-toolbox/gates/typical-buyer.mjs`). **Écart au texte** : la classe vit
> dans le domaine des promotions — un constructeur privé exige sa fabrique
> statique dans la même classe, et le domaine ne lit pas l'application ; la
> fabrique du module d'export l'enveloppe, et la porte refuse tout import en
> valeur de l'une ou de l'autre ailleurs. La société des faits d'une société
> précise est désormais celle que reçoit la porte du prix (`pricingCompanyOf`
> du lecteur), pour l'offre de ligne comme pour le panier.

1. **Un objet opaque, pas un nouveau `PricedBuyerKind`** : une chaîne de
   l'union s'écrirait depuis n'importe quelle route. `TypicalBuyer`, classe
   à constructeur privé, fabrique dans le module d'export ; la porte du prix
   reçoit `buyer: Real | Typical` (union discriminée) ; une porte d'import
   garantit que seul `pricing/application/price-grid-*` importe la fabrique.
2. **Des faits construits en amont**, sans passer par
   `PromotionAudienceFactsResolver` (qui rend « particulier » sans société,
   avant de lire le statut) ; les deux ternaires (`line-promotion-supply.ts`,
   `shelf-promotion-offers.ts`) deviennent des `switch` exhaustifs.
3. **Les ports de la grille prennent un lecteur, pas un `companyId`** :
   `PRO_ANONYMOUS_VIEWER` (`catalog/domain/catalog-viewer.ts`) pour un pro
   type — tarif pro HT, sans mercuriale ni tarif de canal, sans article
   réservé.
4. **Une seule définition du pro type** : `TYPICAL_BUYER` sort de
   `pickup-discount-announcement.ts` vers `promotion-targeting.ts`, lue par
   l'annonce d'un point et par la grille.
5. **Seulement deux clientèles types** : `pro_active`, `pro_pending` — les
   particuliers ont déjà leur vrai `buyerKind` sans société
   (`price-grid-context.ts`). Les deux pros ont le même tarif (`pending` vaut
   `pro`) et ne diffèrent que par les promotions qui les visent : à écrire
   dans l'en-tête.
6. **L'en-tête d'un pro type dit ses limites** : « hors conditions
   négociées, hors remises réservées à une société et ses sites, hors
   articles réservés, hors remises jugées au créneau ».
7. **`lens`** : `unproven` pour un pro type (projection) ; `measured` pour
   une société précise (son prix réel, engagements compris) — dit dans
   l'en-tête.

**Signalé à Hugo, hors lot** : `GET /pickup-addresses` est public et annonce
la remise du « pro actif type » d'un point à tout visiteur
(`promotion-pickup-discount.announcer.ts`) ; décision du 2026-10-15 à
confirmer (publier la remise pro d'un point est-il voulu ?).
