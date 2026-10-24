# Les réponses de la Caisse d'Épargne — ce qu'elles veulent dire, et ce qu'il reste à faire

> Écrit le **2026-10-23**, le jour où la Caisse d'Épargne (CERA) a répondu aux
> 31 questions du texte envoyé ([`question-banque.md`](question-banque.md),
> « Le texte à envoyer »). Les réponses sont reprises ici **d'après le résumé
> fidèle de leur mail collé par Hugo** ; le mail n'est pas dans le dépôt, ses
> deux pièces jointes y sont depuis le 2026-10-23 ([`modeles-banque/`](modeles-banque/), § 2 bis).
>
> Chaque « le code fait » cite un fichier et une ligne **ouverts le
> 2026-10-23**, sous `apps/lfd-api/src/b2b/accounting/` (abrégé `apps/lfd-api/src/b2b/accounting/`).
> Rien n'a été modifié dans le code : ce document est un état et une liste.

Les numéros sont ceux du **texte envoyé** (1 à 31), pas ceux des questions
détaillées 1.1–7 de `question-banque.md`.

---

## 1. Ce qui change, en cinq phrases

1. **Le contrat actuel ne permet pas de déposer un fichier.** Tant que la
   montée vers **CENET REMISES** n'est pas faite (contrat + convention
   d'émission **par schéma**, services aller et retour paramétrés), aucune
   remise ne peut partir, quel que soit l'état du code.
2. **Les deux imports (RIB puis mandats) n'acceptent que du neuf**, 200 lignes
   au plus, et un seul déjà connu fait rejeter **tout** l'import des RIB.
3. **Le fichier de remise tel que nous le produisons est accepté**
   (`pain.008.001.02`, un fichier par schéma, `RCUR` sans `FRST`, un crédit
   global) — deux points restent à trancher : une date d'échéance **par
   fichier** et l'heure limite.
4. **Les valeurs F et G de l'export des mandats sont fausses** dans le code
   (date en `JJ/MM/AAAA` au lieu d'`AAAAMMJJ`, `RCUR`/`OOFF` au lieu de
   `RECURRENT`/`PONCTUEL`), et le nom est coupé à 70 alors que 140 est permis.
5. **Les retours existent en fichier** (`pain.002` ou `camt.054`, quotidiens) :
   l'import déjà écrit d'après la norme a enfin de quoi être éprouvé.

---

## 2. Réponse par réponse

Pour chacune : **la réponse** (2026-10-23), **ce qu'elle veut dire pour nous**,
**ce que le code fait**, **l'écart** et son classement — 🔴 bloquant avant la
première remise · 🟡 à faire · ⚪ rien.

### Étape 1 — Le contrat

**1. Contrat.** L'abonnement CENET actuel ne permet pas de déposer de fichiers.
La banque initie une montée vers **CENET REMISES** : un contrat et une
**convention d'émission par schéma** (une CORE, une B2B) ; dans l'abonnement,
deux services à paramétrer, l'aller (remises) et le retour (impayés).

- _Pour nous_ : la question « le B2B est-il ouvert ? » a sa réponse — pas
  encore, ni le CORE. Signer **au moins** la convention B2B ; la CORE seulement
  si Hugo veut l'avoir prête.
- _Code_ : rien à faire ; le fichier est déjà un fichier par schéma
  (`apps/lfd-api/src/b2b/accounting/domain/services/pain008-document.ts:182`, `LclInstrm` = schéma du
  document).
- 🔴 **Hors code, bloquant** : contrat CENET REMISES et convention B2B signés,
  services aller et retour paramétrés.

**2. Plafonds.** La banque fixe des plafonds internes — **unitaire, par
remise, cumul mensuel** — que **nous** devons lui communiquer. Au-delà, son
service EDI reçoit une alerte et nous sollicite pour vérifier.

- _Pour nous_ : ce n'est pas un refus automatique, c'est un appel. Mais il faut
  donner trois chiffres, et ils doivent tenir le rythme hebdomadaire (jusqu'à
  cinq remises par mois).
- _Code_ : aucun plafond n'existe côté lot (`grep` de `plafond|ceiling|cap` sous
  `apps/lfd-api/src/b2b/accounting/domain/entities/collection-batch.ts` : rien, 2026-10-23).
- 🔴 **Décision D1** (les trois chiffres). 🟡 ensuite : un avertissement à la
  constitution d'un lot qui dépasse le plafond par remise ou unitaire —
  utile, pas bloquant, puisque la banque appelle au lieu de rejeter.

### Étape 2 — Les mandats signés

**3. Délai de pré-notification.** La banque répond sur le **délai de dépôt** :
les remises peuvent être envoyées **au plus tard à J-2** avant la date de
règlement. **Pas de réponse** sur la clause CGV/mandat ni sur la re-signature
des mandats déjà signés.

