# Plan — un prélèvement d'essai sur un compte client à nous

> ✅ **Bâti le 2026-10-22** (lot unique, non commité à l'écriture de cette
> ligne) selon §4 et §6 — voir §7 pour ce qui a été tranché en bâtissant et ce
> qui reste ouvert. L'état est décrit dans
> [`prelevement-sepa.md`](prelevement-sepa.md), §7 bis.

> **Doc-first, 2026-10-22.** Demande de Hugo : « pouvoir faire un test de
> prélèvement sur une entreprise à nous qui est un compte client actif ; un
> outil pour générer le XML de prélèvement, avec éventuellement des petites
> options de paramétrage, genre date de prélèvement, first time, occasionnel ».
> Touche à l'argent et à la banque : **`vitruve` avant Hugo**.
> Lié : [`prelevement-sepa.md`](prelevement-sepa.md),
> [`lot-de-prelevement-fige.md`](lot-de-prelevement-fige.md).

## 0. Ce qui existe (ouvert le 2026-10-22)

- **Le générateur `pain.008`** (`apps/lfd-api/src/b2b/accounting/domain/services/pain008-document.ts`,
  `pain008.ts`, `pain008-audit.ts`) : fonction pure ; `ReqdColltnDt` (date
  d'échéance) en paramètre ; schéma `CORE` | `B2B` (`value-objects/sepa-scheme.ts`).
- **Les séquences** : `RCUR` (mandat récurrent) et `OOFF` (mandat ponctuel),
  déduites du type du mandat (`sequenceTypeOf`). **`FRST` et `FNAL` n'existent
  pas** : « ils décrivent un rang dans une série, que rien ne mémorise encore »
  (commentaire du code). Depuis la révision du rulebook SEPA de novembre 2016,
  un premier prélèvement récurrent peut être émis en `RCUR` (à confirmer avec
  la banque — `question-banque*.md`).
- **Le lot réel** (`CollectionBatch`) : constitué depuis les commandes au
  compte, figé, déposé ; il change l'état d'encaissement des bons.

## 1. Ce qu'on bâtit

Un **« Prélèvement d'essai »** dans Comptabilité › Prélèvement, qui produit un
fichier `pain.008` téléchargeable pour UN débiteur, **sans toucher** aux
factures, aux bons, aux lots ni à l'état d'encaissement.

- **Débiteur** : une société cliente **active**, avec un **mandat signé**
  (sinon : refus nommé). Le choix est restreint aux sociétés marquées
  « à nous » ? (Q1)
- **Paramètres** :
  - **montant** (centimes, > 0, plafonné — Q2) ;
  - **date d'échéance** (`ReqdColltnDt`) : au moins le délai bancaire du schéma
    (CORE : J+1 ouvré interbancaire depuis 2016 ; B2B : J+1) — calculée et
    proposée, refusée si trop tôt ;
  - **séquence** : `RCUR` · `OOFF` · `FRST` · `FNAL` — par défaut celle du
    mandat ; un choix contraire au type du mandat (`OOFF` sur un mandat
    récurrent, ou l'inverse) est **refusé** ;
  - **libellé** (`RmtInf/Ustrd`) : « ESSAI PRELEVEMENT … » par défaut ;
  - **schéma** : celui du mandat (pas de choix — un mandat CORE ne se prélève
    pas en B2B).
- **Identifiants** : `MsgId` et `EndToEndId` préfixés `ESSAI-`, jamais en
  collision avec ceux d'un lot réel.
- **Trace** : chaque fichier généré est **journalisé** (qui, quand, débiteur,
  montant, échéance, séquence, `MsgId`) et gardé ; il apparaît dans une liste
  « Essais » de l'écran. Un essai **n'est pas un lot** : il ne se dépose pas par
  l'outil, il se télécharge.
- **Contrôle** : le fichier passe le même audit que les lots réels
  (`pain008-audit.ts`) et le XSD `pain.008.001.02` (Q3) avant d'être rendu.

## 2. Ce que l'essai ne fait pas

- Il ne crée ni facture, ni écriture comptable, ni état d'encaissement : si la
  banque prélève réellement, **l'argent arrive sans pièce** chez nous — à
  rembourser ou à documenter par la comptabilité (Q4).
- Il ne marque pas le mandat « déjà utilisé » : sans incidence tant que
  `FRST`/`FNAL` ne sont pas mémorisés ; s'il le deviennent un jour, l'essai
  devra compter (Q5).

## 3. Questions pour Hugo

- **Q1** — Restreindre l'outil aux sociétés **à nous** (un drapeau sur la
  société, posé à l'écran), ou à toute société active avec mandat ?
- **Q2** — Un plafond de montant pour un essai (proposé : 10 €) ?
- **Q3** — La version du format attendue par la banque : `pain.008.001.02`
  (celle du générateur) ?
- **Q4** — Si la banque prélève vraiment : on rembourse la société à nous, ou
  on le garde comme un encaissement à documenter ?
- **Q5** — `FRST`/`FNAL` : seulement dans l'essai (pour tester ce que la
  banque accepte), ou aussi dans les lots réels un jour ?

## 4. Contredit par `vitruve` (2026-10-22) — l'emporte sur les §1–§2

- **Générateur** : `SequenceType` reste `RCUR | OOFF` pour le lot réel (FRST/FNAL
  y restent inexprimables). Le rendu prend la séquence **en paramètre** du bloc
  `PmtInf` ; le lot réel la passe par `sequenceTypeOf`, l'essai par son propre
  type `TestSequence`. Un seul rendu, pas de duplication.
- **Identifiants** (≤ 35, irréversibles dès le premier dépôt) : `MsgId` =
  `ESS-<ULID>` (30), `PmtInfId` = `ESS-<ULID>-<séquence>` (35 au plus),
  `EndToEndId` = `ESS-<ULID>` (30, un seul débit). Le préfixe `ESS-` est le
  seul signe d'un essai.
- **Échéance** : calculée par le calendrier des lots réels
  (`collection-calendar.ts`), pas une règle neuve ; le délai de dépôt de la
  banque reste une question ouverte (`question-banque.md`, 3.4).
- **Pré-notification** : un débit SEPA réel exige d'avertir le débiteur. Pour
  une société à nous, une **décision écrite** (Q6).
- **Ce qui brûle un mandat** : un `OOFF` consomme un mandat ponctuel ; un
  `FNAL` peut faire clore la série par la banque. Proposé : l'essai **refuse
  FNAL**, et refuse `OOFF` sur un mandat qu'un lot réel utilise (Q7).
- **Retours** : un retour bancaire dont l'identifiant commence par `ESS-` est
  rattaché à son essai et affiché dans la liste « Essais », au lieu d'être
  perdu comme « non apparié ».
- **Droit** : une ressource neuve `collection_test`, accordée à l'écran (aucune
  migration n'accorde de droit) ; la plus dangereuse du bloc.
- **Trace** : une table `collection_test` (débiteur, montant, échéance,
  séquence, identifiants, auteur, instant, XML gardé — il porte l'IBAN :
  registre RGPD et durée de conservation à écrire).
- **Contrôles** : `pain008-audit.ts` étendu aux séquences de l'essai ; pas de
  XSD dans le dépôt aujourd'hui — l'ajouter (`pain.008.001.02`) comme pour
  Factur-X.
- Renvoyer la question FRST à `question-banque.md` 3.7 plutôt que la reposer.

## 5. Questions pour Hugo (remplacent le §3)

- **Q1** — Sur quelles sociétés : un drapeau « à nous » posé à l'écran (proposé,
  faux par défaut), ou toute société active avec mandat ?
