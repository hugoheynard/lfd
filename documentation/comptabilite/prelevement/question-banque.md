# Les questions à la Caisse d'Épargne

> ✅ **Répondu le 2026-10-23** (Caisse d'Épargne, CERA) : les 31 questions du
> texte envoyé ont une réponse, sauf la clause CGV/re-signature (3), le niveau
> eIDAS (5) et la liste des motifs de rejet (26, « pas de liste »). Les
> réponses 3 (« J-2 ») et 22 (« J-1 avant 13 h 45 / 14 h 45 ») se contredisent
> en apparence. Ce qu'elles veulent dire, l'écart avec le code et la liste à
> faire : [`reponses-de-la-banque.md`](reponses-de-la-banque.md). Les questions ci-dessous ne sont pas réécrites.

> Rassemblées le 2026-10-08 (Hugo), **réécrites le 2026-10-12** pour être
> envoyées telles quelles. Sources : [`prelevement-sepa.md`](prelevement-sepa.md)
> §§ 7, 8, 12 ; [`lot-de-prelevement-fige.md`](lot-de-prelevement-fige.md) ;
> [`prelevement-automatique.md`](prelevement-automatique.md) ;
> [`retours-bancaires.md`](retours-bancaires.md) ;
> [`../mandat/export-des-mandats-pour-la-banque.md`](../mandat/export-des-mandats-pour-la-banque.md) ;
> [`../facturation/plan-rythme-de-facturation.md`](../facturation/plan-rythme-de-facturation.md) ;
> la réponse du service EDI du 2026-10-08. Une réponse reçue se reporte ici,
> datée, puis dans le document qu'elle débloque.

## Déjà répondu (2026-10-08)

- **Import des mandats** : modèle CSV `ModeleImportMandats`, colonnes A à H
  obligatoires, enregistré en CSV, **sans ligne d'en-tête** à l'import.
- **Avant les mandats**, importer les **RIB destinataires**.

## Ce que nous sommes en train de faire — à lire avant les questions

Le contexte que la banque doit avoir pour répondre juste, repris en tête du
message :

- Nous vendons à des **professionnels** (boulangerie de gros) et facturons
  leurs commandes **périodiquement**. Chaque facture est payée par
  **prélèvement SEPA**, sous un mandat signé par le client.
- **Nous ne prélevons qu'en SEPA B2B** (Hugo, 2026-10-12). Le **CORE** n'est
  pas utilisé, mais nous posons les questions pour les deux schémas : le
  jour où nous l'ouvririons (petits clients, entrepreneurs individuels), la
  réponse doit déjà être là. Le code sait produire les deux.
- Mandats **récurrents** pour l'essentiel ; quelques **ponctuels**.
- Nous fabriquons nous-mêmes le fichier de remise (XML `pain.008.001.02`) et le
  **déposons à la main sur le portail**. Pas d'EBICS pour l'instant.
- **Une ligne de débit par client et par remise**, pas une par commande.
- Le **rythme de facturation** sera, au choix de l'entité : **mensuel, deux
  fois par mois, ou hebdomadaire**. En hebdomadaire, cela fait jusqu'à **cinq
  remises par mois**.
- Nous voulons **réduire le délai de pré-notification** de 14 jours
  (décision du 2026-10-12), avec la clause qu'il faut dans nos CGV et nos
  mandats.

---

## Les questions, une par une

Pour chacune : **le besoin**, **pourquoi on la pose**, **ce que nous faisons
aujourd'hui sans la réponse**, et **ce qu'elle débloque**.

### 1. L'import des RIB destinataires

> Posées le 2026-10-08, répondues le 2026-10-23 (réponses 6 à 9). Questions,
> réponses et suite rassemblées dans [`prerequis-export-ribs.md`](prerequis-export-ribs.md).

### 2. L'import des mandats (modèle `ModeleImportMandats` reçu)

**2.1 Les valeurs exactes des colonnes F, G, H.**

| Col. | Nous écrivons aujourd'hui (hypothèse) | Question                                                         |
| ---- | ------------------------------------- | ---------------------------------------------------------------- |
| F    | `JJ/MM/AAAA`                          | ou `AAAA-MM-JJ` ? date de signature du papier, est-ce la bonne ? |
| G    | `RCUR` / `OOFF`                       | ou `FRST`, ou « Récurrent » / « Ponctuel » ?                     |
| H    | `CORE` / `B2B`                        | ou `COR1`, ou un libellé ?                                       |

- _Pourquoi_ : ces valeurs ne sont pas dans le modèle reçu ; une valeur fausse
  ferait refuser l'import, ou pire, l'accepter avec un mauvais schéma.

**2.2 Format du fichier** : encodage attendu (nous envoyons de l'**ASCII sans
accents**, `;` séparateur ET terminateur de ligne, fin de ligne CRLF) ;
longueur maximale du nom du débiteur (nous coupons à 70) ; le `;` final est-il
attendu ou gênant ?

**2.3 Fichier complet ou seulement les nouveaux mandats ?** C'est la question
centrale quand nous ajoutons des clients.

- Aujourd'hui notre outil n'exporte **que les mandats pas encore importés**
  (ou dont le compte a changé). Est-ce ce que vous attendez ?
- Si nous renvoyions **tous** les mandats, triés : un mandat déjà connu (même
  RUM) est-il **ignoré**, **mis à jour**, **refusé** (et refuse-t-il tout le
  fichier ?), ou **créé en double** ?
- Y a-t-il un **ordre de tri** attendu ?
- Un import partiellement refusé : les lignes valides sont-elles prises, ou
  rien ?
- Comment savoir qu'un import a **réussi**, ligne par ligne (compte rendu,
  fichier d'erreurs) ?

**2.4 Mandat modifié** (le client change de compte, ou on change la RUM) :
faut-il réimporter avec les colonnes « Ancien IBAN » / « Ancienne RUM »
(I à Q du modèle), ou un autre geste ? Le premier prélèvement après un
changement de banque doit-il être en `FRST` (règle CFONB, avec
`OrgnlDbtrAgt = SMNDA`) ?

**2.5 Mandat révoqué** : faut-il vous le signaler (fichier, portail), ou
suffit-il de ne plus le présenter ?

**2.6 Mandats repris d'un ancien créancier** (signés sous un autre ICS) :
comment les déclarer (colonnes L/M « mandat migré ») ?

**2.7 Le mandat est-il obligatoire chez vous AVANT la remise ?** Un débit dont
la RUM n'a pas été importée est-il rejeté, ou seulement celui-là ?

### 3. La remise (le fichier des débits)

**3.1 Le format.** Le portail accepte-t-il le **XML SEPA `pain.008`** ? En
**`pain.008.001.02`** (ce que nous produisons) ou **`pain.008.001.08`** ?
Jusqu'à quand la `.02` est-elle acceptée ?

- _Pourquoi_ : le format est figé dans notre code ; changer de version est un
  chantier.

**3.2 Le guide d'implémentation** de la Caisse d'Épargne : les champs que vous
exigez au-delà de la norme EPC (BIC du débiteur ? adresse du débiteur ?
`InitgPty/Id` ?), les longueurs, le jeu de caractères.

**3.3 Structure du fichier.**

- **CORE et B2B dans le même fichier** (deux blocs `PmtInf`), ou un fichier
  par schéma ? _Nous faisons aujourd'hui un fichier par schéma._
- Plusieurs dates d'échéance dans un fichier, ou une seule ?
- `BtchBookg` : un seul crédit global par remise sur notre compte, ou un
  crédit par débit ? Que recommandez-vous pour le rapprochement ?
- Nombre maximum de débits ou taille maximale d'un fichier ?
- Nommage du fichier imposé ?

**3.4 Délai de dépôt** (CORE et B2B séparément) : combien de **jours ouvrés
avant l'échéance** le fichier doit-il être déposé, et **avant quelle heure** ?
_Aujourd'hui notre écran affiche « limite de dépôt : à renseigner »._

**3.5 Plusieurs remises par mois.** En rythme hebdomadaire nous déposerons
jusqu'à cinq remises par mois. Y a-t-il une limite, un frais par remise, ou
un risque (contrôle anti-fraude, plafond de remise) ?

**3.6 Plafond** : avez-vous un **plafond de remise** (montant par fichier, par
jour, par mois) sur notre contrat ? Que se passe-t-il au-delà ?

**3.7 `FRST` ou `RCUR`** pour le premier prélèvement sous un mandat neuf ?
_Nous écrivons toujours `RCUR` (ou `OOFF` pour un mandat ponctuel) ; le
rulebook le permet depuis 2016, mais certaines banques exigent encore `FRST`._

**3.8 Doublons** : contrôlez-vous l'unicité du `MsgId` et de l'`EndToEndId` ?
Sur quelle durée ? _Chaque fichier a un `MsgId` neuf, même après une
correction._

**3.9 Tester** : peut-on déposer un fichier **en recette** ou « à blanc »
(contrôle sans exécution) avant le premier vrai ?

**3.10 Confirmation** : comment savoir que la remise est **reçue** puis
**acceptée** (accusé sur le portail, e-mail, fichier `pain.002`) ? Sous quel
délai ?

### 4. Le rejet d'un fichier ou d'un lot

_Demandé par Hugo le 2026-10-12._

**4.1 Rejet du fichier entier ou ligne par ligne ?** Quand un débit est
invalide (IBAN faux, RUM inconnue, mandat révoqué) :

- **tout le fichier** est-il refusé, ou seulement **le bloc** (`PmtInf`), ou
  seulement **la ligne** ?
- _Pourquoi_ : si un seul client fautif fait refuser toute la remise, aucun
  client n'est prélevé ce jour-là. Nous préférons le savoir AVANT et retirer la
  ligne fautive nous-mêmes.

**4.2 Les motifs de rejet** : pouvez-vous nous donner la **liste des motifs**
qui font refuser un fichier au dépôt (contrôle de format, de cohérence, de
contrat), avec leur **code** et leur **libellé** ? Voir notre liste en annexe :
lesquels vérifiez-vous, lesquels manquent ?

**4.3 Comment le rejet nous est notifié** : message au dépôt, e-mail, fichier
`pain.002` ? Sous quel délai (immédiat, le soir, le lendemain) ? Jusqu'à
quand un fichier peut-il être rejeté après son dépôt ?

**4.4 Redéposer** après un rejet :

- même fichier corrigé avec un **`MsgId` nouveau** (ce que nous faisons) :
  correct ?
- la date d'échéance d'origine reste-t-elle possible si le délai de dépôt
  n'est plus tenu, ou faut-il la décaler ?
- y a-t-il un frais par rejet de fichier ?

**4.5 Annuler une remise déposée** (erreur constatée après dépôt) : est-ce
possible, jusqu'à quand, et par quel geste (portail, demande d'annulation
`camt.055`) ? Annuler **un seul débit** d'une remise est-il possible ?

