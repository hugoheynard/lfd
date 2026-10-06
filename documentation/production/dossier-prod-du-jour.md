# Le dossier de production du jour

**État au 2026-10-06** (lots E1 et E1b de
[`plan-envoi-du-dossier.md`](plan-envoi-du-dossier.md)). Ce que contient le
papier qui part au fournil, et **d'où vient chaque information**.

## Ce que c'est

Le paquet que le fournil reçoit pour une journée : un récapitulatif de ce qu'il
faut fabriquer, puis un bon par commande. Il existe sous deux formes, qui
disent la même chose :

| Forme                     | Où                                                                          | Quand                                                                   |
| ------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Impression de l'écran** | Prévisionnel › Dossier du jour › Imprimer                                   | à tout moment, depuis les commandes **en direct**                       |
| **PDF serveur**           | `GET /admin/production/batch/:date/dossier.pdf`, et l'envoi par e-mail (E3) | seulement une fois le plan **arrêté**, depuis ce que l'arrêt a **figé** |

Le PDF serveur ne bouge plus une fois tiré : il est archivé
(`<jour>/dossier-du-jour-v2.pdf`). Après un retirage qui ajoute des commandes,
un second dossier « complété » est archivé à côté
(`<jour>/dossier-du-jour-v2-retirage-<instant>.pdf`) ; l'original reste.

## Page 1 — le récapitulatif

| Ce qu'on lit                                                                               | D'où ça vient                                                                                                                    |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| « Lot du <jour> », N commandes, P pièces                                                   | les commandes figées à l'arrêt (fournil, `production_order`)                                                                     |
| Les rayons, dans l'ordre du catalogue                                                      | le **catalogue d'aujourd'hui**, lu au commerce au premier tirage (`WorkshopShelvesReader`), puis figé dans l'archive             |
| Par rayon, chaque produit : quantité, nom, SKU, nombre de commandes ; le plus gros d'abord | les lignes figées des commandes (quantité, nom et SKU copiés à l'arrêt)                                                          |
| « Hors catalogue »                                                                         | un SKU qui n'a plus de rayon                                                                                                     |
| « Rayon inconnu »                                                                          | la lecture des rayons a échoué : le dossier est servi quand même, **mais pas archivé**, pour qu'un tirage suivant ait les rayons |

## Pages suivantes — un bon par commande

Triés par référence, numérotés « BON i/N ».

| Ce qu'on lit                                                                    | D'où ça vient                                                                                              |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Enseigne en titre, raison sociale dessous                                       | commerce, `company.enseigne` et la raison sociale (sinon la personne ou son e-mail) — **figées à l'arrêt** |
| Retrait ou livraison, référence                                                 | la commande figée                                                                                          |
| Le point de retrait nommé, puis l'adresse ligne par ligne                       | commerce : l'adresse de livraison ou du point de retrait, selon le mode — **figée**                        |
| La fenêtre : « 7 h 00 – 8 h 30 », « avant 10 h 00 », ou « Sans heure convenue » | commerce, la fenêtre convenue de la commande — **figée**                                                   |
| Livraison : le contact sur place, ou « Aucun contact sur place »                | commerce : le contact convenu, sinon le détenteur du compte — **figé**                                     |
| « Signature exigée à la remise »                                                | commerce, l'exigence de la commande — **figée**                                                            |
| « Panier récurrent »                                                            | commerce : une commande issue d'un abonnement, non passée par le personnel — **figé**                      |
| Les lignes à préparer, avec une case « Fait »                                   | les lignes figées de la commande                                                                           |
| La note du client                                                               | commerce, la note de la commande — **figée**                                                               |
| Le QR de colisage                                                               | calculé depuis la référence, si l'adresse du back-office est configurée                                    |

**Une commande figée avant le 2026-10-06** n'a pas ces champs : son bon garde
l'ancien rendu (un seul libellé, la destination sur une ligne, « Pour HH:mm »),
et ce qui manque est omis, jamais deviné.

**Le numéro de révision** n'est pas imprimé : le commerce ne connaît pas
encore d'avenant, il vaudrait toujours 0.

## Le pied de chaque page

« Arrêté le 7 octobre 2026 à 00:30 », puis « — complété le … » après un
retirage. L'heure est **celle de Paris** (jusqu'au 2026-10-06, les papiers du
fournil l'écrivaient en UTC : un arrêt fait après 22 h ou 23 h s'imprimait à la
veille).

## Ce qui n'y est jamais

Aucun prix ni total en euros : le fournil fabrique, il ne facture pas.

## Où vit le code

- Contenu : `apps/lfd-api/src/production/domain/services/day-dossier.ts`
  (récapitulatif, ordre) et `dossier-sheet-head.ts` (en-tête d'un bon).
- Mise en page : `day-dossier-pdf.ts`, sur la trousse `paper-pdf-kit.ts`.
- Archive et tirage : `application/services/production-paper.service.ts`
  (`dossierOf`).
- Ce que l'arrêt fige : le port `production/channels/commerce/day-orders.reader.ts`
  (`sheetDetails`), implémenté par
  `apps/lfd-api/src/b2b/orders/infrastructure/prisma-day-orders.reader.ts`,
  rangé par `production/infrastructure/production-order-sheet.columns.ts`.
- Écran : `apps/lfd-backoffice-frontend/src/app/production/previsionnel/dossier-du-jour/`.
