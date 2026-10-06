# Le dossier de production du jour

**État au 2026-10-06.** Ce que contient le papier qui part au fournil, **d'où
vient chaque information**, et comment il part par e-mail. Remplace le plan de
l'envoi du dossier (lots E1, E1b, E2, E3, bâtis le 2026-10-06, retiré ce
jour-là — il vit dans l'historique git).

## Ce que c'est

Le paquet que le fournil reçoit pour une journée : un récapitulatif de ce qu'il
faut fabriquer, puis un bon par commande. Il se lit à deux endroits :

| Où                                                                                                                                                | Ce que c'est                                    | Quand                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Aperçu à l'écran** — Prévisionnel › Dossier du jour (onglets Récapitulatif / Bons)                                                              | une lecture, depuis les commandes **en direct** | à tout moment                                                                                 |
| **Le PDF** — bouton « Imprimer le dossier » (ouvre le PDF dans un onglet), `GET /admin/production/batch/:date/dossier.pdf`, et l'envoi par e-mail | **le papier**, depuis ce que l'arrêt a **figé** | seulement une fois le plan **arrêté** ; avant, le bouton dit « Arrêtez d'abord le plan du … » |

Depuis le 2026-10-06, on n'imprime plus depuis le navigateur : l'impression était l'écran, menu compris.

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

## L'envoi par e-mail

**Production › Réglages › Dossier du jour par e-mail** tient la liste des
destinataires (`production_settings`) :

- **le personnel**, choisi dans l'annuaire : son nom et son e-mail sont relus
  à chaque envoi — un changement d'adresse suit, une fiche suspendue ou sans
  adresse est sautée ;
- **une autre personne** : e-mail, prénom, nom, poste (facultatif).

Une même adresse n'est inscrite qu'une fois (sans tenir compte de la casse,
personnel et externes confondus). Un retrait archive la ligne. Le journal
nomme la personne, jamais son adresse.

**Quand ça part** : à chaque arrêt du plan, manuel ou automatique, et de
nouveau après un retirage qui ajoute des commandes (« — complété » dans
l'objet). Une réannonce, une clôture déjà dépassée par un retirage ou un
retirage déjà dépassé n'envoient rien : le dernier tirage envoie le sien.

**Ce qui part** : un e-mail par destinataire, objet « Dossier du mercredi 7
octobre — N commandes, P pièces », le PDF joint (`dossier-du-jour-<jour>.pdf`).

**Une seule fois** : l'envoi est déclenché par un fait livré « au moins une
fois » ; une trace par (journée, instant de l'arrêt ou du retirage,
destinataire) est prise avant d'envoyer (`production.production_dossier_dispatch`),
et la même clé part chez Resend. ⚠️ Si la transaction est annulée après un
envoi, seule la clé Resend (environ 24 h) évite le doublon.

**En cas d'échec** : un destinataire refusé n'empêche pas les autres, et n'est
pas retenté ; une alerte (cloche + push, `production_count_stop`) nomme qui ne
l'a pas reçu. Journal : « Le dossier du … a été envoyé à N destinataires ».

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
- Envoi : `application/services/dossier-dispatch.service.ts`, abonnés
  `application/handlers/send-dossier-on-day-closed.handler.ts` et
  `send-dossier-on-day-retaken.handler.ts`, gabarit
  `apps/lfd-api/src/platform/mailer/production-dossier-mail.ts`.
- Destinataires : `domain/entities/dossier-recipients.ts`, routes
  `http/production-dossier-recipients.controller.ts`.
- Écrans : `apps/lfd-backoffice-frontend/src/app/production/previsionnel/dossier-du-jour/`,
  `…/production/dossier-recipients-card/`.