### 5. Les retours après dépôt (rejets bancaires, impayés)

- Sous quelle forme recevons-nous les rejets et retours : fichier
  **`pain.002`**, relevé **`camt.054`**, ou seulement à l'écran ? Peut-on les
  **télécharger en fichier** ?
- Sous quel délai et par quel canal ?
- Le **montant du retour** est-il débité de notre compte avec ses frais
  séparés, ou en une écriture ?
- Pouvez-vous nous donner les **frais par retour**, par motif s'ils diffèrent ?

_Débloque_ : l'import automatique des retours (aujourd'hui saisie à la main).

### 6. Le délai de pré-notification

**6.1 Le délai minimum.** Nous voulons réduire le délai de 14 jours.

- Quel est le **minimum** que vous acceptez, en **CORE** et en **B2B** ? (Le
  rulebook permet de descendre à 1 jour en CORE et 2 en B2B… est-ce aussi
  votre règle ?)
- Suffit-il que la clause figure dans **nos CGV et le mandat**, ou faut-il un
  **avenant** à notre contrat avec vous ?
- _Pourquoi_ : avec un rythme hebdomadaire et 14 jours de préavis, un client a
  en permanence deux à trois factures en attente. Avec 2 jours, il est prélevé
  dans la semaine.

**6.2 La forme de la pré-notification.** Nous envoyons un **e-mail par
prélèvement** (montant, date, RUM, ICS, numéros de facture). Est-ce suffisant ?
Un avis par facture, ou un échéancier, est-il admis pour des montants
variables ?