- **Q2** — Plafond d'un essai : 10 € (proposé) ?
- **Q4** — Si la banque prélève vraiment : remboursement à la société, ou
  encaissement documenté ? À trancher avant le premier fichier.
- **Q6** — Pré-notification : une décision écrite suffit-elle pour nos propres
  sociétés (proposé), ou un avis envoyé à chaque essai ?
- **Q7** — Séquences proposées : `RCUR`, `FRST`, et `OOFF` seulement sur un
  mandat ponctuel dédié aux essais ; **pas de `FNAL`** (proposé) ?

## 6. Décisions (Hugo, 2026-10-22)

- **Q1** — on déclare **nos établissements** (les sociétés à nous) dans une
  **page spéciale de la Comptabilité**, pas dans la fiche « Informations » de la
  société ; l'outil d'essai ne propose que celles-là.
- **Q2** — plafond **1 €** par essai (Hugo, 2026-10-22 ; d'abord 10 €).
- **Q4** — « je ne sais pas » : par défaut, un essai prélevé est **« à
  rembourser »** dans la liste des essais, avec un geste « Marqué remboursé »
  (date, auteur) ; le traitement comptable est une question au cabinet.
- **Q6** — pré-notification : **une décision écrite** suffit pour nos propres
  établissements (affichée sur la page de déclaration).
- **Q7** — séquences `RCUR`, `FRST`, `OOFF` (seulement sur un mandat ponctuel non
  utilisé par un lot réel) ; **pas de `FNAL`**.

## 7. Bâti (2026-10-22)

- **Nos établissements** : table `own_establishment` (pas de ligne = pas à
  nous ; retirer garde la ligne), page Comptabilité › Nos établissements, faits
  `collection.own_establishment_declared` / `_withdrawn`. La décision de
  pré-notification (Q6) y est affichée, datée.
- **Droit** `collection_test` (migration seule dans sa transaction, aucun
  droit accordé ; graine : administrateur seul). Il garde les deux pages et
  toutes leurs routes ; le fichier se télécharge sous `collection_test:write`.
- **Générateur** : `DocumentDebit.sequence` donnée par l'appelant
  (`sequenceTypeOf` pour le lot, `TestSequence` pour l'essai) ; un seul rendu.
  Références `ESS-<ULID>` / `ESS-<ULID>-<séquence>` (≤ 35, testées). XSD ISO
  `pain.008.001.02` recopié sous `apps/lfd-api/test/fixtures/pain008/` et joué
  sur un lot réel et sur un essai.
- **Échéance** (révisée le 2026-10-22, Hugo) : **J + 2 jours ouvrés TARGET2**
  depuis le jour (Paris) de la génération — `TEST_COLLECTION_MIN_BUSINESS_DAYS`
  dans `collection-test-file.ts`, compté par `businessDaysAfter` du calendrier
  TARGET2. La pré-notification n'y entre plus : elle est levée par la décision
  écrite (Q6). Le 2 est une hypothèse, à ajuster quand la banque aura répondu
  à `question-banque.md` 3.4. Proposée par défaut à l'écran (et `min` du
  sélecteur) ; refus d'un jour plus tôt en nommant la date minimale, et d'un
  jour fermé de TARGET2. Les lots réels gardent `collectionDayOf`, inchangé.
  Première version (même jour) : le calendrier des lots, pré-notification
  comprise — « pas avant le 30 » pour un essai du 22.
- **Mandat pour la banque** (2026-10-22) : bouton « Exporter le mandat pour la
  banque » du panneau de génération → `GET
/admin/accounting/collection-tests/debtors/:companyId/mandate.csv` sous
  `collection_test:write`. Le fichier `ModeleImportMandats` de l'export des
  mandats (même rendu `mandateBankCsvOf`, même encodage), réduit au seul mandat
  de l'établissement. **Une lecture** : il ne fige aucun export et ne marque
  rien — l'export groupé de l'entité garde le mandat « à exporter » tant qu'un
  de SES exports n'a pas été marqué importé. Le fichier d'essai n'atteste pas
  que la banque l'a reçu ; le compter comme tel ferait sortir le mandat de
  l'export groupé sans preuve. Refus nommés : société non déclarée, zéro ou
  plusieurs mandats, entité sans ICS, mandat écarté de l'export (repris, sans
  RIB, sans BIC).