- _Pour nous_ : la question de la pré-notification **au débiteur** reste
  entière. Ce « J-2 » est un délai de **dépôt**, et il contredit en apparence
  la réponse 22 (voir là).
- ⚪ code ; ❓ toujours ouvert : la clause CGV/mandat et la re-signature.

**4. Forme de la pré-notification.** « Pas utile » pour la banque : seul le
fichier est analysé.

- _Pour nous_ : la banque **ne contrôle pas** la pré-notification. Cela ne la
  lève pas : l'obligation envers le **débiteur** vient du règlement SEPA et de
  nos CGV, pas de la banque. **Ne rien retirer** de l'avis envoyé par
  prélèvement sur la foi de cette réponse.
- ⚪ code (l'avis existe : [`prelevement-automatique.md`](prelevement-automatique.md)).

**5. Preuve du mandat.** En cas de contestation, le litige se règle avec le
client ; si la banque veut le mandat, un **mail** suffit. **Pas de réponse** sur
le niveau de signature eIDAS.

- _Pour nous_ : le PDF du mandat signé, envoyé par mail, est la preuve
  attendue. La signature électronique reste sans réponse.
- ⚪ code ; ❓ eIDAS ouvert (à reposer, voir § 4).

### Étape 3 — L'import des RIB destinataires

**6. Modèle d'import des RIB** : en **pièce jointe** du mail. _Reçu et rangé le 2026-10-23,
confronté au § 2 bis._

- Détail et suite : [`prerequis-export-ribs.md`](prerequis-export-ribs.md) (2026-10-23).

**7. Rattachement** : l'IBAN est lié à la RUM.

- _Pour nous_ : la clé est le couple RUM ↔ IBAN — un renommage du client ne
  casse rien.
- ⚪ code : l'export porte la RUM (A) et l'IBAN (D) sur la même ligne
  (`mandate-bank-export-csv.ts:61-64`).

**8. Nouveaux seulement.** Importer **uniquement les nouveaux RIB** : un RIB
déjà connu fait **rejeter l'import entier**. **200 lignes** au plus.

- Détail et suite : [`prerequis-export-ribs.md`](prerequis-export-ribs.md) § 2 (2026-10-23).

**9. Changement de compte.** Faire signer un **nouveau mandat** d'abord, puis
actualiser l'IBAN dans notre logiciel pour les fichiers suivants.

- _Pour nous_ : la banque ne nous demande pas l'amendement CFONB ; elle nous
  dit « nouveau mandat ». C'est plus simple que ce que
  [`prelevement-sepa.md`](prelevement-sepa.md) préparait (amendement,
  `OrgnlDbtrAgt = SMNDA`).
- _Code_ : un compte changé fait ressortir le mandat à l'export comme un
  mandat à importer (`mandate-bank-export-selection.ts:25-29`), sans colonne
  « ancien IBAN ». La séquence reste `RCUR` (réponse 20).
- 🟡 **Décision D9** : nouveau mandat (nouvelle RUM) à chaque changement de
  compte, ou modification déclarée en colonnes M–R (réponse 14) ? Les deux
  réponses de la banque ne disent pas la même chose — voir § 4.

### Étape 4 — L'import des mandats

> **2026-10-23, après correctif** : l'export des mandats suit le modèle (F en
> `AAAAMMJJ`, G `RECURRENT`/`PONCTUEL`, K `O`, L `N`, 18 colonnes, 200 lignes,
> nom ≤ 140) — détail et hypothèses dans
> [`prerequis-export-mandats.md`](prerequis-export-mandats.md). Les constats
> « faux » et les numéros de ligne ci-dessous décrivent le code AVANT ce
> correctif.

**10. Valeurs.** Colonne **F** : date `AAAAMMJJ`. **G** : `RECURRENT` /
`PONCTUEL`. **H** : `CORE` / `B2B`. Avant l'import, CENET permet de **vérifier
le fichier** (compte rendu d'anomalies, et fichier des comptes à importer si
des RIB sont inconnus).

- _Code_ :
  - F écrit `JJ/MM/AAAA` (`apps/lfd-api/src/b2b/accounting/domain/services/mandate-bank-export-values.ts:35-37`) — **faux** ;
  - G écrit `RCUR` / `OOFF` (`mandate-bank-export-values.ts:18-21`) — **faux** ;
  - H écrit `CORE` / `B2B` (`mandate-bank-export-values.ts:24-27`) — **juste**.