**6.3 Le délai change pour les mandats déjà signés** : faut-il faire
re-signer les mandats existants, ou un avenant aux CGV notifié suffit-il ?

### 7. Les mandats B2B et la signature

- **B2B** : le client doit enregistrer le mandat auprès de **sa propre
  banque**. Avez-vous une exigence de votre côté ? Que se passe-t-il si le
  client ne l'a pas fait (rejet `AM04`/`MD01` ?) ?
- **Signature électronique** du mandat : l'acceptez-vous, et à quel niveau
  (simple, avancée, qualifiée) ? Une case cochée sur notre espace client
  suffit-elle ?

---

## Annexe — les raisons possibles du rejet d'un fichier

_Ce que nous savons de la norme et de l'usage, pour poser la question 4.2.
Non confirmé par la Caisse d'Épargne._

### Rejet du fichier entier, au dépôt (format et cohérence)

| Motif                                                           | Chez nous aujourd'hui                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------ |
| XML mal formé, ou non conforme au schéma `pain.008` attendu     | produit par code, schéma figé ; version à confirmer (3.1)    |
| Version `pain.008` non acceptée par le portail                  | question 3.1                                                 |
| `NbOfTxs` ou `CtrlSum` faux (au niveau du message ou du bloc)   | calculés à la constitution, un test les tient                |
| Montant avec plus de deux décimales, ou nul, ou négatif         | centimes entiers → deux décimales                            |
| Caractères hors du jeu SEPA (accents, `&`, etc.)                | translittération ASCII                                       |
| `MsgId` déjà utilisé (doublon de fichier)                       | ULID neuf à chaque constitution                              |
| `CreDtTm` mal formé (fuseau)                                    | écrit sans décalage, à vérifier avec leur guide              |
| ICS absent, faux, ou pas celui du contrat                       | un lot sans ICS est refusé chez nous avant le fichier        |
| IBAN ou BIC créancier faux                                      | lus sur l'entité                                             |
| Bloc qui mélange séquences ou schémas (`FRST`+`RCUR`, CORE+B2B) | un bloc par séquence, un fichier par schéma                  |
| Fichier en BROUILLON (notre bandeau) déposé par erreur          | le `MsgId` porte `BROUILLON-`, le portail devrait le refuser |
| Fichier trop gros, ou nommé hors convention                     | question 3.3                                                 |

