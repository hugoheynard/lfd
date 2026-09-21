# Un seul canal, deux prix — ce qui reste

> **2026-09-21.** Écrit comme un plan le matin, **bâti dans la journée**, puis
> ramené ici à ce qui reste : 970 lignes → 300.
>
> **Où est parti le reste :** ce qui décrit le système **tel qu'il est** vit
> dans [`chemin-du-prix-public.md`](../pricing/chemin-du-prix-public.md) ; ce
> qui a été construit est dans l'historique git, avec ses raisons. Ce document
> ne garde que **ce qui n'est pas fait**, les décisions qui font autorité, et
> les fautes qui valent d'être relues.

## 1. Ce qui marche, en cinq lignes

Le référentiel pose **une** étiquette TTC. **Un seul push** la porte — avec le
prix pro dérivé et la TVA de chaque contexte. Le miroir range les deux ; la
plateforme peut décider les deux ; la lecture en sert **un** selon qui regarde ;
le rayon d'un particulier l'affiche en TTC, celui d'un pro en hors taxe.

Mesuré après semis sur la base de dev : **93 articles vendables sur les deux
boutiques**. Le croissant est à 2,00 € TTC au comptoir, 1,71 € HT au pro — et son
étiquette, refacturée par la chaîne de la caisse, redonne exactement 2,00 €.

## 2. Ce qui reste

| #      | Quoi                                   | Coût                    | Ce qui le retient             |
| ------ | -------------------------------------- | ----------------------- | ----------------------------- |
| ~~R1~~ | ✅ **Désinstaller l'app Shopify**      | fait le 2026-09-21      | —                             |
| R2     | Le **panier public** en TTC            | une passe front         | rien                          |
| R3     | Le **bon de commande public** en TTC   | une passe               | rien                          |
| R4     | L'**export CSV** ignore le prix public | une passe               | rien                          |
| R5     | Le **masquage par audience**           | migration de données    | soudé à l'œil-par-colonne     |
| R6     | Le **schéma** — les tables Shopify     | une migration           | le **prochain déploiement**   |
| R7     | Les **écrans de doc internes**         | une passe               | une décision de forme (§ 3.7) |
| R8     | Les **94 déclarations d'allergènes**   | de la saisie            | humain, pas du code           |
| R9     | Trois **questions techniques**         | à trancher en bâtissant | rien                          |

✅ **R1 est fait, et c'était le seul qui coupait un accès réel.** Tout ce qui
reste est du confort ou de la dette.

## 3. Le détail

### 3.1 ✅ R1 — l'app Shopify est désinstallée (2026-09-21)

Le code était parti depuis le matin ; **le jeton, non**. C'est la
désinstallation depuis le **Dev Dashboard Shopify** qui le révoque — un jeton
vit chez le fournisseur, pas chez nous.

⚠️ **Et les « trois secrets à retirer de GitHub et Cloudflare » n'existaient
pas.** Vérifié le jour même : aucun `SHOPIFY_*` parmi les vingt-deux secrets du
dépôt, donc la boucle de synchronisation du workflow — qui ne pousse un nom que
s'il est **non vide** — les a toujours sautés. Ils vivaient dans le `.env` du
poste, et lui seul.

🔴 **C'est la leçon de ce reste, et elle survit à sa clôture** : on a cherché
une clé à trois endroits en supposant qu'elle y était, alors qu'elle n'était
qu'à un. Chercher au mauvais endroit et n'y rien trouver fait conclure qu'il n'y
a rien — c'est exactement le raisonnement qui laisse un identifiant en vie.

### 3.2 R2 — le panier public en TTC

Le rayon annonce 2,00 € TTC ; la ligne du panier dit encore 1,90 € HT. Le client
lit donc deux prix différents pour le même article entre la vignette et son
panier, et conclut que le prix a changé.