- 🔴 **Bloquant** : corriger F et G. Le module a été écrit pour que ce soit
  « une ligne » (son JSDoc, l. 9-14) ; les specs de l'export
  (`apps/lfd-api/src/b2b/accounting/application/queries/__tests__/mandate-bank-export.handlers.spec.ts`)
  suivront. Le jour reste celui de Paris (`localDay`), seul le format change.
- _Geste_ : toujours passer par la **vérification CENET** avant l'import réel
  (à écrire dans le runbook de la première remise).

**11. Format.** CSV **sans en-tête**, colonnes en jaune obligatoires, nom
**≤ 140 caractères**.

- _Code_ : sans en-tête (`mandate-bank-export-csv.ts:53-56`) ✔ ; nom coupé à
  **70** (`mandate-bank-export-csv.ts:25`, l. 63) ; le nom du `pain.008`
  (`Dbtr/Nm`) est le même, et le rulebook le borne à 70.
- ⚪ **Rien** : 70 ≤ 140, et garder le même nom des deux côtés vaut mieux
  qu'un CSV plus long que le XML. L'encodage, le `;` final et le CRLF n'ont pas
  eu de réponse explicite ; la vérification CENET (réponse 10) le dira.
- ❓ Les « colonnes en jaune » ne sont connues que par le modèle en pièce
  jointe : vérifier que ce sont toujours A à H.

**12. Nouveaux seulement**, 200 lignes au plus.

- _Code_ : l'export ne sort que les mandats sans ligne importée sous leur
  compte actuel (`mandate-bank-export-selection.ts:33-46`) ✔. **Aucune borne
  de 200** : un export prend tout ce qui est à exporter.
- 🟡 **À faire** : borner un export à 200 lignes (les suivantes au prochain
  export). Pas bloquant pour une première remise de quelques clients ; le
  devient au-delà de 200 mandats en attente.

**13. Compte rendu d'import** : nombre de lignes dans le fichier, chargées, en
erreur, et le tableau des lignes en erreur avec leur motif.

- _Code_ : « marquer importé » marque l'export **entier**
  ([`../mandat/export-des-mandats-pour-la-banque.md`](../mandat/export-des-mandats-pour-la-banque.md), « Le cycle »).
- 🟡 **À faire** : pouvoir marquer importé **sauf** les RUM en erreur (elles
  ressortent alors au prochain export). Tant que ce n'est pas là, la consigne
  est : un import avec des erreurs ne se marque pas importé ; on corrige et on
  ré-exporte.

**14. Mandat modifié, révoqué ou repris** : compléter les colonnes **M à R**.

- _Pour nous_ : le modèle a donc **au moins 18 colonnes** (jusqu'à R) ; le code
  en écrit 17 (A à Q).
- _Code_ : `BANK_IMPORT_COLUMN_COUNT = 17` (`mandate-bank-export-csv.ts:22`) ;
  I à Q toujours vides (l. 58-72). Les mandats repris sont **écartés** de
  l'export (`apps/lfd-api/src/b2b/accounting/domain/ports/mandates-for-bank-export.reader.ts:21-26`,
  `taken_over`) ; la révocation n'est pas déclarée.
- 🔴 **Bloquant, petit** : vérifier sur le modèle reçu le nombre exact de
  colonnes ; si c'est 18, en écrire 18 (un fichier à 17 cellules pourrait être
  refusé). _Tranché le 2026-10-23 par le modèle : 18 colonnes, K et L
  obligatoires — § 2 bis._
- 🟡 **À faire** : remplir M–R pour un mandat modifié / révoqué / repris, selon
  le modèle. Pas avant la première remise : aucun de ces cas n'existe encore.

**15. Contrôle au dépôt** : **aucun** contrôle des RIB/mandats quand on dépose
un fichier ; seule la saisie en ligne l'exige.

- _Pour nous_ : la banque ne nous protège pas d'un débit sous une RUM qu'elle
  ne connaît pas. L'import des mandats n'est donc pas une barrière, c'est notre
  discipline — mais elle reste nécessaire (réponses 10 et 27).
- ⚪ code ; 🟡 éventuellement : avertir à la constitution d'un lot qui contient
  un mandat jamais marqué importé (le lien existe, `selectForBankExport`).

### Étape 5 — La préparation de la remise

**16. Format.** `pain.008.001.02` **encore accepté** (la bascule ISO 20022 est
reportée à 2027, sans calendrier). La `.08` est la plus récente et compatible,
et gère l'**adresse structurée**, obligatoire hors EEE.

- _Code_ : `.02` (`apps/lfd-api/src/b2b/accounting/domain/services/pain008-document.ts:126`) ; aucune
  adresse du débiteur (l. 200-218).
- ⚪ **Rien avant la première remise** ; 🟡 **Décision D2** : quand passer en
  `.08` (pas d'urgence, tous nos clients sont dans l'EEE).