### Rejet du fichier entier, au contrôle du contrat

| Motif                                          | Chez nous aujourd'hui                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| Délai de dépôt non tenu (échéance trop proche) | limite de dépôt affichée, « à renseigner » tant que 3.4 n'est pas répondue |
| Échéance un jour non ouvré TARGET2             | calendrier TARGET2 dans le code                                            |
| Plafond de remise dépassé                      | inconnu (3.6)                                                              |
| Schéma B2B non ouvert sur notre contrat        | à confirmer                                                                |

### Rejet d'une ligne (avant ou après règlement)

| Code ISO        | Motif                                                                   |
| --------------- | ----------------------------------------------------------------------- |
| `AC01`          | IBAN du débiteur incorrect                                              |
| `AC04`          | compte du débiteur clôturé                                              |
| `AC06`          | compte bloqué                                                           |
| `AG01`          | prélèvement interdit sur ce compte (livret, etc.)                       |
| `AM04`          | provision insuffisante                                                  |
| `MD01`          | pas de mandat (B2B non enregistré chez la banque du client, ou révoqué) |
| `MD02`          | données du mandat manquantes ou incohérentes                            |
| `MD06`          | contestation du débiteur (CORE seulement, 8 semaines)                   |
| `MD07`          | débiteur décédé                                                         |
| `MS02`          | refus du débiteur, sans motif                                           |
| `MS03`          | motif non précisé par la banque                                         |
| `RC01`          | BIC incorrect                                                           |
| `RR01` à `RR04` | raisons réglementaires (identité, adresse)                              |
| `SL01`          | service spécifique de la banque du débiteur (liste blanche/noire)       |
| `FF01`          | format de fichier invalide                                              |
| `DUPL`          | paiement en double                                                      |