⚠️ **La ventilation, elle, reste en l'état** (Hugo, 2026-09-21 : « la
ventilation marche super comme ça »). C'est le décompte d'une facture — hors
taxe puis TVA par taux — et il se lit ainsi même pour un particulier. Ce qui
bascule est **la ligne**, pas le pied.

### 3.3 R3 — le bon de commande public en TTC

`order-sheet-pdf.ts` titre ses colonnes « PU HT » et « Total HT », et ne porte
le TTC qu'en ligne de total. Servi à un particulier, il doit montrer des prix
**unitaires TTC** — même exigence que la vignette, au même titre.

⚠️ **Un PDF est archivé à sa PREMIÈRE lecture** : les bons déjà émis resteront
en hors taxe, et c'est le comportement correct — on ne réécrit pas un document
remis.

### 3.4 R4 — l'export CSV

`catalog-csv.ts` promet « les trois prix, côte à côte » dans son JSDoc et porte
huit colonnes, **toutes professionnelles**. Le fichier qu'on ouvre pour relire
une grille de prix tait donc celui que la vitrine applique.

### 3.5 R5 — le masquage par audience

> « Masquer dans chaque colonne, avec un œil barré. » — Hugo, 2026-09-21.

🔴 **Un œil par colonne EXIGE le masquage par audience.** Sans lui, deux
contrôles basculeraient le même booléen : deux yeux, un seul état, et l'un
mentirait quoi qu'on fasse. Les deux moitiés ne sont pas séquençables.

Le défaut est **déjà là** : `listSellable` lit `isHidden` sans regarder qui
demande, donc masquer un article le retire des **deux** boutiques. Un
conditionnement de quarante pièces n'a rien à faire en vitrine publique, une
pièce à l'unité n'intéresse pas un pro — deux décisions, un seul bouton. En
attendant, la phrase de confirmation le **dit**.

Ce que ça demande : une migration de **données** sur une base en service — la
valeur actuelle doit se répartir sur deux colonnes sans qu'un article change de
visibilité au passage. Trois déploiements (CLAUDE.md § 0), et `vitruve` d'office.

⚠️ **`isFeatured` sort du découpage** : sa colonne a quitté le catalogue, et
l'écran qui la réglera n'existe pas encore. Le segment « En avant » reste en
LECTURE seule — retirer aussi le compte laisserait un état de la boutique que
plus rien ne montre.

### 3.6 R6 — le schéma, au déploiement suivant

`DROP` de `ShopifySettings`, `ShopifyProductBinding`, `ShopifyVariantBinding`,
`ShopifyPushSnapshot`, et des enums `ShopifySyncStatus`, `ShopifyChannelMode`,
`ShopifyPushOutcome`.

⚠️ **Trois registres tenus à la main suivent dans le MÊME commit**, sans quoi
`schema-parity.spec.ts` devient rouge :

- `platform/database/schema-ops.counter.ts` — les quatre modèles ;
- `pim/infra/database/pim-prisma.service.ts` — les quatre délégués abstraits ;
- `prisma/schema/pim/product.prisma` — les deux back-relations `shopifyBinding`.

⚠️ Et **ni `handle_suffix` ni `shopify_projected` ne tombent avec eux** : ce sont
des champs **obligatoires** d'un contrat servi à un back-office en service. Trois
déploiements.

### 3.7 R7 — les écrans de documentation interne

Une dizaine de gabarits du back-office décrivent encore l'architecture avec
Shopify dedans : les trois diagrammes (`system-diagram`, `upsert-diagram`,
`catalogue-to-tool-diagram`), trois pages PIM (`overview`, `bricks`,
`general-settings`), la section « Intégrations » de la fiche produit, la page des
taux de TVA, et `pim/data/models.ts` qui déclare encore `ShopifySettings`.

Ce sont des écrans **lus par le personnel**, pas du code exécuté : ils ne cassent
rien, mais ils décrivent un système qui n'existe plus. C'est le genre de dette
qui ne fait jamais mal assez pour être payée — d'où sa ligne ici.

