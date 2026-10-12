# Les questions à la Caisse d'Épargne

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
- Les deux schémas coexistent : **SEPA B2B** (la plupart des clients pros) et
  **SEPA CORE** (petits clients, entrepreneurs individuels).
- Mandats **récurrents** pour l'essentiel ; quelques **ponctuels**.
- Nous fabriquons nous-mêmes le fichier de remise (XML `pain.008.001.02`) et le
  **déposons à la main sur le portail**. Pas d'EBICS pour l'instant.
- **Une ligne de débit par client et par remise**, pas une par commande.
- Le **rythme de facturation** sera, au choix de l'entité : **mensuel, deux
  fois par mois, ou hebdomadaire**. En hebdomadaire, cela fait jusqu'à **cinq
  remises par mois**.
- Volume de départ : quelques dizaines de clients, montants unitaires de
  quelques centaines à quelques milliers d'euros. _(Hugo : à ajuster avant
  l'envoi.)_
- Nous voulons **réduire le délai de pré-notification** de 14 jours
  (décision du 2026-10-12), avec la clause qu'il faut dans nos CGV et nos
  mandats.

---

## Les questions, une par une

Pour chacune : **le besoin**, **pourquoi on la pose**, **ce que nous faisons
aujourd'hui sans la réponse**, et **ce qu'elle débloque**.

### 1. L'import des RIB destinataires

**1.1 Le modèle du fichier.**

- _Besoin_ : produire depuis notre outil le fichier d'import des RIB, comme
  nous le faisons déjà pour les mandats.
- _Pourquoi_ : votre service EDI nous dit de l'importer AVANT les mandats,
  mais nous n'avons pas son modèle.
- _Nous demandons_ : le modèle (nom, colonnes obligatoires et facultatives,
  ordre, longueurs), le séparateur, l'encodage (ASCII, Latin-1, UTF-8 ?), la
  présence ou non d'un en-tête et d'un `;` final, le format de l'IBAN (avec ou
  sans espaces) et si le **BIC** est obligatoire.
- _Aujourd'hui_ : rien n'est bâti ; on ne peut pas faire l'import complet.
- _Débloque_ : l'export des RIB.

**1.2 Pourquoi les RIB avant les mandats ?** Le mandat porte déjà l'IBAN et
le BIC (colonnes D et E). L'import des RIB crée-t-il un « bénéficiaire » ou
« tiers » dans le portail, auquel le mandat se rattache ? Par quelle clé :
l'IBAN, le nom, un identifiant que nous choisissons ?

- _Pourquoi_ : si le rattachement se fait par le nom, un client renommé casse
  le lien ; si c'est par un identifiant à nous, nous devons le fournir et le
  garder stable.

**1.3 Fichier complet ou seulement les nouveaux ?** Quand nous ajoutons des
clients, faut-il envoyer **seulement les nouveaux RIB**, ou peut-on renvoyer
**toute la liste** ?

- Si on renvoie toute la liste : les RIB déjà connus sont-ils **ignorés**,
  **mis à jour**, ou **créés en double** ? L'import est-il refusé en entier ?
- _Pourquoi_ : nous savons faire les deux, mais un doublon chez vous ferait
  peut-être prélever deux fois ou refuser l'import.

**1.4 Un client qui change de compte.** Nouveau RIB pour un tiers existant :
on importe la nouvelle ligne et l'ancienne est remplacée ? Ou il faut
supprimer l'ancienne à la main ?

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

### 8. Notre compte créancier

- Confirmer notre **BIC** et notre **ICS**.
- **Frais** : par remise, par débit, par rejet de fichier, par retour, et
  tout abonnement au service de prélèvement.

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
| 8             | le calcul du coût du prélèvement direct, jamais fait                             |

## Le texte à envoyer

