# Plan — exporter une grille de prix pour une plaquette

> 📝 **Plan du 2026-10-31**, demande de Hugo. Lecture seule : aucun prix n'est
> écrit, aucune règle ne change.
>
> 🟦 **Bâti le 2026-10-31** (non commité) : `ExportPriceGridQuery` et
> `ListPriceGridPromotionsQuery` (`apps/lfd-api/src/b2b/pricing/`, module
> `apps/lfd-api/src/b2b/pricing/price-grid.module.ts`), routes `POST /admin/pricing/price-grid/{promotions,export}`
> sous `b2b_pricing:read`, contrat `@lfd/contracts` (`packages/contracts/src/price-grid.ts`), panneau
> « Exporter une grille de prix » sur `/pim/catalogue`. **Écarts au plan**, chacun
> en suspens chez Hugo :
>
> - **« Les pros » en public type n'est pas bâti** : la porte du prix ne sait
>   établir « société active » que d'une société réelle, et l'aperçu déclaré
>   (`previewed`) n'admet que « tout le monde ». Pour les pros : choisir une société.
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
  `b2b/pricing`, qui résout chaque prix par la **porte du prix** (le
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