⏳ **Une décision de forme attend** (Hugo, 2026-09-21) : « Intégrations » peut
disparaître, et « collection » devient « collection datée » dont on peut effacer
tout le contenu. Reste à savoir ce que **datée** veut dire — la date du **push**
qui l'a produite, donc un historique purgeable, ou un contenu daté article par
article. Les deux mènent à des écrans différents, et on efface de la donnée.

### 3.8 R8 — les 94 déclarations d'allergènes

> ✅ **D10 : on ouvre sur ce qui est déclaré.** Ce n'est pas un préalable.

🔴 **C'est une décision de NE RIEN BÂTIR.** La porte existe déjà :
`Product.publish()` refuse une fiche dont une déclinaison active n'a pas de fiche
réglementaire (invariant 7), et la boutique ne montre que ce qui est publié.
« Ouvrir sur ce qui est déclaré » **est déjà le comportement du code**.

La contrepartie n'est pas technique :

- **Ouvrir n'est pas annoncer.** Dire au public que la boutique existe est un
  geste séparé, et il attend un rayon crédible.
- **L'ORDRE de saisie est une décision commerciale.** Les meilleures ventes
  d'abord : la courbe de remplissage pilote le chiffre d'affaires, pas un jalon
  technique.

⚠️ **Les chiffres sont à recompter.** « 95 déclinaisons actives, 1 déclaration »
vient d'une mesure du 2026-09-02 sur la base de dev. La production peut dire
autre chose.

ⓘ La **contamination croisée d'atelier** est tranchée ailleurs et non
implémentée : [`05-allergenes-gs1-inco.md`](data-model/05-allergenes-gs1-inco.md)
§ D7 — elle se déclare une fois et **ajoute**, elle ne remplace pas.

### 3.9 R9 — les trois questions techniques

| #      | Question                                                                                                                               |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Q1** | La ligne de commande **stocke-t-elle** le TTC public, ou le recalcule-t-on à chaque relecture ? (`orders.prisma` est tout hors taxe.)  |
| **Q2** | **Où vit la fonction qui lit les deux entrées** — quel prix, quel taux pour cette audience ? Une porte nommée, sinon elle se duplique. |
| **Q3** | `quote-order-parity` doit tenir **pour les deux audiences**.                                                                           |

⚠️ **Q3 est la seule qui puisse coûter cher** : une parité verte ne prouve pas
qu'un montant est **juste**, seulement que deux chemins **s'accordent**. Ils
s'accorderaient tout aussi bien sur un taux faux.

### 3.10 Un défaut latent, constaté et non corrigé

`listSellable` exige `vatRatePercent NOT NULL` sur l'article — le taux du canal
**professionnel** — avant même de regarder l'audience. Un article qui n'aurait
qu'un prix public disparaîtrait donc de la vitrine publique sans qu'on sache
pourquoi.

Le cas n'existe pas aujourd'hui : le référentiel pousse les deux ou aucun. Mais
**la condition dit une chose qu'elle ne veut pas dire**, et c'est ainsi que les
défauts silencieux commencent.

---

## 4. Les décisions qui font autorité

Elles gouvernent encore, et le code les cite.

| #       | Décision                                                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------ |
| **D1**  | Le prix public part **en TTC et en hors taxe** — les deux voyagent sur le fil.                                           |
| **D2**  | Les **contextes de vente restent** ; deux colonnes de `SalesContext` ne sont pas les contextes.                          |
| **D6**  | 🔴 **Le hors taxe fait foi.** La dérive d'un centime est bornée, ORIENTÉE, et acceptée — mesurée, pas supposée.          |
| **D7**  | La boutique publique expose **`takeaway`**, et rien d'autre pour l'instant.                                              |
| **D9**  | **Pas de facture pour le public** — un bon de commande chiffré.                                                          |
| **D10** | On **ouvre sur ce qui est déclaré**. Décision de ne rien bâtir.                                                          |
| **D11** | Le prix public se pose **aussi** sur la plateforme : les deux prix y sont symétriques, ni l'un ni l'autre n'est l'ancre. |
| **D12** | Le prix posé est une **ENTRÉE**, pas un affichage. Ce qui se montre est le TTC **encaissé**.                             |
| **D13** | Le rayon d'un **particulier** est en TTC, celui d'un **pro** en hors taxe.                                               |