**17. Guide** : pas de guide propre, **les règles du CFONB**.

- ⚪ code ; la question du BIC débiteur (`NOTPROVIDED`, `pain008-document.ts:222-229`)
  se tranche donc au guide CFONB et à la vérification de test (réponse 23).

**18. Structure.** **Un fichier par schéma ET par date d'échéance** ; 13 Mo au
plus.

- _Code_ : un lot = une entité × un schéma × un cycle, une seule
  `ReqdColltnDt` pour tout le document (`pain008-document.ts:185`,
  `apps/lfd-api/src/b2b/accounting/domain/entities/collection-batch.ts:134`) ✔. 13 Mo ≈ des dizaines de
  milliers de débits : hors de portée.
- ⚪ **Rien** ; ❓ à garder en tête si un jour deux échéances devaient
  cohabiter dans un cycle.

**19. Crédit** : **un seul crédit global** par remise ; le relevé SDD et le
relevé des rejets permettent de rapprocher un à un.

- _Code_ : pas de `BtchBookg` écrit (`pain008-document.ts:173-197`) → défaut
  de la norme, crédit global ✔.
- ⚪ Rien.

**20. Séquence** : plus besoin de `FRST` ; tout peut être présenté en `RCUR`.

- _Code_ : le lot réel n'écrit jamais `FRST` (`SequenceType = "RCUR" | "OOFF"`,
  `pain008-document.ts:28`) ✔ ; l'essai le permet encore (`TestSequence`,
  l. 35).
- ⚪ lot réel. 🟡 **Décision D3** : retirer `FRST` de l'essai (il ne teste plus
  rien que la banque exige) ou le garder pour vérifier qu'il passe.

**21. Doublons** : niveau fichier (`MsgId` + nombre de transactions + montant
global) et niveau transaction (`EndToEndId`, RUM, IBAN, montant, échéance),
**sur 10 à 15 jours glissants**.

- _Code_ : `MsgId` = ULID du lot, `EndToEndId` = `<lot>-<rang>`
  ([`lot-de-prelevement-fige.md`](lot-de-prelevement-fige.md)) ; un lot
  reconstitué prend un nouvel ULID ✔.
- ⚪ Rien pour le lot. ❓ Un **essai** répété à l'identique (même débiteur,
  même montant, même échéance) dans les 15 jours pourrait être pris pour un
  doublon au niveau transaction, même avec un `EndToEndId` neuf — varier le
  montant ou l'échéance d'un essai à l'autre.

### Étape 6 — Le dépôt

**22. Heure limite.** **CORE** reçu à **J-1 avant 14 h 45** → date respectée,
sinon recalculée à J+2. **B2B** : avant **13 h 45**.

- ⚠️ **Contradiction apparente avec la réponse 3** (« au plus tard J-2 »). Deux
  lectures : J-2 est la règle contractuelle et J-1 l'heure de traitement
  tolérée ; ou J-1 est la vraie limite et J-2 une prudence. **Non tranché ici.**
- _Code_ : la limite de dépôt est un réglage de l'entité, NULL = « à
  renseigner » (`apps/lfd-api/src/b2b/accounting/domain/value-objects/collection-schedule.ts:42-52`,
  1 à 10 jours ouvrés + `HH:MM`). L'essai propose J+2 ouvrés
  (`apps/lfd-api/src/b2b/accounting/domain/services/collection-test-file.ts:27`) — compatible avec les deux
  lectures.
- 🔴 **Décision D4** puis **réglage** (pas de code) : renseigner la limite de
  l'entité B2B. La proposition prudente est **2 jours ouvrés, 13:45**, qui
  tient les deux lectures ; **à faire confirmer par la banque**.

**23. Test** : envoyer le fichier **par mail** à la banque, qui le teste.

- 🔴 **Geste bloquant** : envoyer un fichier d'essai (le prélèvement d'essai,
  [`plan-prelevement-d-essai.md`](plan-prelevement-d-essai.md)) **et** un
  `BROUILLON` d'un vrai lot, avant la première vraie remise. ⚪ code.

**24. Accusés PSR** sur la banque en ligne : **PSR1** (fichier KO seulement),
**PSR2** (opérations ; positif + négatif par défaut, possible négatif seul),
**PSR3** (opérations écartées ; PSR3+ en cours).

- _Pour nous_ : la réception se lit sur CENET, pas par mail. Rien n'est
  automatique de notre côté : « marquer déposé » reste un geste humain.
- 🟡 **Décision D5** : PSR2 positif + négatif (on voit aussi ce qui est passé)
  ou négatif seul. Recommandation : garder le défaut au début.

### Étape 7 — Le rejet

**25. Débit invalide** : seuls les RIB fautifs sont rejetés, pas le fichier.

