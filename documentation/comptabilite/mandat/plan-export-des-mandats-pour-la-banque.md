# Plan — l'export des mandats pour le portail de la banque

> 📐 **Plan v2, 2026-10-08** (v1 contredite par `vitruve` : quatre BLOQUANTS ; le § 2 bis prime sur les §§ 2 à 4), écrit en l'absence d'Hugo. Il fait sortir des
> IBAN en clair : frontière de sécurité, donc contredit par `vitruve` avant
> d'être bâti (§ 6). Arbitrages dans
> [`../arbitrages-en-absence.md`](../arbitrages-en-absence.md).

## 1. Le besoin

La Caisse d'Épargne importe les mandats par un fichier CSV, avant le premier
dépôt d'un lot (`ModeleImportMandats`, reçu le 2026-10-08) : « Les colonnes
A à H incluses sont obligatoires […] enlever la ligne d'en-tête […] importer
les RIB destinataires avant les mandats. »

Le modèle (ASCII, `;` séparateur **et** terminateur de ligne, CRLF), 17
colonnes, dont A à H obligatoires :

| Col | En-tête du modèle              | Ce qu'on écrit                                 |
| --- | ------------------------------ | ---------------------------------------------- |
| A   | Reference unique du mandat     | RUM du mandat                                  |
| B   | Numero d identifiant creancier | ICS de l'entité émettrice                      |
| C   | Nom debiteur                   | titulaire du RIB, translittéré en ASCII, ≤ 70  |
| D   | IBAN debiteur                  | IBAN **en clair** (descellé), sans espaces     |
| E   | BIC debiteur                   | BIC du RIB                                     |
| F   | Date de signature              | jour local de `accepted_at`, **`JJ/MM/AAAA`**  |
| G   | Sequence de paiement           | **`RCUR`** (récurrent) / **`OOFF`** (ponctuel) |
| H   | Nature du prelevement          | **`CORE`** / **`B2B`** (schéma figé du mandat) |
| I–Q | contrat, montant, migration…   | vides                                          |

Les valeurs de F, G, H sont **supposées** : les questions sont posées à la
banque ([`../prelevement/question-banque.md`](../prelevement/question-banque.md)).
Elles vivent dans **un seul module** de traduction, pour qu'une réponse de la
banque se corrige en une ligne.

## 2. Ce qu'on exporte