🔴 **D6 et D12 ont été tranchées sur MESURE**, et les deux mesures sont
rejouables : [`arrondi-ttc-vs-ht.mjs`](../../dev-toolbox/analyses/arrondi-ttc-vs-ht.mjs)
et [`ancrage-du-ttc-pose.mjs`](../../dev-toolbox/analyses/ancrage-du-ttc-pose.mjs).
La première a **renversé** la recommandation qu'on s'apprêtait à faire.

⚠️ **Ce que D11 a nommé, et qui vaut au-delà du prix** : le rapport pro/public
est un **outil de saisie**, pas une règle de tarification. Il ne traverse ni le
fil ni la résolution — il s'applique une fois, à la projection.

---

## 5. Ce que ce chantier a appris

Gardé parce que ces fautes reviennent, pas par goût de l'aveu.

| La faute                                               | Ce qu'elle a coûté                                                                                                            |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| **Un grep vide n'est pas une absence**                 | « aucune occurrence de shopify » — il y en avait **6**. Le grep était en minuscules, les fichiers écrivent `Shopify`.         |
| **Compter sans filtrer `dist/`**                       | 1 870 lignes annoncées pour **805**.                                                                                          |
| **Recopier un numéro de ligne sans ouvrir le fichier** | `orders.prisma:473` cité deux fois — c'est `order_late_fee`. Sur de l'argent.                                                 |
| **Dire « vert » sans la racine**                       | Deux fois le même jour, sur la même clé de contrat. Une spec front qui ne compile pas **éteint 983 tests** sans en rougir un. |
| **Lire une porte derrière un pipe**                    | Deux commits sur un arbre rouge : le code de sortie est celui de la dernière commande.                                        |
| **Prédire le coût d'une correction**                   | « dix e2e » annoncés, **quarante-deux** rouges — et la cause était le SEMIS, pas les attentes.                                |
| **Justifier par l'état d'un autre fichier**            | « un seul endroit à changer » : faux le soir même. « La plateforme n'a pas le droit » : la porte exclut `@lfd/…`.             |
| **Calculer un affichage autrement que la caisse**      | Un « encaissé » plus fin que la ventilation réelle — il taisait exactement les cas qu'il devait montrer.                      |

🔴 **Le point commun des trois dernières** : une affirmation sur du code
**voisin** ne se démasque jamais en relisant le fichier où elle vit. C'est le
seul commentaire dangereux, et c'est pour ça qu'il porte une date.

⚠️ **Ce qui a le mieux marché** : mesurer plutôt que raisonner. Deux décisions
d'argent ont été prises sur un script qui importe le code réel, et la première a
contredit ce qu'on allait recommander.

---

## Annexe — ce que ce document ne porte pas

- **L'assortiment sur la matrice.**
  [`ecrans-du-cycle-catalogue.md`](ecrans-du-cycle-catalogue.md) § 3 le porte
  mieux, avec un retrait **irréversible au troisième déploiement**.
  ⚠️ Deux pièges à ne pas perdre : le compteur `candidates`
  (`feed-projection.service.ts`) est compté **avant** le filtre de matrice — s'il
  y reste, on obtient `candidates = 95` pour `products = []`, le garde ne se
  déclenche pas et le pilote `live` **retire tout**. Et `stamp()` fait un
  **`updateMany`** : sans ligne préexistante, il n'estampille rien.
- **Non vérifié** : la comptabilité et la facturation n'ont pas été ouvertes.
  `b2b/growth/domain/activity-slice.ts` et `b2b/order-waivers/` lisent
  `vatRatePercent` et ne sont dans aucun inventaire.
