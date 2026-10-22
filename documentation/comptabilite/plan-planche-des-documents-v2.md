# Plan — la planche des documents, version 2

> **Notes du 2026-10-22, doc-first.** Hugo : « cette page est un élément
> névralgique pour contrôler ce qu'on produit comme documents ». État actuel de
> la page : [`planche-des-documents.md`](planche-des-documents.md) (cinq
> documents, données d'exemple fixes, rien d'écrit). Rien n'est bâti ici ; ce
> sont les points à concevoir avant un lot.

## Le principe (Hugo, 2026-10-22)

**« La planche doit être le reflet de la réalité, pour les couleurs et tout. »**
Un document de la planche est rendu par le **même code**, avec les **mêmes
réglages réels** qu'un vrai document : couleurs des sites lues aux Réglages,
logos et mentions de l'entité, catalogue publié, frais et remises en vigueur,
numérotation au vrai format. Seules les données qui désigneraient une vraie
personne ou consommeraient un vrai numéro sont des exemples, marqués. Tout
écart entre la planche et un vrai document est un défaut de la planche.

**Et sur les couleurs** (Hugo, 2026-10-22) : « tout ce qui peut faciliter
l'identification visuelle de la destination finale — retrait, B2B, B2C,
livraison — avec les couleurs doit être présent. » Chaque document papier qui
suit une commande (bon, fiche d'atelier, fiche de colisage, feuille de tournée,
manifeste, bon de réassort) porte la couleur de sa destination finale (le site
de retrait, ou la livraison), et distingue pro et particulier ; la planche le
montre parce que les vrais documents le portent. Ce qui ne le porte pas encore
— la fiche d'atelier au minimum — est un chantier des **vrais** documents, à
inventorier document par document avant le lot (Q2 du §3 en dépend). **Pas
les factures** (ni avoirs) : pièces comptables, sans couleur de destination
(Hugo, 2026-10-22).

## 0. Ce qui existe (ouvert le 2026-10-22)

- Cinq documents : bon pro, bon public, fiche d'atelier, feuille de tournée,
  facture Factur-X. Données d'exemple **fixes et inventées** (« EXEMPLE »,
  numéros en `999…`), un fichier par bloc (`…/document-specimens/specimen-data.ts`),
  chaque bloc sert les siens.
- **Les couleurs de site** (`b2b/sites/domain/site-color.ts`, `#rrggbb` libre) :
  le **vrai** bon de commande trace un trait de la couleur de la commande sous
  son titre (`order-sheet-pdf-header.ts`, L5 de `plan-tri-depart-et-couleurs.md`)
  ; la planche passe `color = null`, donc ne le montre jamais. La **fiche
  d'atelier** (`production/domain/services/atelier-sheet-pdf.ts`) ne porte
  **aucune** couleur, même pour une vraie commande.
- Pas de transfert interne, pas de manifeste, pas de numéros de commande réels.

## 0 bis. Inventaire des couleurs sur les papiers (ouvert le 2026-10-22)

Côté serveur seulement (`apps/lfd-api/src`) ; les impressions faites par les
fronts ne sont pas inventoriées. Factures et avoirs exclus.

| Document                                                                | Couleur de destination                            | Pro / particulier    | Plusieurs commandes      |
| ----------------------------------------------------------------------- | ------------------------------------------------- | -------------------- | ------------------------ |
| Bon pro (`order-sheet-pdf.ts`)                                          | trait sous le titre (`order-sheet-pdf-header.ts`) | par la mise en page  | non                      |
| Bon public (même générateur)                                            | même trait, couleur B2C                           | par la mise en page  | non                      |
| QR de retrait (dans le bon)                                             | aucune                                            | aucune               | non                      |
| Fiche d'atelier, compte à produire (`atelier-sheet-pdf.ts`)             | aucune                                            | aucune               | oui, agrégés par article |
| Dossier du jour (`day-dossier-pdf.ts` et ses annexes, réassort compris) | aucune                                            | aucune               | oui                      |
| Feuille de tournée (`round-paper-pdf-stop.ts`)                          | carré par arrêt                                   | par la couleur seule | oui, un carré par arrêt  |
| Bloc du transfert interne (`round-paper-pdf-transfer.ts`)               | aucune                                            | aucune               | oui                      |
| Manifeste de transfert                                                  | pas de PDF, une vue à l'écran                     | —                    | —                        |
| Fiche de colisage, étiquette de bac                                     | pas de PDF serveur trouvé                         | —                    | —                        |
| Planche (spécimen du bon)                                               | aucune (`categoryColor: null`)                    | —                    | —                        |

Constats :

- Pro et particulier ne se distinguent **jamais par un mot** : par la mise en
  page sur le bon, par la couleur seule sur la feuille de tournée. Une couleur
  non posée et une clientèle inconnue y donnent le même résultat, aucun carré.
- La couleur d'une livraison se lit **au rendu**, au départ courant
  (`prisma-order-sheet-color.source.ts`), pas au site figé de la commande. Un
  bon rendu après un changement de départ prend la nouvelle couleur. Voulu ou
  non : à trancher.
