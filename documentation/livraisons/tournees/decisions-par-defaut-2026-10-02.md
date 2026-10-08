# Décisions par défaut — livraison, à revoir avec Hugo

> 🟠 **Prises par l'assistant le 2026-10-02**, à la demande d'Hugo : « transforme
> les points en affirmatives pour revoir ensemble ensuite ». **Aucune n'est
> validée.** Chacune dit ce qui est bâti à partir d'elle, pour qu'un refus
> sache quoi défaire. Le critère de choix : le geste le plus réversible, qui
> n'engage ni argent ni donnée irrécupérable.

> 🔎 **Relu contre le code le 2026-10-07.** Tout ce qui est dit bâti ici est
> commité : les commits sont au § 4, au tableau des lots (§ 5), et G5 est
> `19fece6b1`. Le § 1 et la ligne PC1 du § 5 sont **périmés par K3c**
> (bandeau au § 1), le § 2 l'est pour ses lignes 2 et 3. G5e (§ 6) est
> vérifiée depuis le 2026-10-06.

> ✅ **§ 1 et § 2 validés par Hugo le 2026-10-08**, tels qu'en place
> (Q1, Q3, Q4 ; parcours du coliseur 1, 4 à 8). Le point 4 du § 2 (une ligne
> qui ne viendra jamais) reste hors application tant que les avenants
> n'existent pas.
>
> ✅ **§ 3 et § 4 validés par Hugo le 2026-10-08** (l'ordre figé en route ;
> les commandes rapportées, leur feuille de route, « Proposer » qui les
> inclut).

## 1. Le « + » choisit un bac (plan retiré le 2026-10-05, § 5)