- **Plafond** : `MAX_COLLECTION_TEST_CENTS = 100` (1 €), tenu par l'agrégat et
  par un CHECK en base.
- **Q7** : « mandat ponctuel utilisé par un lot réel » = une ligne d'un lot
  **non annulé** (constitué ou déposé), plus large que le « consommé » des
  lots (déposé seulement).
- **Q4** : « à rembourser » = échéance passée sans retour de la banque.
  `refunded_and_returned` dit un remboursement suivi d'un retour.
- **Retours** : une référence `ESS-…` n'est cherchée que parmi les essais
  (statut d'import `collection_test`) ; elle ne touche ni ligne, ni commande.

**Restés ouverts** (non tranchés par ce plan) :

- un `OOFF` d'essai **consomme** le mandat ponctuel pour la banque, mais rien
  ne l'interdit ensuite à un lot réel (§2 « ne marque pas le mandat ») ;
- rien ne sait si un fichier d'essai a été **déposé** : un essai jamais déposé
  passe « à rembourser » à son échéance comme un autre ;
- la **durée de conservation** du fichier gardé (`collection_test.xml`, IBAN en
  clair) : `a-decider` au registre RGPD ;
- la question `FRST` reste à la banque (`question-banque.md` 3.7) ;
- le délai de J + 2 jours ouvrés reste une hypothèse (`question-banque.md` 3.4) ;
- un mandat importé à la banque depuis l'essai réapparaît dans l'export groupé
  de l'entité (rien ne le sait) : la banque le recevra deux fois si on
  l'exporte aussi par là ;
- l'export du mandat ne s'offre que sur un établissement **essayable** (le
  panneau ne liste que ceux-là) : un mandat ponctuel déjà pris par un lot ne
  s'exporte pas depuis l'essai.