- Les documents qui agrègent plusieurs commandes (atelier, dossier du jour,
  transfert) n'en portent aucune : c'est là que la question Q2 se pose.

> **Bâti le 2026-10-22** : une pastille par commande sur la fiche d'atelier
> et le dossier du jour (devant la référence), un point par commande sur le
> transfert interne (couleur de retrait du site d'arrivée), un camembert global
> en haut du compte à produire (réassorts et commandes sans couleur en gris).
> Couleurs lues au tirage par `production/channels/commerce/` et
> `delivery/channels/commerce/`. ⚠️ Ces papiers sont archivés au premier
> tirage : leur couleur s'y fige, et ceux tirés avant ce jour n'en ont pas.
> Le tableau ci-dessus décrit l'état d'avant.

### Décisions du soir (Hugo, 2026-10-22)

- **Le réassort a sa propre teinte, définie sur le site** qui le reçoit, à côté
  de ses couleurs de retrait et de livraison. Elle remplace le gris des
  réassorts dans le camembert du compte à produire. À bâtir : un réglage de
  plus sur le site (migration additive), lu au tirage comme les autres.
- **Les papiers déjà tirés gardent les couleurs de leur premier tirage** :
  accepté. Un papier réimprimé reste celui qui est parti à l'atelier ; une
  réorganisation se voit en tirant à nouveau.

### Décisions sur les couleurs (Hugo, 2026-10-22)

- **Une pastille par commande** sur les documents qui en regroupent plusieurs
  (fiche d'atelier, compte à produire, dossier du jour, transfert interne) :
  chaque commande porte sa propre couleur. Répond à Q2.
- **Le mot n'est pas écrit** : pro ou particulier reste porté par la couleur
  et la mise en page, sans « Pro » ni « Particulier » en toutes lettres.
- **La couleur se lit au moment d'imprimer**, au départ actuel, comme
  aujourd'hui. Décidée « figée » puis revue le même jour par Hugo : quand on
  réorganise les départs, un papier doit montrer en un coup d'œil la
  répartition **actuelle**. Pas de colonne, pas de migration.

## 1. Ce que Hugo demande

1. **De vrais articles du catalogue** : choisir les articles (et leurs
   quantités) parmi le catalogue publié, au lieu de lignes inventées — prix,
   TVA, rayons, noms et contenances réels.
2. **Retrait ou livraison** : un choix qui change ce que les documents
   portent (adresse, créneau, frais de livraison, feuille de tournée ou non).
3. **Un premier interrupteur B2B / B2C** qui filtre aussi **la liste des
   documents** produits : en B2C, bon public (TTC, QR de retrait) et pas de
   facture du mois ; en B2B, bon pro (HT), facture Factur-X, mandat…
4. **Les couleurs des sites appliquées** aux bons **et à la fiche d'atelier** —
   sur la planche, et sur les vrais documents pour la fiche d'atelier (elle
   n'en porte aucune aujourd'hui).
5. **Un transfert interne avec son manifeste** (commandes et réassort du
   Village, bacs, quantités emballées — R3c).
6. **Des numéros de commande** réalistes et cohérents d'un document à l'autre
   (même commande sur le bon, la fiche, la tournée, le manifeste, la facture).

## 2. Ce que ça implique (à concevoir)

- **Un « scénario »** plutôt que des données par document : point de retrait ou
  zone de livraison, clientèle, articles et quantités, date → chaque bloc rend
  ses documents depuis CE scénario, envoyé à chaque route (les blocs ne se
  lisent pas entre eux : le scénario voyage dans la requête, `CLAUDE.md` §3).
- **Lire le catalogue publié** côté commerce (déjà fait par la boutique) pour
  proposer les articles ; les autres blocs reçoivent les lignes dans le
  scénario, sans lire le catalogue.
- **Toujours rien d'écrit** : ni commande, ni numéro consommé, ni facture
  rangée (règle actuelle, à garder). Les numéros affichés restent marqués
  « EXEMPLE » ou dans une plage qui ne peut pas exister.
- **Documents à ajouter** : manifeste du transfert, papier de tournée avec un
  transfert, bon de réassort (R3d-bis), dossier du jour, avoir, mandat SEPA,
  prélèvement d'essai (pain.008 lisible) — à trier avec Hugo.
- **La couleur sur la fiche d'atelier** est un changement des **vrais**
  documents (pas seulement de la planche) : décider où elle se pose (trait
  sous le titre comme le bon, bandeau, pastille par commande).

## 3. Questions pour Hugo

- **Q1** — La liste exacte des documents B2B et B2C (lesquels apparaissent dans
  chaque mode) ?
- **Q2** — ✅ tranchée le 2026-10-22 : une pastille par commande (§0 bis).
- **Q3** — Les documents à ajouter, par ordre de priorité (manifeste, bon de
  réassort, dossier du jour, avoir, mandat, essai de prélèvement) ?
- **Q4** — Scénario mémorisé (on retrouve sa planche) ou recomposé à chaque
  visite ?