> ⚠️ **Périmé par K3c (`753f3e4f8`, 2026-10-05).** Ce que PC1 avait bâti — la
> rangée « + format » (`packing-bin-row`), le format proposé en couleur, le
> « − » sur le dernier bac et les avertissements à « prête »
> (`readyWarnings`) — est retiré, comme le compte anonyme « + / − » du
> retrait. Depuis K2b et K3, le poste ouvre des **contenants** (bacs en
> livraison, sacs en retrait) et y répartit les lignes, ou applique
> « Proposer » d'un coup ; un contenant s'annule, un autre s'ouvre. L'état du
> poste est dans [`../../colisage/colisage.md`](../../colisage/colisage.md) (§ 4.2
> les contenants, § 4.4 « Proposer », § 6 l'écran). Q3 reste vraie : une
> moitié de bac voisin se partage au poste (« Partager une moitié »).
>
> Les questions Q1 à Q4 et les décisions D2 à D4 citées ici sont celles du
> plan « Le « + » choisit un bac », retiré le 2026-10-05 et lisible dans
> l'historique :
> `git show a03a95f50:documentation/colisage/plan-le-plus-choisit-un-bac.md`
> (§ 5 pour les questions, § 2 pour les décisions). Le lien de ce titre
> menait à `colisage.md` § 5, qui est devenu « Les routes HTTP ».
>
> ✅ **Tranché et bâti le 2026-10-07** (Q3 de l'audit) : avertir sans bloquer —
> la fiche du poste porte `coldOutsideIsotherm` (`colisage/colisage.md`, § 6).
> Le constat d'origine suit, pour mémoire : avec
> `readyWarnings`, plus rien ne garde le froid au colisage. Une commande qui
> porte du froid se déclare prête sans bac isotherme, sans avertissement ni
> refus : la règle de « Prête » (`canDeclareReady`,
> `apps/lfd-api/src/packing/domain/services/packing-board-sheet.ts:24`) ne
> regarde que les lignes au bac. Voulu ?

| #   | Question                               | Décision par défaut                                                                           | Bâti                                                                                                      |
| --- | -------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Q1  | Le comptoir passe-t-il en bacs typés ? | **Non**, pas encore : le retrait garde son compte anonyme (D4 du plan retiré).                | rien ; le compte anonyme est retiré par K3c : le retrait colise en sacs                                   |
| Q2  | La proposition calculée : retirée ?    | **Mise en avant** : le bouton du format proposé est en couleur ; rien n'est déclaré d'office. | lot PC1 — bâti 2026-10-02 (`507564e72`) ; **retiré par K3c** : « Proposer » s'applique d'un coup au poste |
| Q3  | Le demi-bac partagé : au poste ?       | **Au poste**, inchangé.                                                                       | rien                                                                                                      |
| Q4  | Changer M en L                         | **« − » puis « + »** : nouvelle étiquette ; pas de geste qui garde le QR.                     | lot PC1 — bâti 2026-10-02 (rien de neuf) ; depuis K3c : « Annuler » le contenant, puis « Nouveau bac »    |

## 2. Le parcours du coliseur ([`../../colisage/parcours-du-coliseur.md`](../../colisage/parcours-du-coliseur.md))

| #   | Question                                        | Décision par défaut                                                                                                                                        | Bâti                                                                                                                                                                                                                      |
| --- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Coliser par tournée, dernier arrêt d'abord ?    | **Oui, comme ordre d'affichage** : le poste range les commandes livrées par tournée, du dernier arrêt au premier ; rien n'est imposé.                      | lot PC2 — bâti 2026-10-02                                                                                                                                                                                                 |
| 2   | Déclarer les bacs avant ou après avoir rempli ? | **Libre** : la rangée « + format » est là pendant le remplissage ; la déclaration fait foi.                                                                | lot PC1 — bâti 2026-10-02 (`507564e72`) ; **rangée retirée par K3c** : on ouvre un contenant (« Nouveau bac ») puis on y répartit, ou « Proposer » ouvre et remplit d'un coup                                             |
| 3   | Savoir quel produit est dans quel bac ?         | ~~**Non** pour l'instant : un geste de plus par ligne pour un gain qu'on ne mesure pas encore.~~ **Dépassée par K2b** : chaque contenant porte ses lignes. | K2b (`5bda31d2f`, 2026-10-04) : table `packing.container_line`, route `POST admin/packing/:date/orders/:orderId/containers/:containerId/lines/:sku` (`apps/lfd-api/src/packing/http/packing-containers.controller.ts:71`) |
| 4   | Une ligne qui ne viendra jamais ?               | **Le coliseur appelle le superviseur, hors application.** Retirer une ligne change ce qui est facturé : c'est un avenant, pas un geste du fournil.         | rien                                                                                                                                                                                                                      |
| 5   | Le coliseur voit-il la retenue qualité ?        | **Oui** : un badge « Retenue au contrôle » sur la commande, au poste.                                                                                      | lot PC2 — bâti 2026-10-02                                                                                                                                                                                                 |
| 6   | Où poser les bacs dans la pièce ?               | **Une zone par tournée**, et l'étiquette du bac porte la **tournée et le rang d'arrêt** en gros.                                                           | lot PC3 — bâti 2026-10-02                                                                                                                                                                                                 |
| 7   | Le coliseur voit-il l'avancement par tournée ?  | **Oui** : en tête de chaque tournée au poste, « n commandes prêtes sur m ».                                                                                | lot PC2 — bâti 2026-10-02                                                                                                                                                                                                 |
| 8   | Prévenu d'un bac « à refaire » ?                | **Oui, au poste** : badge « À refaire » sur la commande, avec la sortie (annuler et recoliser). Pas de notification.                                       | lot PC2 — bâti 2026-10-02                                                                                                                                                                                                 |

## 3. Le parcours du livreur ([`parcours-du-livreur.md`](../livreur/parcours-du-livreur.md))

| Étape | Question                   | Décision par défaut                                                                                              | Bâti |
| ----- | -------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---- |
| 10    | Changer l'ordre en route ? | **Non** : le livreur suit l'ordre figé au départ ; un détour, il appelle le dépôt. L'ordre figé reste la mesure. | rien |

## 4. Après « Rapporter »

| Question                                                        | Décision par défaut                                                                                                                                                                                   | Bâti                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Comment une commande rapportée repart-elle ?                    | Elle **réapparaît parmi les commandes à placer** quand on compose les tournées, avec un badge « Rapportée le … » ; on la place dans une tournée comme une autre. Même prix, aucun frais.              | lot RL1 — bâti le 2026-10-02 (`69e4c04f6`) : « à répartir » de **n'importe quel jour**, en tête ; sa date demandée ne change pas (e2e `apps/lfd-api/test/delivery-brought-back-replace.e2e-spec.ts:117`)                                                                                                                                                                                                                                                                                                                                                                                  |
| Placée un autre jour, d'où viennent son adresse et sa fenêtre ? | La **feuille de route** du jour composé la sert, comme une commande du jour : adresse, fenêtre, contact, procédure (masquée sans `delivery_procedures`, DG-D8).                                       | suite de RL1 — bâti le 2026-10-02 (`bf2f719e8`) : l'écran des tournées **nomme** à la feuille (`commandes=`) les commandes d'un autre jour qu'il a placées ou à placer. La remise ne lit pas la composition (frontière `handover` ↛ `delivery`) ; le droit `delivery_run_sheet` ouvrait déjà toutes les livraisons de tous les jours. La page « Feuille de route » les montre aussi depuis `cb60810b0` (même jour) : sous `delivery_rounds:read`, elle lit la composition et nomme les mêmes commandes ; sans ce droit, elle sert la feuille du jour seule (`livraison-page.ts:186-188`). |
| « Proposer » voit-il les rapportées ?                           | **Oui** : la proposition du jour les **inclut**, en tête, comme des commandes du jour ; une tournée qui en tient une d'un autre jour n'est **plus** gardée « arrêt signalé » pour cette seule raison. | suite de RL1 — bâti le 2026-10-02 (`bf2f719e8`). Sans risque pour le calcul : une fenêtre est une heure du jour, pas une date, et « Appliquer » acceptait déjà une rapportée. Réversible : retirer `awaiting` de `readProposalDay` (`apps/lfd-api/src/delivery/application/delivery-proposal-day.ts`).                                                                                                                                                                                                                                                                                    |

## 5. Les lots

| Lot     | Contenu                                                                                                                                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PC1** | Poste de colisage : rangée « + format » (format proposé en couleur), « − » sur le dernier bac, avertissements D3 du plan retiré — **bâti 2026-10-02** (`507564e72`), **retiré par K3c** (`753f3e4f8`, 2026-10-05) : voir le § 1 |
| **PC2** | Poste de colisage : rangé par tournée (dernier arrêt d'abord), « n prêtes sur m », badges retenue et à refaire — **bâti 2026-10-02** (`507564e72`), toujours en place après K3c                                                 |
| **PC3** | Étiquette du bac : tournée et rang d'arrêt en gros — **bâti 2026-10-02** (`507564e72`), toujours en place                                                                                                                       |
| **RL1** | Composer les tournées : une commande rapportée réapparaît, badge « Rapportée le … » — **bâti 2026-10-02** (`69e4c04f6`, suites `bf2f719e8` et `cb60810b0`)                                                                      |

## 6. Les piles au sol — lot G5 ([`plan-geometrie-du-plancher.md`](../chargement/plan-geometrie-du-plancher.md), G-D4)

| #   | Question                                                           | Décision par défaut                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Bâti                     |
| --- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| G5a | Le jeu entre bacs du chargement, sans réglage (G-Q2 non bâtie) ?   | **1 cm, la constante `BIN_GAP_DEFAULT_CM`** (`delivery/domain/value-objects/bin-gap.ts:10`), que lit `planLoading` (`delivery/domain/services/loading-plan.ts:169`) : le plan de chargement, et la garde de capacité de « Proposer » (CA4). L'assistant d'achat ne la lit pas : il prend le jeu de sa requête (`gapCm`, 0 à 10 cm). Le réglage dans `delivery_routing_settings` reste à faire, et aucun lot ne le porte ; il remplacera la constante sans changer le contrat. | lot G5 — bâti 2026-10-02 |
| G5b | Une pile se pose-t-elle par-dessus un passage de roue (G-D2 bis) ? | **Non** : une pile du chargement monte depuis le sol ; une rangée qui touche un passage se centre entre eux. Empiler par-dessus reste propre à l'assistant d'achat.                                                                                                                                                                                                                                                                                                           | lot G5 — bâti 2026-10-02 |
| G5c | Une pile ne tient pas : les suivantes cherchent-elles un trou ?    | **Non, elles sortent aussi** : chargées après elle, elles seraient devant elle. L'alerte `floor_over` les compte toutes.                                                                                                                                                                                                                                                                                                                                                      | lot G5 — bâti 2026-10-02 |
| G5d | Les isothermes, avec et sans caisse réfrigérée ?                   | **Avec caisse : hors plancher** (placement `refrigerated`, le froid reste en litres, G-Q3). **Sans caisse : au sol**, comme le volume les compte au sec.                                                                                                                                                                                                                                                                                                                      | lot G5 — bâti 2026-10-02 |
| G5e | La hauteur d'une pile contre le plafond ?                          | ~~**Non vérifiée** en G5 : la pile garde `maxStack` (règle v1 inchangée). Une pile trop haute pour le plafond n'alerte pas encore.~~ **Vérifiée depuis le 2026-10-06** : étages = min(`maxStack`, ⌊hauteur utile ÷ hauteur du bac⌋), la règle `stackLevels` de l'assistant ; un bac plus haut que la caisse sort du plancher, et l'alerte `floor_over` le dit.                                                                                                                | `553422d02` (2026-10-06) |
| G5f | Une pile qui ne tient pas dans le sens préféré de la rangée ?      | **L'autre sens est essayé**, d'abord dans la rangée ouverte, puis dans une rangée neuve ; l'ordre de chargement n'est jamais changé.                                                                                                                                                                                                                                                                                                                                          | lot G5 — bâti 2026-10-02 |