Les codes reçus sont déjà rangés dans `collection_return.reason_code`
([`retours-bancaires.md`](retours-bancaires.md)).

---

## Ce que chaque réponse débloque

| Question      | Débloque                                                                         |
| ------------- | -------------------------------------------------------------------------------- |
| 1             | l'export des RIB destinataires (rien n'est bâti)                                 |
| 2.1, 2.2      | la conformité de l'export des mandats (valeurs F/G/H supposées)                  |
| 2.3, 1.3      | export « les nouveaux seulement » confirmé, ou ajout d'un export complet         |
| 2.4, 3.7      | l'amendement de mandat et la séquence `FRST` (différés)                          |
| 3.1, 3.2      | la conformité du `pain.008` déjà produit                                         |
| 3.3, 3.5, 3.6 | le rythme hebdomadaire (plan du rythme de facturation)                           |
| 3.4           | la limite de dépôt du calendrier (« à renseigner »)                              |
| 3.9           | un premier dépôt sans risque                                                     |
| 4             | la marche à suivre quand un fichier est refusé ; contrôles à ajouter avant dépôt |
| 5             | l'import automatique des retours                                                 |
| 6             | réduire le préavis : clause CGV et mandat, puis le réglage de l'entité           |
| 7             | le parcours de signature du mandat                                               |

## Le texte à envoyer

> Restructuré le 2026-10-12 (Hugo) : les questions suivent le **parcours
> réel**, du contrat jusqu'aux impayés. Chaque étape suppose la précédente
> réglée, et la banque peut répondre dans l'ordre. Les questions détaillées
> ci-dessus restent la référence ; le tableau « Ce que chaque réponse
> débloque » garde leur numérotation.