- _Pour nous_ : un client fautif ne bloque pas les autres. La phrase de
  [`../mandat/rum.md`](../mandat/rum.md) § 4 (un accent fait rejeter le
  fichier entier) reste vraie : c'est un défaut de **format**, contrôlé à la
  réception (réponse 27), pas un débit invalide.
- ⚪ Rien.

**26. Liste des motifs** : pas de liste.

- ⚪ code ; l'annexe de `question-banque.md` reste notre référence, non
  confirmée.

**27. Contrôles** : techniques à réception ; contrôles des RIB le **jour
d'exécution**, avant l'interbancaire.

- _Pour nous_ : un fichier bien formé est accepté au dépôt, et un débit
  fautif n'est rejeté que le jour J — il arrive comme un **retour**, pas comme
  un refus de dépôt.
- ⚪ code : déjà traité comme un retour ([`retours-bancaires.md`](retours-bancaires.md)).

**28. Redéposer** : modifier **l'heure de création** du fichier.

- _Pour nous_ : le contrôle de doublon porte sur le `MsgId` + nombre + montant
  (réponse 21) ; la banque nous dit que changer `CreDtTm` suffit.
- _Code_ : un lot est **figé** — `MsgId` et `CreDtTm` (= l'instant de
  constitution, `apps/lfd-api/src/b2b/accounting/domain/services/collection-batch-file.ts:87`) ne bougent
  pas. Redéposer passe par **annuler puis reconstituer** : nouvel ULID, nouvel
  instant ✔.
- ⚪ Rien ; ne **jamais** retoucher le XML à la main.

**29. Annulation** : toute la remise, tant qu'elle n'est **pas signée**, dans
le suivi des remises CENET ; **pas** d'annulation d'une seule ligne.

- _Code_ : « annuler » un lot existe (`collection-batch.ts:198`) ; il agit chez
  nous, pas chez la banque.
- ⚪ code ; 🟡 runbook : annuler sur CENET **avant** de signer, puis annuler le
  lot chez nous. Une remise signée ne s'annule plus : seul un retour la défait.

### Étape 8 — Les retours

**30. Forme** : fichiers d'impayés **quotidiens**, `pain.002` **ou**
`camt.054`, téléchargeables.

- _Code_ : l'import lit les deux (`apps/lfd-api/src/b2b/accounting/domain/services/bank-return-file.ts:6`,
  `pain.002.001.03` et `camt.054.001.02`, l. 38-41), écrit d'après la norme.
- 🟡 **Décision D6** : lequel paramétrer dans le service « retour » (réponse 1).
  Puis 🟡 éprouver l'import sur un **vrai** fichier (attend le premier retour,
  ou un exemple demandé à la banque).

**31. Délai et imputation** : au fil de l'eau selon la banque du débiteur ;
imputation **globale** du fichier d'impayés ou **unitaire**, au choix ; le
montant retourné et les frais sont **deux écritures distinctes**.

- _Code_ : un retour porte ses frais à part (`feeCents`,
  `apps/lfd-api/src/b2b/accounting/domain/entities/collection-return.ts:55`) ✔ ; le rapprochement est par
  `EndToEndId`, une ligne à la fois.
- 🟡 **Décision D7** : imputation **unitaire** (une écriture par impayé, qui
  colle à notre modèle et au rapprochement par ligne) ou globale.

## 2 bis. Les deux modèles reçus, colonne par colonne

> Pièces jointes du mail, fournies par Hugo et rangées le 2026-10-23 sous
> [`modeles-banque/`](modeles-banque/) :
> [`modele-import-mandats-cenet-remises.xlsx`](modeles-banque/modele-import-mandats-cenet-remises.xlsx)
> et [`modele-comptes-destinataires-2026.csv`](modeles-banque/modele-comptes-destinataires-2026.csv).
> Ouverts le 2026-10-23 : les couleurs de cellules et le format de F lus dans
> le XML du classeur, le CSV décodé en ISO-8859-1.

### Le modèle des mandats — 18 colonnes, A à R

Consignes de la feuille : « enregistrer en CSV sans la ligne d'en-tête »,
« se connecter sur l'interface du client pour importer le fichier »,
« colonnes en jaune obligatoires ». **Jaunes : A à H, K et L.** Le code écrit
**17** cellules (`apps/lfd-api/src/b2b/accounting/domain/services/mandate-bank-export-csv.ts:22`), A à H
remplies, le reste vide (l. 58-72).

