# Les bacs au colisage — K2b

> Hugo, 2026-10-04 : « pourquoi le système des bacs n'apparaît que sur les
> commandes prêtes ? On devrait avoir une colonne Containers entre Produits et
> À répartir, y créer des containers et y glisser les produits. » État :
> **doc-first**. À bâtir après K2 (`plan-domaine-colisage.md`), et à faire
> contredire par `vitruve` avant (une frontière colisage ↔ livraison change).

## 1. Pourquoi les bacs ne viennent qu'après « prête » (relu le 2026-10-04)

Deux chantiers, l'un après l'autre :

- **Le colisage du fournil** coche les lignes « au bac » puis déclare la
  commande prête. Le « bac » y est une image : `container_count` est un
  nombre.
- **Les bacs de livraison** (lot 4 de la livraison, `delivery.delivery_bin`)
  sont nés pour le **chargement** : type, moitié, code court, QR, étiquette,
  scan. Ils se déclarent **après** « prête »
  (`packing-open-order.html` : « les bacs d'une livraison se déclarent ici,
  une fois la commande prête ») et pour une livraison seulement. Le serveur
  propose une répartition (`propose-packing.ts`), mais le bac déclaré ne
  garde **pas** son contenu.

L'écran suit donc l'ordre des chantiers, pas celui du geste.

## 2. Décisions de Hugo (2026-10-04)

1. **Une colonne « Contenants »** entre « Produits » et « À répartir ». On y
   crée des contenants, et on y **glisse** les produits.
2. **Une ligne se coupe entre deux contenants** (20 croissants = 10 + 10) :
   au glisser, on demande la quantité, « tout » par défaut.
3. **Un retrait a des contenants aussi : des sacs à emporter**, pas des bacs.
   Ils auront des étiquettes ; le format se décide plus tard (plan des
   imprimantes, `impression/plan-imprimantes-thermiques.md`).
4. **La proposition se fait sur un clic « Proposer »**, pas d'office. Il
   manque la donnée qui la rendrait fiable : le nombre d'unités d'un produit
   par contenant. La grille existe (`delivery.delivery_bin_capacity`, écran
   « Contenances », une ligne par type de bac × SKU) mais elle est **peu
   remplie**, et rien n'existe pour les sacs. **À noter : remplir les
   contenances avant de proposer d'office.**

## 3. La forme proposée

- **Le colisage possède le contenant et son contenu.** Table `packing.container`
  (commande, nature `bin` | `bag`, type de bac et moitié pour un bac, état
  ouvert/fermé, code court et QR pour un bac) et `packing.container_line`
  (contenant, SKU, quantité). « Au bac » d'une ligne = la somme de ses
  répartitions ; une ligne est colisée quand toute sa quantité est répartie.
- **Fermer la commande ferme ses contenants** ; on ne ferme pas une commande
  dont une quantité n'est pas répartie.
- **La livraison reçoit un fait `packing.bin_closed`** (bac, type, moitié,
  code, commande, contenu) et tient sa copie `delivery_bin` pour le
  chargement, le scan et « Partir ». On ne déplace pas `delivery_bin` : ses
  chargements, ses déclencheurs `day_change` et « Ma tournée » restent chez
  elle. Les sacs ne vont pas à la livraison.
- **La déclaration actuelle des bacs après « prête »** disparaît pour les
  journées `packing` ; elle reste servie pour les journées `legacy`.
- **« Proposer »** reprend `propose-packing.ts` (il passe au colisage, ou la
  livraison l'expose par un port — à trancher dans le plan détaillé).

## 4. Questions ouvertes

- La moitié de bac partagée entre deux commandes (aujourd'hui `shareCandidate`,
  « à refaire ») : un contenant appartient-il à une commande, ou à un arrêt ?
- Les étiquettes des sacs : quand, et quel contenu.
