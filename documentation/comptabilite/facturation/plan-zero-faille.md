# Plan — aucune faille sur la facturation

> ⚠️ **2026-10-24** : `delivered_on` est renommée `received_on` (colonne
> `orders` et `invoice_order`, déclencheur `orders_received_on_frozen`,
> `deliveredOnOf` → `receivedOnOf`), et la date est posée avec la remise par
> `MarkOrderFulfilledHandler` — plan
> [`date-de-reception.md`](../../commandes/date-de-reception.md). Les mentions ci-dessous gardent
> l'ancien nom : elles décrivent ce qui a été bâti à leur date.

> **Doc-first, 2026-10-22.** Hugo : « je ne veux aucune faille sur la
> facturation ». Ce plan recense **tout ce qui reste ouvert** sur la facture
> émise et l'avoir — conformité, intégrité, métier — à partir de
> [`facture-emise.md`](facture-emise.md) (« Ce qui reste ouvert », relu le
> 2026-10-22) et du lot « conformité française » du même jour (commit
> `0c45c08c6`). Touche à l'argent : **`vitruve` avant Hugo**.
>
> État de la production au 2026-10-22 (lu par Hugo) : **aucune facture émise,
> aucun compteur** (`invoice`, `invoice_number_counter` vides). Rien de ce qui
> suit ne corrige une pièce existante : tout s'applique avant la première.

## 0. Ce qui tient déjà (ouvert le 2026-10-22)

- **Numérotation** `FA-<année>-<6 chiffres>`, compteur par (entité, année) dans
  la transaction de l'émission, sans trou, chronologique, refusé en base s'il
  saute, recule ou disparaît ; numéro unique dans toute la base.
- **Immuabilité en base** (`invoice_immutable`, `invoice_order_immutable`) ;
  un bon n'est facturé qu'une fois.
- **Arithmétique rejouée à chaque émission** (BR-CO-10 à 16, BR-S-08, BR-S-09) ;
  HT de ligne repris des bons, TVA une fois par taux.
- **Validation** : Schematron EN 16931, veraPDF (PDF/A-3b), XSD Factur-X
  1.09.2, Schematron Factur-X, BR-FR Flux 2 v1.4.0.04 — sur six pièces témoins.

## 1. Les failles, classées

| #   | Faille                                                                                                                                      | Gravité       | Pourquoi                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------- |
| F1  | **BT-26** : la date de la facture corrigée n'est pas figée sur l'avoir                                                                      | conformité    | BR-FR-CO-05 rouge : un avoir serait refusé par la plateforme agréée             |
| F2  | **BT-9** d'une facture carte = `max(paiement, émission)` au lieu de la date du paiement                                                     | conformité    | XP Z12-012 : en cadre B2 (déjà payée), BT-9 = date du paiement                  |
| F3  | **BT-34** : adresse électronique du vendeur absente                                                                                         | conformité    | BR-FR-13 rouge ; elle vient de la plateforme agréée                             |
| F4  | **BT-49** : adresse électronique de l'acheteur absente                                                                                      | conformité    | BR-FR-12 rouge ; elle vient de l'annuaire de la réforme (SIREN, schéma 0225)    |
| F5  | **Valeurs XMP** (`fx:Version`, `fx:ConformanceLevel`) non vérifiées                                                                         | conformité    | la spécification Factur-X 1.09.2 n'est distribuée que contre une adresse e-mail |
| F6  | **BT-13** : une seule référence de bon quand la facture en regroupe plusieurs                                                               | conformité    | « Ce qui reste ouvert » de `facture-emise.md`                                   |
| F7  | **Adresse de livraison** non figée (`deliveryAddressLines: null`), adresses relues en lignes plutôt que structurées                         | conformité    | la pièce doit porter ce qui était vrai à l'émission                             |
| F8  | **Verrou d'objet du seau** non posé                                                                                                         | intégrité     | une pièce archivée pourrait être écrasée ou supprimée côté stockage             |
| F9  | **Rendu interrompu** entre le dépôt et l'attache : re-rendu avec un XML qui a pu changer → autre empreinte → `InvoiceDocumentConflictError` | intégrité     | une pièce resterait sans document                                               |
| F10 | **Aucun geste de re-rendu** pour une pièce dont le rendu a échoué                                                                           | intégrité     | aujourd'hui, seul le renvoi de l'e-mail le fait au passage                      |
| F11 | **Refacturer après avoir** : l'index unique ne relâche pas les bons d'un avoir                                                              | métier        | une erreur corrigée par avoir ne peut pas être refacturée                       |
| F12 | **Mandat changé entre 23h55 et le lot** : la facture est écartée                                                                            | métier        | une facture due n'est pas émise                                                 |
| F13 | **Rattrapage après minuit** : la facture porte le 1ᵉʳ                                                                                       | métier/fiscal | date d'émission vs période facturée — question au cabinet                       |
| F14 | **Seconde entité émettrice** : le numéro ne nomme pas l'entité                                                                              | fiscal        | deux entités, deux séquences au même format : collision de lecture              |
| F15 | **Bons en HT pour les pros au compte** (F5 de `facture-emise.md`)                                                                           | métier        | reste à faire                                                                   |