| Col. | Intitulé du modèle                    | Oblig.  | Exemple du modèle  | Le code écrit                 | Verdict                                        |
| ---- | ------------------------------------- | ------- | ------------------ | ----------------------------- | ---------------------------------------------- |
| A    | Référence unique du mandat            | oui     | —                  | la RUM                        | ✔ juste                                        |
| B    | Numéro d'identifiant créancier        | oui     | —                  | l'ICS de l'entité             | ✔ juste                                        |
| C    | Nom débiteur                          | oui     | —                  | nom du `pain.008`, coupé à 70 | ✔ juste (≤ 140, réponse 11)                    |
| D    | IBAN débiteur                         | oui     | —                  | IBAN sans espaces             | ✔ juste                                        |
| E    | BIC débiteur                          | oui     | —                  | BIC (mandat sans BIC écarté)  | ✔ juste                                        |
| F    | Date de signature                     | oui     | cellule `yyyymmdd` | `JJ/MM/AAAA`                  | 🔴 **faux** → `AAAAMMJJ`                       |
| G    | Séquence de paiement                  | oui     | `RECURRENT`        | `RCUR` / `OOFF`               | 🔴 **faux** → `RECURRENT` / `PONCTUEL`         |
| H    | Nature du prélèvement                 | oui     | `CORE`             | `CORE` / `B2B`                | ✔ juste (`B2B` d'après le mail, pas l'exemple) |
| I    | Référence du contrat sous-jacent      | non     | —                  | vide                          | ⚪ rien                                        |
| J    | Montant par défaut                    | non     | —                  | vide                          | ⚪ rien (montants variables)                   |
| K    | Mandat déjà émis                      | **oui** | `O`                | **vide**                      | 🔴 **manquant**                                |
| L    | Mandat migré                          | **oui** | `N`                | **vide**                      | 🔴 **manquant**                                |
| M    | Ancien numéro d'identifiant créancier | non     | —                  | vide                          | 🟡 reprise d'un autre créancier                |
| N    | Ancien IBAN débiteur                  | non     | —                  | vide                          | 🟡 changement de compte                        |
| O    | Ancien BIC débiteur                   | non     | —                  | vide                          | 🟡 changement de compte                        |
| P    | Liste de mandat                       | non     | —                  | vide                          | ❓ sens inconnu                                |
| Q    | Ancienne Référence Unique du Mandat   | non     | —                  | vide                          | 🟡 changement de RUM / reprise                 |
| R    | Migration code intervenant initial    | non     | —                  | **absente** (17 colonnes)     | 🔴 colonne à ajouter, vide                     |

Ce que ça veut dire :