- Les mandats **actifs** de l'entité émettrice choisie (pas les brouillons, ni
  les révoqués). Option « seulement ceux pas encore exportés » : un mandat
  garde `bank_exported_at` (nullable, posé par un geste « Marquer importé »,
  pas par le téléchargement — un fichier téléchargé n'est pas importé).
- Un mandat sans BIC ou sans date de signature n'est pas exporté : il est
  nommé en tête de l'écran (aucune valeur inventée).

## 2 bis. Ce que la v2 change (prime sur les §§ 2 à 4)

1. **Un export est une écriture, pas une lecture.** `POST
admin/accounting/legal-entities/:id/mandate-exports` (commande
   `ExportMandatesForBank`, **`@RequirePermission("b2b_accounting:write")`**)
   fige un **export** : table `mandate_bank_export` (entité, auteur, instant,
   nombre) et `mandate_bank_export_line` (mandat, RUM, **empreinte SHA-256 de
   l'IBAN exporté**, jamais l'IBAN), et rend son id. Le fichier se lit par
   `GET …/mandate-exports/:exportId/file.csv`, même droit, `no-store`,
   `attachment` : il est **recalculé** depuis les mandats de l'export et
   refusé (409) si l'empreinte d'un compte ne correspond plus. Le fait
   `mandate_bank_export.created` (entité, nombre, auteur — jamais un IBAN)
   s'écrit dans la commande.
2. **Une lecture filtrée par créancier**, déclarée et implémentée dans
   `b2b/payments` (`MandatesForBankExportReader.activeOf(creditorId)`), qui
   rend chaque mandat actif de l'entité avec son compte recopié descellé —
   pas les lecteurs du lot, indexés par société.
3. **« Déjà importé » se lit par l'empreinte**, pas par une date sur le
   mandat : un mandat est « à exporter » s'il n'a aucune ligne d'export
   **importé** portant l'empreinte de son compte actuel. Un changement de
   compte (l'amendement, quand il existera) le fait ressortir tout seul.
   Aujourd'hui, remplacer le RIB sous un mandat actif est refusé
   ([`restes-du-mandat.md`](restes-du-mandat.md) § 2).
4. **« Marquer importé » marque un export**, pas des mandats : `POST
…/mandate-exports/:exportId/imported`, méthode de l'agrégat
   `MandateBankExport.markImported(at, by)` (refuse un double marquage), fait
   `mandate_bank_export.imported`. L'export appartient à l'entité de la
   route, vérifié dans la requête.
5. **Écartés et nommés en tête** : mandats repris d'un autre créancier
   (`creditor_id` nul — colonnes L/M de la banque, à voir avec elle), mandat
   actif sans compte recopié, BIC vide (`""`).
6. **CSV** : chaque cellule passe par `sepa()` (`pain008-document.ts`, le seul
   translittérateur ASCII du dépôt) **puis** perd tout `+ - = @` de tête
   (injection de formule) ; la RUM et l'ICS aussi.
7. **Nom du débiteur** = le même que le `pain.008` (`debtorName`), pour que
   la banque rapproche ses deux fichiers ; **date F** = le jour Europe/Paris
   de `accepted_at`, par la même fonction que `DtOfSgntr`.
8. Un mandat **révoqué après import** n'est pas signalé à la banque : la
   banque n'en a pas besoin pour ne pas le débiter (nous ne le mettons plus
   dans un lot). Dit à l'écran.

## 3. Sécurité

- **Droit** : `b2b_accounting:write` (comme le téléchargement du XML du lot,
  qui porte déjà les IBAN en clair).
- Réponse en `attachment`, `Cache-Control: no-store` ; rien n'est rangé ni
  journalisé en clair : le fait `mandates.bank_export_downloaded` dit l'entité,
  le nombre et l'auteur, **jamais un IBAN**.
- Le descellement passe par le même port que le lot.

## 4. Route et écran

- `GET admin/accounting/legal-entities/:id/mandates-export.csv?onlyNew=` et
  `POST …/mandates-export/mark-imported` `{ mandateIds }`.
- Fiche de l'entité juridique, carte « Mandats à la banque » : nombre de
  mandats actifs, non importés, le bouton de téléchargement, « Marquer
  importés ».

## 5. Les RIB destinataires

Le modèle n'est pas reçu : rien n'est bâti tant que la banque ne l'a pas
envoyé (question 1 de `question-banque.md`).

## 6. Contradiction (`vitruve`)

v1 contredite le 2026-10-08. **BLOQUANTS, corrigés** : droit sans mécanisme
(§ 2 bis-1) ; port de descellement inexistant et lecteurs du lot indexés par
société (2) ; marqueur rendu faux par un changement de compte (3) ; écriture
dans l'agrégat par primitives et fait écrit par un `GET` (1, 4).
**SÉRIEUX, corrigés** : mandats repris, BIC vide, compte absent (5) ;
injection CSV (6) ; nom et date alignés sur le `pain.008` (7) ; révoqués (8).
**Relevé en passant, à trancher par Hugo** : `GET …/file.xml` du lot ne
demande que `b2b_accounting:read`, alors que le fichier porte les IBAN en
clair (arbitrage A16).

## 7. Lot

| Lot    | Contenu                                                                                                                                |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| **M1** | module de traduction, tables d'export (migration), lecture par créancier, commandes Exporter et Marquer importé, fichier, faits, écran |

## 8. M1 bâti (2026-10-09, non commité à l'écriture de ces lignes)

Bâti selon le § 2 bis. Ce qui existe :

- **Migration** `20261009100000_l_export_des_mandats_pour_la_banque` (additive) :
  `mandate_bank_export` (entité, auteur, instant, nombre, « importé » par qui et
  quand) et `mandate_bank_export_line` (mandat, RUM, empreinte). Contraintes :
  export non vide, « importé » = instant ET auteur, empreinte = 64 hex. Aucun
  IBAN ni BIC en base, ni droit accordé.
- **Lecture par créancier** : port `MandatesForBankExportReader`, déclaré par
  la comptabilité (`accounting/domain/ports/`), implémenté par `payments`
  (`PrismaMandatesForBankExportReader`, même `FieldCipher` et même
  `debitedAccounts` que le lot), relié dans `appBootstrap/debtor-mandate.module.ts`.
- **Module de traduction** F/G/H : `mandate-bank-export-values.ts` (seul
  endroit où `JJ/MM/AAAA`, `RCUR`/`OOFF`, `CORE`/`B2B` s'écrivent) ; F par
  `localDay`, la fonction de `DtOfSgntr`, désormais exportée.
- **Fichier** : `mandate-bank-export-csv.ts` — `sepa()` puis retrait de
  `+ - = @` (et des espaces qui les séparent) en tête de chaque cellule, nom
  coupé à 70, 17 cellules terminées par `;`, CRLF, sans en-tête.
- **Agrégat** `MandateBankExport` (`export`, `markImported`), commandes
  `ExportMandatesForBank` et `MarkMandateBankExportImported`, requêtes du
  fichier et de la carte ; routes `…/legal-entities/:id/mandate-exports`
  (`GET` lecture, `POST` écriture, `GET …/:exportId/file.csv` sous
  `b2b_accounting:write` + `no-store` + `attachment`, `POST …/imported`).
- **Faits** `mandate_bank_export.created` / `.imported` (sujet : l'entité ;
  charge : `mandateCount`), phrases du journal.
- **Écran** : carte « Mandats à la banque » sur la fiche de l'entité.
- **À côté** : les deux colonnes d'auteur au registre RGPD
  (`documentation/legal/rgpd-registre.json`), le préfixe
  `mandate_bank_export.` sous le module « comptabilité » du journal, la durée
  de la suite e2e mesurée (6,3 s, pas de `e2e:rebalance`).

Tranché en bâtissant (à relire par Hugo) :

1. Le port est **déclaré par la comptabilité** et implémenté par `payments`,
   comme `CollectionMandatesReader` — et non « déclaré dans `payments` » à la
   lettre du § 2 bis-2 : la comptabilité n'importe rien de `payments`
   aujourd'hui, et le sens inverse est celui du lot.
2. Le lecteur rend les faits du mandat ; l'**ICS** vient de l'entité
   (`LegalEntityReader`) et le **nom du débiteur** de
   `CollectionCandidatesReader.companyNames` + `nameOf` — la source du
   `Dbtr/Nm` du `pain.008` (raison sociale du débiteur figé, l'id à défaut).
3. Les mandats **repris** (`creditor_id` nul) sont écartés et nommés sur la
   carte de **chaque** entité : ils ne sont à aucune.
4. Le fichier refuse (409) aussi un mandat **devenu inexportable** (révoqué,
   RIB retiré, BIC vidé) depuis l'export, pas seulement un compte changé.
5. Une entité **sans ICS** ne peut pas préparer d'export (409) : la colonne B
   est obligatoire.
6. Le fichier est servi en `text/csv; charset=us-ascii`, nommé
   `mandats-banque-<SIREN>-<id>.csv`.
7. Le fait ne porte pas l'id de l'export (le catalogue refuse un id nu) :
   l'entité, le nombre, l'auteur.
8. Les libellés des raisons d'écart vivent dans le back-office, pas dans
   `@lfd/contracts` : la carte n'importe que des types du paquet (un export de
   valeur neuf casse le serveur de dev tant que son pré-bundle n'est pas purgé).

Reste hors M1 : les RIB destinataires (§ 5), les colonnes L/M des mandats
repris (A17), la confirmation de F/G/H par la banque (A15).
