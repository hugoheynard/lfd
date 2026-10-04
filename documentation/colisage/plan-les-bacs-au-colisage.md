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

## 5. Contradiction de `vitruve` (2026-10-04), et la v2

Quatre BLOQUANTS, et une même racine : la v1 faisait naître le bac au colisage
et le **copiait** à la livraison par un fait. Or la déclaration d'un bac porte
des refus que seule la livraison sait tenir (type archivé ou non divisible,
commande hors livraison ou annulée, tournée partie), un code court unique
« sur tous les bacs, annulés compris » (`delivery_bin.code`, `drawBinCodes`),
un QR qui porte `DeliveryBin.id`, et un cycle de vie (annuler, décharger,
verrou au départ). Un fait asynchrone ne peut pas refuser à l'écran.

**v2 — la livraison garde le bac, le colisage garde le contenu.**

- **Un bac se crée par une DÉCISION synchrone.** Le colisage déclare un port
  `BinDesk` dans `packing/channels/delivery/` (« déclare ce bac pour cette
  commande », « annule-le », « propose un colisage »), que la livraison
  implémente (relié dans `appBootstrap`). Ses refus d'aujourd'hui remontent
  tels quels à l'écran. Le code et l'id sont tirés par la livraison, une seule
  fois, dans `delivery_bin`, comme aujourd'hui.
- **Matrice** : une arête `delivery → packing`, par `packing/channels/delivery/`
  seulement (la livraison implémente ce que le colisage déclare, sur le modèle
  de `b2b → delivery`). `packing → delivery` reste interdit. « Proposer » et les
  contenances restent à la livraison, derrière le même port : pas de cycle.
- **Le colisage tient le contenu** : `packing.container` (commande, nature
  `bin` | `bag`, et pour un bac l'id **opaque** de `delivery_bin`) et
  `packing.container_line` (contenant, SKU, quantité ; une ligne se coupe).
  « Au bac » d'une ligne = la somme de ses répartitions.
- **Les sacs** n'ont pas de livraison : ils naissent et vivent au colisage.
  `delivery_bin.inner_bags` (les sacs posés DANS un bac, imprimés) reste ce
  qu'il est ; ce n'est pas un contenant de retrait.
- **Cycle de vie** : annuler un bac passe par le port (la livraison refuse un
  bac chargé ou une tournée partie) ; le colisage retire alors son contenu.
  Rouvrir une commande ne touche que le contenu. Le demi-bac partagé reste une
  affaire de la livraison (`shareCandidate`, adjacence) : un contenant du
  colisage pointe une **moitié** de bac (`delivery_bin` porte la moitié), et
  deux commandes peuvent donc pointer le même bac physique.
- **« Partir »** ne change pas : le bac existe dès la déclaration, avant tout
  chargement.
- **Bascule** : les commandes dont des bacs sont déjà déclarés gardent
  l'ancien écran ; la colonne Contenants s'ouvre pour les journées **closes
  après** le déploiement (colonne `packing_order.containers` posée à la
  création de la liste à coliser). Aucun bac existant n'est repris.
- **Contrat servi** : `container_count` et `PackingContainerStep` restent servis
  pour les commandes de l'ancien écran ; pour les nouvelles, le compte devient
  le nombre de contenants, en lecture seule.

### 5.1 Seconde contradiction (2026-10-04), et la v2.1

- **B1 — les routes d'écriture de la livraison** (`declare-delivery-bins`,
  `void-delivery-bin`, `share-delivery-bin`) contourneraient le colisage. →
  **Le port est la seule porte** pour une commande gérée au colisage : le
  colisage publie dans `packing/channels/delivery/` un lecteur
  `ContainerManagedOrders` (implémenté par le colisage lui-même, sur le
  modèle de `LegacyPackingReader`) ; les trois commandes de la livraison le
  lisent et refusent, avec un message qui dit le geste de sortie (« ce bac se
  gère au poste de colisage »). Le **partage** d'une moitié passe lui aussi
  par `BinDesk`. Défense en profondeur : `BinDesk` expose aussi « ces bacs
  sont-ils vivants ? », et le colisage ne compte jamais un contenant dont le
  bac est annulé.
- **B2 — l'atomicité** : l'implémentation de `BinDesk` s'exécute dans la
  transaction du colisage. `UnitOfWork.run` **rejoint** une transaction déjà
  ouverte (`platform/database/unit-of-work.ts` l.40-50, vérifié le
  2026-10-04) : le bac et son contenant s'écrivent ensemble, ou pas du tout.
- **Pas de DELETE** : un contenant annulé porte `voided_at` ; ses lignes
  restent, ignorées, et le fait est journalisé.
- **L'id du bac sans clé étrangère** : tenu par le port à l'écriture, et
  relu vivant par `BinDesk` à la lecture.
- **Rouvrir une commande dont un bac est chargé ou parti** : refusé par la
  livraison au retrait du contenu (même refus qu'à l'annulation d'un bac
  chargé).
- **Le drapeau** s'appelle `packing_order.container_mode` (`counted` | `listed`,
  défaut `counted`) ; `listed` est posé à la création de la liste à coliser
  après le déploiement. Une commande `listed` à laquelle la livraison aurait
  déclaré un bac par l'ancienne route ne peut pas exister : la route la refuse
  (B1).
- **`PackingContainerStep`** sur une commande `listed` : refus nommé
  (« le nombre de contenants se lit dans la colonne Contenants »).
- **CLAUDE.md §3, la matrice et `lint:context-boundaries`** : dans le même
  commit que l'arête `delivery → packing`.