## 2. Ce qu'on fait, faille par faille

- **F1** — figer `corrected_invoice_issued_on` sur l'avoir à son émission
  (copie de la facture corrigée), colonne additive, NOT NULL pour les 381
  par CHECK ; écrire BT-26. Aucune pièce existante.
- **F2** — `cardInvoiceDueOn` : en cadre B2, BT-9 = date du paiement ; sinon
  inchangé. Test BR-FR et cas du paiement antérieur à l'émission.
- **F3** — l'adresse électronique de l'entité émettrice devient un **fait de
  l'entité** (saisie aux Réglages, figée sur la pièce). Tant qu'elle manque :
  l'émission n'est **pas** bloquée avant le 1ᵉʳ septembre 2027 (obligation
  d'émission électronique des PME), elle le devient à cette date (garde
  datée).
- **F4** — un port `ElectronicAddressDirectory.of(siren)` ; l'adaptateur réel
  attend la plateforme agréée (l'annuaire passe par elle). D'ici là :
  saisie manuelle sur la fiche du client, figée sur la pièce. Même garde datée
  que F3.
- **F5** — Hugo télécharge la spécification Factur-X 1.09.2 (FNFE-MPE, contre
  son adresse) ; on vérifie les deux valeurs et on les fige par un test.
- **F6** — BT-13 : la règle EN 16931 n'admet qu'une référence de commande en
  en-tête ; les bons multiples se portent **par ligne** (BT-132). À vérifier
  contre le Schematron avant d'écrire.
- **F7** — figer l'adresse de livraison sur la pièce ; adresses structurées
  (BT-35 à BT-40, BT-50 à BT-55) depuis les champs, pas depuis des lignes.
- **F8** — runbook : verrou d'objet (rétention) sur le préfixe `invoices/` ;
  geste d'exploitation, pas de code.
- **F9** — le rendu ne régénère jamais une pièce **déposée** : s'il trouve un
  objet à la clé, il en relit l'empreinte et l'attache (le premier dépôt fait
  foi) ; il ne ré-écrit rien. Test du rendu interrompu.
- **F10** — un geste « Rendre de nouveau » au back-office, pour une pièce sans
  document seulement ; journalisé.
- **F11** — l'index unique de `invoice_order` exclut les bons dont la facture
  est **entièrement** annulée par avoir ; refacturation possible, journalisée.
  Migration : index partiel remplacé (vérifier qu'aucune ligne ne le viole).
- **F12** — l'issue « écartée » nomme le geste de sortie ; un rattrapage
  manuel émet avec le mandat en vigueur. À préciser.
- **F13, F14, F15** — questions pour le cabinet / pour Hugo (§4) avant de bâtir.

## 3. Les lots

| Lot    | Contenu                              | Migration          |
| ------ | ------------------------------------ | ------------------ |
| **Z1** | F1, F2, F9                           | colonne additive   |
| **Z2** | F3, F4 (saisie + garde datée), F7    | colonnes additives |
| **Z3** | F6, F5 (après la spécification)      | aucune             |
| **Z4** | F10, F11, F12                        | index remplacé     |
| **Z5** | F8 (runbook), F13–F15 selon réponses | —                  |

## 4. Questions

- **Q1** (cabinet) — F13 : une facture du mois émise après minuit porte-t-elle
  le 1ᵉʳ ou le dernier jour du mois facturé ?
- **Q2** (Hugo) — F14 : une seconde entité émettrice est-elle prévue avant
  2027 ? (sinon, F14 attend).
- **Q3** (Hugo) — F3/F4 : bloquer l'émission sans adresses électroniques dès
  maintenant, ou au 1ᵉʳ septembre 2027 (proposé) ?
- **Q4** (Hugo) — le choix de la plateforme agréée (déjà nécessaire pour
  recevoir les factures fournisseurs depuis le 1ᵉʳ septembre 2026) : il
  débloque F3 et F4.

## 5. Contredit par `vitruve` (2026-10-22) — l'emporte sur les §1–§3 là où ils divergent

**Failles que la liste ne portait pas** (les deux premières vérifiées dans le
code le 2026-10-22) :

| #   | Faille                                                                                                                                                                                                           | Gravité    | Vu                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------- |
| M1  | **Un remboursement sur une facture au compte ne produit aucun avoir** : signal `account_invoice` seulement ; la facture reste due, le prélèvement suit — client remboursé ET prélevé, TVA collectée non corrigée | **argent** | `application/services/refund-reconciler.ts` (`invoice.isPrepaid ? … : null`)             |
| M2  | **Une commande annulée après sa facture du mois** n'a aucun chemin vers un avoir                                                                                                                                 | argent     | `infrastructure/billable-order-criterion.ts` ne joue qu'avant l'émission                 |
| M3  | **Le prélèvement prend le TTC plein** des factures commerciales, sans déduire les avoirs                                                                                                                         | argent     | `infrastructure/prisma-collection-candidates.reader.ts` (`totalTtcCents`, type 380 seul) |
| M4  | **Un remboursement partiel avant la facture du mois** : la facture porte-t-elle le total plein ?                                                                                                                 | argent     | non établi                                                                               |
| M5  | **Date de livraison inconnue** (`invoice_order.delivered_on` NULL) alors que la mention est obligatoire                                                                                                          | conformité | —                                                                                        |
| M6  | **Le rendu n'est pas déterministe** : le logo est lu en direct à chaque rendu                                                                                                                                    | intégrité  | `application/services/invoice-document-renderer.ts` (`readEntityLogo`)                   |

**Remèdes contredits** :

- **F2 (BLOQUANT)** — la base impose `due_on >= issued_on` et `paid_on <= issued_on` :
  BT-9 = date du paiement ne s'écrit pas dans `due_on`. Proposé : **BT-9 rendu dans
  le XML depuis `paid_on`** en cadre B2, `due_on` inchangé.
- **F11 (BLOQUANT)** — inexprimable par un index partiel (le fait vit sur d'autres
  lignes, immuables) et sans producteur tant que M1/M2 n'existent pas : **reporté
  après M1/M2**, à concevoir avec la course de deux refacturations.
- **F9 (BLOQUANT)** — attacher un objet trouvé à la clé certifierait pour dix ans
  un objet peut-être faux. Proposé : **rendu déterministe** (logo figé avec la
  pièce, horodatages tirés de la pièce), puis à la reprise **ré-extraire le XML
  embarqué et le comparer** au XML recalculé ; attacher seulement s'il est égal,
  sinon incident.
- **F14 (SÉRIEUX)** — le numéro est unique dans toute la base et le compteur par
  entité : la première pièce d'une seconde entité **échoue** (`FA-2026-000001`
  existe). Le préfixe est irréversible dès la première pièce : **à trancher avant
  la première émission**.
- **§0 corrigé** — « refusé en base s'il saute » ne vaut que pour le compteur :
  rien ne lie `invoice.rank` au compteur en base ; l'absence de trou tient au
  code. À fermer par un déclencheur (rang = compteur).
- **F1** — redondant : BT-26 se déduit de `corrects_invoice_id` (FK vers une pièce
  immuable) ; pas de colonne.
- **F3/F4** — garde datée par `Clock`, test sans date absolue ; d'ici là, les
  pièces restent rouges sur BR-FR-12/13 et la doc doit le dire.
- **F8** — rétention, mode et durée à écrire, et à poser AVANT F9.
- **F13** — la bascule d'année (rattrapage de décembre en janvier) est à couvrir.

## 6. Décisions (Hugo, 2026-10-22)

- **Numérotation (F14)** : **un préfixe par entité**, défini dans l'entité
  légale, **non modifiable** une fois posé. Format proposé :
  `FA-<préfixe>-<année>-<6 chiffres>` ; la première pièce d'une entité sans
  préfixe est refusée (le message dit où le poser).
- **Date de livraison inconnue (M5)** : l'émission est **bloquée**, et le
  blocage nomme le bon et le geste de sortie.
- **Ordre** : on commence par **M1** (avec M2, M3, M4 : même chantier).
- **Remboursement au compte** (Hugo) : « seulement si la facture a été
  éditée ». Donc :
  - **avant l'émission de la facture du mois**, il n'y a rien à corriger : la
    facture doit porter le **net** — ce qui n'est pas le cas aujourd'hui, le
    dossier de facturation ne lit pas les remboursements
    (`infrastructure/prisma-invoice-dossier.reader.ts`, vérifié le
    2026-10-22 : aucune lecture d'`order_refund`) — c'est M4, confirmé ;
  - **après l'émission**, un remboursement ou une annulation produit un
    **avoir** sur cette facture, et le prélèvement ne prend que le net.

## 7. Le chantier M — conception (2026-10-22, à contredire)

**Règle unique** : une facture émise ne bouge jamais ; tout ce qui la diminue
après son émission est un avoir qui la cite (381, `corrects_invoice_id`) ; tout
ce qui arrive avant son émission se voit dans ses lignes.

- **M4 — avant l'émission** : le dossier lit, par bon, le cumul remboursé
  `succeeded` (`order_refund`) et l'état d'annulation. Une commande annulée
  n'est pas facturée (déjà le cas). Un remboursement partiel d'un bon au compte
  diminue ce bon sur la facture : une ligne négative « Remboursement — bon
  <n°> » au taux des lignes remboursées, ventilée au prorata des taux du bon
  quand il en porte plusieurs (même règle que `refundCreditNote`, à relire).
- **M1 — remboursement après l'émission** : `RefundReconciler` émet un avoir
  pour une facture au compte comme pour une facture carte, au lieu du seul
  signal `account_invoice` ; mêmes plafonds (un avoir ne dépasse jamais le
  restant non avoiré de la facture).
- **M2 — annulation après l'émission** : l'annulation d'une commande déjà
  facturée émet un avoir de son montant figé sur la facture qui la porte ; si
  elle est déjà partiellement avoirée, le restant seulement.
- **M3 — le prélèvement** : l'assiette d'une facture = son TTC **moins** la somme
  de ses avoirs ; une facture entièrement avoirée sort du prélèvement ; un lot
  déjà **déposé** ne se corrige pas : l'avoir émis après le dépôt produit un
  **remboursement à faire** (signalé, montant, client), jamais un prélèvement
  négatif.
- **Concurrence** : avoir et constitution du lot de prélèvement prennent le même
  verrou (celui du lot, `prisma-collection-lock.ts`) ; un avoir ne s'émet pas
  sur une facture prise dans un lot en cours de constitution.
- **Journal** : chaque avoir automatique porte sa cause (remboursement,
  annulation) et le geste d'origine.

## 8. Contredit une seconde fois (`vitruve`, 2026-10-22) — l'emporte sur le §7

- **M1 et M4 visent un cas impossible** : un remboursement (`order_refund`) ne
  naît que d'un paiement Stripe, et une commande au compte n'en a pas
  (`orders/domain/entities/order.ts`, `deferPayment` ; assiette
  `payment_status = 'not_required'`). Le **vrai besoin** est un **geste du
  staff** : réduire après coup un bon au compte (produit manquant, erreur de
  prix). Il n'existe pas dans le code. **M1 et M4 sont remplacés par M1′** (§9).
- **Ventilation par bon**, jamais au prorata de toute la facture : un avoir sur
  un bon reprend les lignes figées de CE bon (taux et plafond du bon).
- **Pas de ligne négative** (refusée par le domaine et par BR-27) : un avoir est
  une pièce 381 aux montants positifs.
- **Pas de verrou de lot** dans l'annulation : interblocage avec la
  constitution (ordre inverse). Le verrou des lignes `orders` sérialise déjà
  l'annulation, l'émission du mois et la constitution.
- **M3 recadré** : le prélèvement se constitue par **commande**
  (`order.totalCents`), pas par facture. Une commande annulée sort déjà du
  lot ; un avoir de réduction (M1′) doit faire baisser le montant prélevé du
  bon : l'unité du lot reste le bon, et le net du bon = total − avoirs qui le
  citent.
- **M2 a un cas réel** : l'assiette suit `created_at`, une commande passée le 30
  pour le 5 est facturée le 1ᵉʳ puis reste annulable. Règle de clôture par bon
  à nommer (le dernier avoir d'un bon prend le reste exact du bon, par taux).
- **Préfixe (F14)** : la contrainte `invoice_number_shape` et le motif de
  `invoice-number.ts` imposent `FA-AAAA-NNNNNN` ; il faut une migration de la
  contrainte, une recopie du préfixe sur `invoice` (un CHECK ne lit pas une
  autre table), l'unicité du préfixe entre entités, et un mécanisme qui le rend
  non modifiable une fois une pièce émise. Production sans aucune facture
  (lu le 2026-10-22) : **pas de double format à lire**.
- **« Remboursement à faire » d'un lot déjà déposé** : sans acteur ni mécanisme,
  c'est un signal que personne n'est obligé de lire — à concevoir (§9, Q-M2).
- **La cause d'un avoir** : un champ à prévoir (et BT-22, note), pas seulement le
  journal.

## 9. Questions pour Hugo (après la seconde contradiction)

- **Q-M1** — Le geste « avoir sur un bon » au back-office : le staff choisit des
  lignes du bon et des quantités (proposé), ou un montant libre ?
- **Q-M2** — Un avoir après un prélèvement déjà déposé : **imputé sur le
  prochain prélèvement** du client (proposé ; s'il n'y en a pas dans les 30
  jours, virement à faire, suivi), ou toujours un virement ?
- **Q-M3** — Le préfixe : 2 à 6 lettres majuscules, unique entre entités, posé
  une fois, figé dès la première pièce (proposé) ?

## 10. Décisions (Hugo, 2026-10-22) et lots

- **Q-M1** : l'avoir sur un bon se fait par **lignes et quantités** du bon.
- **Q-M2** : un avoir après un prélèvement déposé est **imputé sur le prochain
  prélèvement** du client ; sans prélèvement dans les 30 jours, un virement à
  faire, suivi.
- **Q-M3** : préfixe de **2 à 6 lettres majuscules**, **unique entre entités**,
  **figé dès la première pièce** émise.

| Lot                                | Contenu                                                                                                                       | Pourquoi d'abord                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **ZA** ✅ 2026-10-22 (non commité) | Préfixe par entité (F14) + rang lié au compteur en base (§5) + blocage sans date de livraison (M5)                            | irréversible dès la première facture |
| **ZB**                             | Avoir sur un bon par lignes et quantités (M1′), avoir à l'annulation d'un bon facturé (M2), cause de l'avoir, clôture par bon | l'argent                             |
| **ZC**                             | Prélèvement net des avoirs par bon (M3), imputation sur le prochain prélèvement, virement à faire suivi                       | dépend de ZB                         |
| **ZD**                             | F2 (BT-9 rendu), F9 + M6 (rendu déterministe), F8 (verrou du seau)                                                            | intégrité                            |
| **ZE**                             | F3/F4 (adresses électroniques, garde datée), F6, F7, F5                                                                       | dépend de la plateforme agréée       |

## 11. Facturer chaque bon dans le mois de sa livraison (Hugo, 2026-10-22, à contredire)

> 2026-10-24 : la suite de ZL — `received_on`, posé avec la remise et exigé par la base — est dans [`../../commandes/date-de-reception.md`](../../commandes/date-de-reception.md).

ZA a bâti M5 tel qu'écrit : une facture dont un bon n'a pas de date de
livraison n'est pas émise. Avec l'assiette actuelle par **date de commande**
(`billable-order-criterion.ts`, `created_at`), un bon commandé le 30 pour le 5
tombe dans la facture d'octobre et la **bloque jusqu'au 5**.

**La règle fiscale** : pour une livraison de biens, la TVA est exigible à la
livraison (CGI art. 269, 1 a) ; une facture récapitulative couvre les
livraisons d'un même mois civil et s'établit au plus tard à la fin de ce mois
(CGI art. 289, I-3). Décision de Hugo : **un bon se facture dans le mois de sa
livraison**.

Ce qui change :

- **L'assiette** d'une facture du mois = les bons **livrés** (retirés au
  comptoir ou livrés) entre le début et la fin du cycle — la date de livraison
  (`delivered_on`, déjà figée sur `invoice_order`) remplace `created_at`.
- **Un bon non encore livré** à la fin du cycle n'est pas dans la facture : il
  partira dans celle du cycle où il sera livré. M5 ne bloque plus personne.
- **Le relevé, le dossier et le prélèvement** lisent la même assiette (ils
  partagent `billableOrderWhere`) : le prélèvement suit la facture.
- **Rythmes** : mensuel, bimensuel, hebdomadaire — même règle, par cycle.
- **Un bon jamais livré** (annulé) n'est jamais facturé ; un bon livré puis
  annulé relève de M2 (avoir).
- **Bascule** : production sans aucune facture (2026-10-22) — pas de reprise.

## 12. Contredit (`vitruve`, 2026-10-22) — l'emporte sur le §11

**Vrai** : la date de livraison n'existe pas sur `orders` (elle est calculée à
l'émission, depuis les faits des blocs `handover` et `delivery`, qu'une requête
du commerce ne peut pas joindre) ; un bon livré mais **constaté après** la
tentative de 23h55 tomberait entre deux fenêtres ; les cycles hebdomadaire et
bimensuel chevauchent deux mois civils, contre l'article 289-I-3 ; un bon jamais
constaté disparaîtrait en silence ; six lecteurs partagent l'assiette, pas
trois. Citation fiscale à préciser : fait générateur (269-1-a) **et
exigibilité** (269-2-a) à la livraison.

**Inexact** : le double comptage est déjà interdit **en base** —
`invoice_order_invoiced_once`, index unique sur `order_id` pour les 380
(`20261008190000_la_facture_emise`, l. 110), vérifié le 2026-10-22.

**La règle, réécrite** :

- **Assiette d'une facture** = les bons **livrés, non annulés, jamais
  facturés** dont la date de livraison est **au plus tard** la fin du cycle.
  « Jamais facturé » est tenu par l'index unique : un bon ne peut ni manquer
  (un bon constaté en retard part dans la facture suivante) ni compter deux
  fois.
- **La date de livraison devient une donnée du commerce** : une colonne
  `orders.delivered_on` (jour Europe/Paris), posée **une seule fois**, à la
  première remise attestée, par un `@DurableHandler` qui écoute les faits de
  retrait et de tournée (option (a) de `vitruve`). Elle ne bouge plus ensuite
  (un bac ramené puis relivré ne la déplace pas).
- **Les cycles s'arrêtent à la fin du mois civil** : un cycle hebdomadaire qui
  chevauche deux mois produit deux factures (Q-L1).
- **Un bon livré et constaté après l'émission de son mois** part dans la
  facture suivante, marqué « livré le … » (Q-L2).
- **Un bon jamais constaté** (`neverHandedOver`) entre dans une liste nommée au
  back-office, « Bons à constater », au lieu de disparaître.
- **Les six lecteurs** de `billableOrderWhere` passent au même critère, dans le
  même lot ; la facture carte garde son fait générateur (le paiement), à
  confirmer au cabinet.
- **Irréversible** dès la première facture émise sous cette règle : à bâtir
  avant la première facture de production.

**Questions** :

- **Q-L1** — Un cycle hebdomadaire ou bimensuel qui chevauche deux mois :
  **deux factures** (une par mois civil, proposé), ou décaler la clôture à la
  fin du mois ?
- **Q-L2** — Un bon livré le 31 mais constaté le 1ᵉʳ, après l'émission
  d'octobre : **dans la facture de novembre** (proposé, simple, jamais perdu),
  ou une facture de rattrapage d'octobre émise aussitôt ?

**Décisions (Hugo, 2026-10-22)** : Q-L1 — un cycle qui chevauche deux mois
produit **deux factures**, une par mois civil ; Q-L2 — un bon livré le 31 et
constaté après l'émission d'octobre part **dans la facture de novembre**.
Lot **ZL** (facturer à la livraison), à bâtir avant ZB.

**ZL ✅ bâti le 2026-10-22 (non commité).** Ce qui existe :

- `orders.delivered_on` (DATE, jour de Paris ; migration
  `20261022180000_la_date_de_livraison_du_bon`, additive), posée une fois par
  `RecordDeliveryDayOnHandover` (abonné durable de `handover.handed_over`) →
  `RecordOrderDeliveryDayHandler`, qui applique `deliveredOnOf` aux faits lus
  par les canaux du retrait et de la livraison ; le déclencheur
  `orders_delivered_on_frozen` refuse de la déplacer.
- `billableOrderWhere` compare `delivered_on` jour à jour (Paris) ; les six
  lecteurs le partagent. « Jamais facturé » reste hors du critère commun (il
  viderait le lot, constitué après la facture) : la facture le juge en mémoire
  sur `invoice_order` 380, le lot sur l'état d'encaissement.
- Q-L1 : `isClosingDay` (`billing-cycle.ts`) — le 1er clôt tout rythme
  (`plan-rythme-de-facturation.md`, §17).
- Q-L2 : un bon constaté après l'émission part dans la facture suivante, sa
  ligne portant `delivered_on`.
- M5 : la facture lit `delivered_on` du bon ; le bloqueur reste un filet
  (test `issue-monthly-invoices.handler.spec.ts`).
- « Bons à constater » : `GET admin/accounting/unconfirmed-deliveries`, carte
  de l'écran « Prélèvement du mois ».
- La facture carte garde son fait générateur (le paiement).

Doc d'état : [`facture-emise.md`](facture-emise.md), § « La date de
livraison ».

**Après ZL (Hugo, 2026-10-22)** : 1 — **le relevé suit la facture** : un bon
livré le 31 et constaté après l'émission d'octobre apparaît au relevé (et au
dossier) de **novembre**, là où il est facturé ; 2 — le lot de prélèvement de
plus au 1ᵉʳ du mois (conséquence de « une facture par mois civil ») est
**accepté**.

**« Le relevé suit la facture » ✅ bâti le 2026-10-22 (non commité).** Le
relevé et le dossier lisent `cycleOrderIds` (bons de la facture du cycle, ou
qu'elle prendra — `pendingOrderIsInCycle`) ; le lot écarte un bon facturé
pour une clôture postérieure. Doc d'état : [`facture-emise.md`](facture-emise.md),
§ « La date de livraison ».
