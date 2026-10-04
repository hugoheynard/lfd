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

## 6. K2b bâti, côté serveur (2026-10-04) — ce qui a été tranché en bâtissant

État : **serveur et contrats bâtis**, écran à faire.

- **Portes d'abord** : `delivery → packing` par `packing/channels/delivery/`
  seulement (`lint:context-boundaries`, CLAUDE.md §3).
- **`BinDesk`** est implémenté par `DeliveryBinDesk`, qui passe par
  `DeliveryBinOffice` : les trois anciens handlers y ont été extraits, et ils y
  délèguent après avoir lu `ContainerManagedOrders`. « Proposer » passe par le
  cas de lecture de la livraison. Le tout est relié par
  `apps/lfd-api/src/appBootstrap/packing-delivery-feed.module.ts`.
- **Schéma** (`20261004230000_les_contenants_au_colisage`) : la colonne
  `packing_order.container_mode`, plus `packing.container` et
  `packing.container_line`. Le code et la moitié du bac y sont un
  **instantané** pris à la déclaration, sans clé étrangère. Les lignes portent
  `service_day` pour les déclencheurs `day_change`.
- **L'agrégat** : `PackingSheet` porte `OrderContents`. Sur `listed`, la coche,
  « + »/« − » et le total sont refusés, et une ligne est au bac quand toute sa
  quantité est répartie (signée par le geste qui la complète). La fermeture
  exige que tout soit réparti, et le compte de contenants devient celui des
  contenants vivants.
- **Faits** : `packing_container.opened|filled|emptied|voided`, sujet la
  commande, rangés sous le module `production`.
- **Un sac sur une commande livrée est refusé** (Hugo, 2026-10-04 :
  livraison = bacs, retrait = sacs) — `packing.container.bag_on_delivery`.
- **Hors lot : « rouvrir » une commande fermée n'existe pas.** Le refus du
  §5.1 (« rouvrir une commande dont un bac est chargé ») attend que ce geste
  soit conçu.
- **Non fait, et dit** : le retrait du contenu d'un bac **chargé** sur une
  commande encore ouverte n'est pas refusé par la livraison (§5.1 : il n'existe
  pas de « rouvrir », et `BinDesk` n'a pas de garde « intact »). Le semis de dev
  garde les commandes livrées en `counted`, parce qu'il compose les tournées
  après le colisage.

## 7. Suite de K2b bâtie, côté serveur (2026-10-04)

État : **serveur et contrats bâtis**, écran à faire.

- **« Proposer », appliqué par le serveur d'un seul coup** —
  `POST admin/packing/:date/orders/:orderId/proposal/apply` (204), une seule
  unité de travail. La règle, écrite dans `distributeProposal`
  (`apps/lfd-api/src/packing/domain/services/proposal-distribution.ts`), pure :
  1. les bacs d'une entrée de la proposition sont ses `whole` bacs entiers,
     puis sa moitié ; les entrées gardent l'ordre de la livraison (froid
     d'abord) ;
  2. chaque bac se remplit **avant le suivant**, article par article dans
     l'ordre des SKU, avec la règle de place de la livraison : une unité
     occupe `1 / contenance(type, SKU)` d'un bac entier, une moitié offre 0,5 ;
  3. on ne place que ce qui est **disponible** : ce qui reste de la ligne,
     borné par la réserve (`reçu − rendu − au bac`). Ce qui ne rentre pas, ou
     n'est pas encore sorti du four, reste « à répartir » ;
  4. un bac proposé naît **même vide** : la proposition dit combien de bacs la
     commande demande, et ce qui sortira du four ira dedans.
  - L'ordre des verrous est celui des autres gestes : commande, puis bacs chez
    la livraison (`BinDesk.declareBin`, qui rejoint la transaction), puis la
    réserve de chaque article dans l'ordre des SKU. Un refus, n'importe où, et
    rien n'est écrit.
  - **Refusé sur une commande qui a déjà un contenant vivant**
    (`packing.proposal.containers_exist`) : la proposition dimensionne toute la
    commande, et la mêler à des contenants faits doublerait des bacs. Une
    commande dont tous les contenants ont été annulés se repropose.
  - **Une proposition vide est refusée** (`packing.proposal.empty`), en
    renvoyant à l'écran « Contenances » (décision 4 : la grille est peu
    remplie).
  - Le partage d'une moitié voisine (`shareCandidate`) n'est **pas** appliqué :
    c'est un dernier recours, qui se fait à la main.
  - Les contenances arrivent par `BinDesk.capacities()` — les mêmes
    `activeCapacities` que lit la proposition.
- **Partager une moitié depuis le colisage** —
  `GET admin/packing/:date/orders/:orderId/shareable-halves`
  (`DeliveryBinFreeHalvesView`), servi par la livraison derrière
  `BinDesk.freeHalves()` (son cas de lecture, sa règle d'adjacence). Le
  contenant se crée sur la moitié par la route existante
  (`POST containers`, `{ nature: "bin", partnerBinId, innerBags }`).
- **Le retrait partiel** était déjà permis par le contrat
  (`POST containers/:id/lines/:sku/withdrawal`, une quantité) : vérifié et
  éprouvé aux trois niveaux.
- **« Rouvrir » une commande déclarée prête : NON bâti, et c'est un refus de
  la règle, pas un oubli.** Fermer une commande publie `packing.order_packed`,
  et le commerce la passe `ready`. Or le commerce tient que **les états ne
  reculent jamais** (`b2b/orders/domain/services/packing.ts`,
  `production-plan.ts`, `prisma-order.repository.ts` `absorbIntoPlan`, vérifié
  le 2026-10-04) : aucune transition `ready → confirmed | in_production`
  n'existe, `markReady` est conditionné en base, et `OrderReadyEvent` a déjà
  prévenu le client. Rouvrir côté colisage sans rien republier laisserait le
  comptoir lire « prête » une commande dont les lignes ressortent des bacs.
  **À trancher par Hugo** : soit une transition commerce nommée (« rouverte »,
  avec ce qu'elle dit au client et au comptoir), soit un « rouvrir » qui ne
  touche que le rangement des contenants (pas les quantités) et laisse
  `ready`. Les gardes côté livraison (bac chargé, tournée partie, §5.1) ne
  dépendent pas de ce choix.