- **K et L sont obligatoires et vides chez nous** : notre fichier actuel
  serait refusé, même F et G corrigés. Valeurs supposées `O`/`N` (oui/non)
  d'après les exemples. Pour nos mandats : **K = `O`** si « déjà émis » veut
  dire « signé par le débiteur hors de la banque » (c'est notre cas : le
  mandat est signé chez nous avant l'import) ; **L = `N`** pour un mandat
  frappé par nous, **`O`** pour un mandat repris d'un autre créancier — ceux-là
  sont aujourd'hui écartés de l'export (`taken_over`,
  `apps/lfd-api/src/b2b/accounting/domain/ports/mandates-for-bank-export.reader.ts:26`). Le sens de K est
  **à confirmer** (question Q-B2).
- **18 colonnes, pas 17** : ajouter R vide.
- **Réponse 14 contre le modèle** : la banque dit « colonnes M à R » pour un
  mandat modifié, révoqué ou repris ; mais **P « Liste de mandat »** n'est pas
  une donnée de modification, et rien dans M–R ne dit « révoqué ». Question
  Q-B3.
- La référence d'un mandat qui change de compte (réponse 9 : nouveau mandat)
  remplirait au plus Q (ancienne RUM) — à confirmer avec D9.

### Le modèle des comptes destinataires (le « fichier des RIB »)

> Déplacé le 2026-10-23 dans [`prerequis-export-ribs.md`](prerequis-export-ribs.md),
> la référence du sujet : modèle colonne par colonne, sources, règles, questions,
> option retenue (notre export) et contradiction de `vitruve`.

---

## 3. La liste à faire, dans l'ordre

### 🔴 Bloquant avant la première remise

1. **Contrat CENET REMISES** et **convention B2B** signés ; services aller et
   retour paramétrés (réponse 1). _Hors code._
2. **Communiquer les plafonds** unitaire, par remise, mensuel (réponse 2, D1).
   _Hors code._
3. **Rendre l'export des mandats conforme au modèle** (§ 2 bis) — _code, petit_ :
   - F `AAAAMMJJ`, G `RECURRENT`/`PONCTUEL` (`mandate-bank-export-values.ts`) ;
   - **K et L, obligatoires, aujourd'hui vides** : `O` et `N` pour nos mandats
     (après la réponse à Q-B2) ;
   - **18 colonnes** (ajouter R) ;
   - les specs de l'export suivent.
4. **Bâtir l'export des comptes destinataires** selon [`prerequis-export-ribs.md`](prerequis-export-ribs.md)
   (Latin-1, CRLF, type `I`, IBAN découpé, nouveaux seulement, 200 lignes),
   après les réponses Q-B1, Q-B4, Q-B5 — ou, pour les tout premiers clients,
   saisir les comptes à la main dans CENET. _Pièces jointes reçues le
   2026-10-23._
5. **Limite de dépôt tranchée : J-3 ouvrés à 13h45** (D4, Hugo, 2026-10-23 — plus prudent que J-2 comme que J-1), et la
   renseigner sur l'entité. _Réglage._
6. **Tester par mail** un fichier d'essai et un brouillon de lot (réponse 23).
7. **Import des mandats** : vérification CENET d'abord (réponse 10), import,
   lecture du compte rendu (réponse 13) avant de marquer importé.

### 🟡 À faire

- Borner un export de mandats à **200 lignes** (réponse 12).
- Marquer importé **sauf** les RUM en erreur du compte rendu (réponse 13).
- Colonnes **M–R** : mandat modifié, révoqué, repris (réponse 14).
- Avertir d'un dépassement de plafond à la constitution (réponse 2).
- ~~Avertir d'un lot qui contient un mandat jamais importé (réponse 15).~~
  Bâti le 2026-10-24 : l'onglet 3 de la page « Procédure de prélèvement »
  nomme chaque débiteur du lot au compte ou au mandat non importé
  ([`plan-page-procedure-de-prelevement.md`](plan-page-procedure-de-prelevement.md), P4 révisé).
- Éprouver l'import des retours sur un vrai fichier (réponse 30).
- Runbook : annuler sur CENET avant signature (réponse 29), heure limite,
  vérification avant import.
- `pain.008.001.08` quand Hugo le décide (réponse 16).
- `FRST` dans l'essai (D3).
- **Clause CGV et mandat : pré-notification réduite à 3 jours** (Hugo,
  2026-10-23). _Hors code, à faire relire par un juriste._ Brouillon :

  > « Pré-notification des prélèvements. Chaque prélèvement SEPA est précédé
  > d'une information adressée au client par courriel, au moins trois (3)
  > jours calendaires avant sa date d'échéance, indiquant le montant, la date
  > d'échéance, la référence unique du mandat (RUM), l'identifiant créancier
  > SEPA (ICS) et les factures concernées. Le client accepte expressément ce
  > délai, qui remplace le délai de quatorze (14) jours prévu par défaut par
  > les règles SEPA. »
  - ❓ **Question ouverte** : les mandats **déjà signés** — suffit-il de
    notifier la modification des CGV, ou faut-il les faire re-signer ?
  - Le réglage à 3 jours se fait **à l'écran**, sur la carte des réglages du
    prélèvement de l'entité — pas par une migration ni un défaut de code.

### ⚪ Rien — le code tient déjà la réponse

Réponses 7, 11 (en-tête, longueur), 17, 18, 19, 20 (lot réel), 21 (lot réel),
25, 26, 27, 28, 31 (frais séparés).

---

## 4. Les décisions pour Hugo

| #   | Décision                                                                                                                                                                                                 | Réponse | Proposition                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| D1  | Les **plafonds** à communiquer : unitaire, par remise, cumul mensuel                                                                                                                                     | 2       | à chiffrer depuis le plus gros client et le chiffre mensuel prévu, avec marge                                   |
| D2  | **Passer en `pain.008.001.08`**, et quand                                                                                                                                                                | 16      | pas avant la première remise ; avant 2027                                                                       |
| D3  | **`FRST`** : le retirer de l'essai, ou le garder                                                                                                                                                         | 20      | le retirer : il ne teste plus une exigence                                                                      |
| D4  | **Limite de dépôt** : J-2 (réponse 3) ou J-1 avant 13 h 45 en B2B, 14 h 45 en CORE (réponse 22) — **contradiction à faire lever par la banque**                                                          | 3, 22   | **Tranché par Hugo le 2026-10-23 : J-3 ouvrés, 13:45** — plus prudent que les deux réponses ; réglage à l'écran |
| D5  | **PSR2** : positif + négatif, ou négatif seul                                                                                                                                                            | 24      | positif + négatif au début                                                                                      |
| D6  | Retours en **`pain.002` ou `camt.054`**                                                                                                                                                                  | 30      | celui que la banque recommande ; l'import lit les deux                                                          |
| D7  | Imputation des impayés **unitaire ou globale**                                                                                                                                                           | 31      | unitaire                                                                                                        |
| D8  | Convention **CORE** dès maintenant, ou B2B seule                                                                                                                                                         | 1       | B2B seule                                                                                                       |
| D9  | Changement de compte : **nouveau mandat** (réponse 9) ou **modification en colonnes M–R** (réponse 14) — les deux réponses ne disent pas la même chose                                                   | 9, 14   | nouveau mandat, comme la banque le dit en 9                                                                     |
| D11 | **K « Mandat déjà émis »** : `O` pour tous nos mandats (signés chez nous avant l'import) ?                                                                                                               | modèle  | `O`, sous réserve de Q-B2                                                                                       |
| D12 | **Adresse et SIREN** dans le fichier des comptes : les renseigner (facturation, SIREN de la société) ou laisser vide si facultatif                                                                       | modèle  | les renseigner quand on les a                                                                                   |
| D13 | ✅ **Tranchée le 2026-10-23 (Hugo)** : la colonne **L (BIC)** du fichier des comptes est **toujours renseignée**, même en zone SEPA où la banque la dit facultative — « dans le doute on mettra le bic » | modèle  | —                                                                                                               |
| D10 | **Un fichier par échéance** (réponse 18) : déjà le cas ; confirmer qu'un cycle n'aura jamais deux échéances                                                                                              | 18      | confirmer                                                                                                       |

## 5. Ce qui reste sans réponse — à reposer

- **Clause CGV / mandat** pour réduire le délai de pré-notification, et la
  **re-signature** des mandats déjà signés (question 3 du texte) : la banque
  ne s'en occupe pas ; c'est une question de **règlement SEPA et de CGV**, à
  poser au juriste ou au cabinet, pas à la banque.
- **Niveau eIDAS** d'un mandat signé électroniquement (question 5).
- **J-2 ou J-1** (réponses 3 et 22).
- **Encodage, `;` final, CRLF** des imports : non répondu explicitement ; la
  vérification CENET tranchera.
- **BIC débiteur** absent (`NOTPROVIDED`) : non répondu ; le test par mail
  tranchera.
- Le **deuxième envoi** ([`question-banque-v2.md`](question-banque-v2.md)) n'a
  pas de réponse.
- **Confirmation de la réponse 15** (ajoutée le 2026-10-24) : « Un prélèvement déposé par fichier sous une RUM jamais importée dans CENET est-il exécuté normalement ? Et un compte destinataire jamais importé ? (confirmation de la réponse 15) » Si
  la réponse est non, l'avertissement par débiteur de la page devient un
  blocage par débiteur (plan de la page, P4).

## 5 bis. Les nouvelles questions à poser à la banque (après les modèles)

- **Q-B1** — La consigne « Colonne D, E, F, G : » du modèle des comptes est
  coupée : que dit-elle (adresse obligatoire ? longueur ?) ?
- **Q-B2** — Les valeurs de **K** (« Mandat déjà émis ») et **L** (« Mandat
  migré ») : `O`/`N` ? Que veut dire « déjà émis » pour un mandat signé par
  notre client avant l'import ?
- **Q-B3** — Votre réponse dit « colonnes M à R » pour un mandat modifié,
  révoqué ou repris ; que met-on dans **P** (« Liste de mandat ») et dans
  **R** ? Comment déclare-t-on une **révocation**, qu'aucune colonne ne nomme ?
- **Q-B4** — Le fichier des comptes : quelles colonnes sont **obligatoires** ?
  Avec ou **sans la ligne d'en-tête** ? En type `I`, K porte-t-il le **BBAN**
  (I et J à part) ou l'**IBAN entier** ? Longueur du nom ? Que sont « Nom
  liste » et « NIF » ?
- **Q-B5** — Comment un compte importé **rejoint-il sa RUM**, puisque le
  fichier des comptes n'a pas de colonne RUM : par l'IBAN de la colonne D des
  mandats ?
- **Q-B6** — Le fichier des comptes est en ISO-8859-1 : un nom **sans
  accents** (comme dans le fichier des mandats) est-il accepté ?

## 6. Ce qui attendait les pièces jointes

> ✅ **Reçues le 2026-10-23** et confrontées au code au § 2 bis. Ce qui suit
> est l'état d'avant, gardé pour la trace.

- Le **modèle d'import des RIB** (réponse 6) : tout l'export des RIB.
- Le **modèle des mandats** à jour : le nombre de colonnes (M–R → au moins 18)
  et les colonnes « en jaune » (réponses 11 et 14).

À leur arrivée (fait le 2026-10-23, [`modeles-banque/`](modeles-banque/)) : les ranger sous `documentation/comptabilite/prelevement/`
(sans IBAN réel), et mettre à jour ce document et
[`../mandat/export-des-mandats-pour-la-banque.md`](../mandat/export-des-mandats-pour-la-banque.md).