> **Objet : Prélèvements SEPA — nos questions pour préparer nos premières remises**
>
> Bonjour,
>
> Merci pour le retour de votre service EDI sur l'import des mandats. Nous
> préparons nos premières remises de prélèvement SEPA et voulons que nos
> fichiers soient justes du premier coup. Pour vous faciliter la réponse, nos
> questions suivent l'ordre dans lequel nous allons procéder : le contrat,
> les mandats signés par nos clients, l'import des RIB puis des mandats sur
> votre portail, la préparation et le dépôt des remises, et enfin les rejets
> et les retours.
>
> **Notre situation, en quelques lignes**
>
> Nous facturons des clients professionnels et les prélevons **uniquement
> en SEPA B2B**, sous mandats **récurrents** (quelques ponctuels). Nous
> n'utilisons pas le CORE aujourd'hui, mais nous pourrions l'ouvrir plus
> tard pour de petits clients : quand une question porte sur les deux
> schémas, merci de nous répondre pour **les deux**. Nous produisons nous-mêmes un
> fichier XML **`pain.008.001.02`** et le déposons **à la main sur votre
> portail** (pas d'EBICS pour l'instant). Chaque remise compte **un débit par
> client**. Selon notre réglage, nous facturerons **chaque mois, deux fois par
> mois ou chaque semaine**, soit jusqu'à **cinq remises par mois**.
>
> ---
>
> **Étape 1 — Notre contrat de prélèvement**
>
> 1. Le schéma **B2B** est-il bien ouvert sur notre contrat ? Si nous voulions
>    un jour prélever aussi en **CORE**, faudrait-il une démarche ou un avenant ?
> 2. Avons-nous un **plafond** (par remise, par jour ou par mois) ? Que se
>    passe-t-il si une remise le dépasse ?
>    _Réponse du 2026-10-23 : plafonds internes (unitaire, remise, mensuel) que NOUS communiquons ; dépassement = appel du service EDI ([détail](reponses-de-la-banque.md))._
>
> **Étape 2 — Les mandats signés par nos clients**
>
> 3. **Délai de pré-notification** : nous souhaitons réduire le délai de
>    14 jours. Quel **minimum** acceptez-vous, en CORE et en B2B ? Une clause
>    dans nos CGV et nos mandats suffit-elle, ou faut-il un **avenant** à
>    notre contrat avec vous ? Pour les mandats **déjà signés**, faut-il les
>    faire re-signer, ou une modification des CGV notifiée au client
>    suffit-elle ?
> 4. **Forme de la pré-notification** : nous envoyons un e-mail par
>    prélèvement (montant, date, RUM, ICS, numéros de facture). Cela vous
>    convient-il ?
> 5. **Preuve du mandat** : en cas de contestation, ou si vous nous la
>    demandez, sous quelle forme devons-nous vous fournir le mandat signé
>    (PDF, original papier), et dans quel délai ? Si le mandat est signé
>    électroniquement, quel **niveau de signature** exigez-vous (simple,
>    avancée, qualifiée au sens du règlement eIDAS) ?
>
> **Étape 3 — L'import des RIB destinataires** (à faire avant les mandats,
> d'après votre service EDI)
>
> 6. Pouvez-vous nous envoyer le **modèle d'import** : colonnes obligatoires
>    et facultatives, ordre, longueurs, séparateur, encodage, ligne d'en-tête
>    ou non, IBAN avec ou sans espaces, **BIC obligatoire** ou non ?
> 7. Comment un RIB est-il ensuite **rattaché à son mandat** : par l'IBAN, par
>    le nom, ou par un identifiant que nous fournissons ?
> 8. Quand nous **ajoutons des clients**, faut-il envoyer **seulement les
>    nouveaux RIB**, ou pouvons-nous renvoyer **toute la liste** ? Dans ce
>    cas, les RIB déjà connus sont-ils ignorés, mis à jour ou créés en
>    double ?
> 9. Un client qui **change de compte** : comment remplacer son RIB ?
>    _Réponse du 2026-10-23 : modèle en pièce jointe, pas encore dans le dépôt ([détail](reponses-de-la-banque.md))._
>
> **Étape 4 — L'import des mandats** (modèle `ModeleImportMandats` reçu)
>
> 10. **Valeurs exactes** des colonnes : F « date de signature »
>     (`JJ/MM/AAAA` ou `AAAA-MM-JJ` ?), G « séquence » (`RCUR`/`OOFF`,
>     `FRST`, ou un libellé ?), H « nature » (`CORE`/`B2B` ?).
> 11. **Format** : nous envoyons de l'ASCII sans accents, `;` en séparateur et
>     en fin de ligne, sans en-tête. Est-ce correct ? Longueur maximale du nom
>     du débiteur ?
> 12. Quand nous **ajoutons des clients** : faut-il importer **seulement les
>     nouveaux mandats** (c'est ce que fait notre outil aujourd'hui), ou
>     pouvons-nous renvoyer **l'ensemble trié** ? Dans ce cas, un mandat déjà
>     connu (même RUM) est-il ignoré, mis à jour ou refusé — et un refus
>     bloque-t-il tout le fichier ? Un ordre de tri est-il attendu ?
> 13. Comment savoir qu'un import a **réussi, ligne par ligne** (compte rendu,
>     fichier d'erreurs) ?
> 14. Comment déclarer un **mandat modifié** (nouveau compte du client :
>     colonnes « ancien IBAN / ancienne RUM » ?), un **mandat révoqué**, et un
>     mandat **repris d'un ancien créancier** ?
> 15. Un débit présenté sous une RUM **pas encore importée** est-il rejeté —
>     seul, ou avec toute la remise ?
>     _Réponse du 2026-10-23 : F `AAAAMMJJ`, G `RECURRENT`/`PONCTUEL`, H `CORE`/`B2B` ; vérification du fichier possible dans CENET ([détail](reponses-de-la-banque.md))._
>
> **Étape 5 — La préparation de la remise**
>
> 16. Acceptez-vous le format **`pain.008.001.02`**, et jusqu'à quand ? Ou
>     faut-il le `pain.008.001.08` ?
> 17. Avez-vous un **guide d'implémentation** propre à la Caisse d'Épargne
>     (champs exigés au-delà de la norme, notamment le BIC du débiteur) ?
> 18. **Structure** : CORE et B2B dans **un même fichier** ou séparés ?
>     Plusieurs dates d'échéance dans un fichier ? Taille maximale, nommage
>     imposé ?
> 19. **Crédit** sur notre compte : un seul montant global par remise, ou un
>     par débit ?
> 20. Premier prélèvement sous un mandat neuf : **`FRST` ou `RCUR`** ? Et après
>     un changement de banque du client ?
> 21. Contrôlez-vous les **doublons** (identifiant de fichier `MsgId`,
>     identifiant de débit) ? Sur quelle durée ?
>     _Réponse du 2026-10-23 : `.02` encore accepté (bascule reportée à 2027) ; `.08` compatible, adresse structurée ([détail](reponses-de-la-banque.md))._
>     _Réponse du 2026-10-23 : plus besoin de `FRST`, tout en `RCUR` ([détail](reponses-de-la-banque.md))._
>
> **Étape 6 — Le dépôt**
>
> 22. **Délai de dépôt** : combien de jours ouvrés avant l'échéance, et avant
>     quelle heure, en CORE et en B2B ?
> 23. Pouvons-nous **tester** une remise avant la première vraie (recette, ou
>     dépôt à blanc contrôlé sans exécution) ?
> 24. Comment savoir que la remise est **reçue**, puis **acceptée** (accusé sur
>     le portail, e-mail, fichier) ? Sous quel délai ?
>     _Réponse du 2026-10-23 : CORE à J-1 avant 14 h 45, B2B avant 13 h 45 — contredit en apparence le « J-2 » de la réponse 3 ([détail](reponses-de-la-banque.md))._
>
> **Étape 7 — Le rejet d'un fichier ou d'une remise**
>
> 25. Quand un débit est invalide (IBAN faux, RUM inconnue, mandat révoqué),
>     refusez-vous **tout le fichier**, **le bloc** concerné, ou **seulement
>     ce débit** ?
> 26. Pouvez-vous nous donner la **liste des motifs** de rejet d'un fichier au
>     dépôt, avec leurs codes et libellés ? (Nous avons listé ceux que nous
>     connaissons : format XML, totaux, caractères, doublon, délai non tenu,
>     jour non ouvré, plafond… — est-ce complet ?)
> 27. Comment et **sous quel délai** un rejet nous est-il notifié ? Jusqu'à
>     quand un fichier peut-il être rejeté après son dépôt ?
> 28. Pour **redéposer** : un fichier corrigé avec un nouvel identifiant
>     suffit-il ? L'échéance d'origine reste-t-elle possible si le délai de
>     dépôt n'est plus tenu ?
> 29. Peut-on **annuler** une remise déjà déposée, ou un seul débit, et
>     jusqu'à quand ?
>
> **Étape 8 — Les retours après règlement (impayés, contestations)**
>
> 30. Sous quelle forme les recevons-nous : fichier **`pain.002`**, relevé
>     **`camt.054`**, ou seulement à l'écran ? Peut-on les **télécharger en
>     fichier** ?
> 31. Sous quel délai ? Le montant retourné et les frais sont-ils débités
>     **séparément** ou en une seule écriture ?
>
> ---
>
> Nous savons que la liste est longue : des réponses partielles nous aident
> déjà, en priorité les étapes 1, 3 et 4, qui conditionnent nos premiers
> imports. Nous avons besoin d'une **réponse écrite** sur l'ensemble de ces
> points, plutôt que d'un échange téléphonique : nos fichiers et nos
> procédures seront construits à partir de vos réponses, et nous devons
> pouvoir nous y référer.
>
> Merci beaucoup pour votre aide,