> Bonjour,
>
> Merci pour le retour de votre service EDI sur l'import des mandats. Nous
> préparons nos premières remises de prélèvement SEPA et voulons que nos
> fichiers soient justes du premier coup. Voici notre situation, puis nos
> questions.
>
> **Notre situation** : nous facturons des clients professionnels et les
> prélevons par SEPA, en B2B pour la plupart et en CORE pour quelques-uns,
> sous mandats récurrents (quelques ponctuels). Nous produisons nous-mêmes un
> fichier XML `pain.008.001.02` et le déposons sur le portail. Selon les
> clients, nous facturerons chaque mois, deux fois par mois ou chaque
> semaine — jusqu'à cinq remises par mois. Nous souhaitons aussi réduire le
> délai de pré-notification de 14 jours.
>
> **1. RIB destinataires** — Pouvez-vous nous envoyer le modèle d'import
> (colonnes, ordre, encodage, en-tête, format de l'IBAN, BIC obligatoire ?) ?
> Comment le RIB est-il ensuite rattaché au mandat ? Quand nous ajoutons des
> clients, faut-il envoyer seulement les nouveaux, ou peut-on renvoyer toute
> la liste — et dans ce cas, les RIB déjà connus sont-ils ignorés, mis à jour
> ou doublés ? Comment remplacer le RIB d'un client qui change de compte ?
>
> **2. Mandats** — Valeurs exactes des colonnes F (format de date), G
> (séquence : `RCUR`/`OOFF`, `FRST`, ou libellé ?) et H (`CORE`/`B2B` ?).
> Encodage, longueur maximale du nom, `;` final attendu ? Quand nous ajoutons
> des clients, faut-il importer seulement les nouveaux mandats, ou peut-on
> renvoyer l'ensemble trié — un mandat déjà connu est-il alors ignoré, mis à
> jour ou refusé, et un refus bloque-t-il tout le fichier ? Comment savoir
> qu'un import a réussi ligne par ligne ? Comment déclarer un mandat modifié
> (colonnes « ancien IBAN / ancienne RUM » ?), un mandat révoqué, et un
> mandat repris d'un ancien créancier ? Un débit sous une RUM non importée
> est-il rejeté ?
>
> **3. Remise** — Acceptez-vous `pain.008.001.02`, et jusqu'à quand ?
> Avez-vous un guide d'implémentation (champs exigés au-delà de la norme,
> dont le BIC du débiteur) ? CORE et B2B dans un même fichier ou séparés ?
> Plusieurs échéances par fichier ? Crédit global ou par débit ? Taille
> maximale, nommage ? Délai de dépôt avant l'échéance et heure limite, en CORE
> et en B2B ? Limite ou frais pour plusieurs remises par mois ? Plafond de
> remise sur notre contrat ? Premier prélèvement : `FRST` ou `RCUR` ?
> Contrôlez-vous les doublons de `MsgId` ? Peut-on tester une remise à blanc ?
> Comment savoir qu'une remise est reçue puis acceptée ?
>
> **4. Rejet d'un fichier ou d'un lot** — Quand un débit est invalide, tout le
> fichier est-il refusé, ou seulement ce débit ? Pouvez-vous nous donner la
> liste des motifs de rejet d'un fichier au dépôt, avec leurs codes ? Comment
> et sous quel délai le rejet nous est-il notifié ? Pour redéposer, un fichier
> corrigé avec un nouvel identifiant suffit-il, et l'échéance d'origine
> reste-t-elle possible ? Peut-on annuler une remise déjà déposée, ou un seul
> débit, et jusqu'à quand ? Y a-t-il des frais de rejet ?
>
> **5. Retours** — Sous quelle forme recevons-nous rejets et impayés (fichier
> `pain.002`, `camt.054`, portail seul) ? Sous quel délai ? Quels frais par
> retour ?
>
> **6. Pré-notification** — Quel délai minimum acceptez-vous en CORE et en
> B2B ? La clause dans nos CGV et nos mandats suffit-elle, ou faut-il un
> avenant avec vous ? Pour les mandats déjà signés, faut-il les faire
> re-signer ? Un e-mail par prélèvement (montant, date, RUM, ICS, factures)
> convient-il ?
>
> **7. Mandats B2B et signature** — Exigences de votre côté pour le B2B ?
> Acceptez-vous un mandat signé électroniquement, et à quel niveau ?
>
> **8. Notre compte** — Pouvez-vous confirmer notre BIC et notre ICS, et nous
> indiquer les frais (par remise, par débit, par rejet, par retour,
> abonnement) ?
>
> Merci beaucoup pour votre aide,
