# Plan — les notes photo du commercial sur un compte client

> **État au 2026-09-15** : 📐 plan, **rien n'est bâti**. **Contredit par
> `vitruve` le même jour** : un BLOQUANT (qui lit la fiche client) et onze
> objections sérieuses, toutes intégrées ou tranchées — leur sort est au §6.
> Décisions de Hugo reçues le même jour, Q1 confirmée comprise. Lot 0 lancé.

## 0. La demande

> « ma commerciale a besoin sur un client de stocker les photos de ses notes
> papier, pas de grande qualité, mais il faut qu'on puisse donner un titre de
> note, une description, une photo, suppression définitive, remplacement de la
> photo — assez proche de ce qu'on a fait sur étapes, on pourrait presque faire
> une mutualisation avec étapes de livraison. Je pense qu'on aurait la même
> mécanique de positionnement. » (Hugo, 2026-09-15)

## 1. L'existant (ouvert et vérifié le 2026-09-15, recoupé par `vitruve`)

### 1.1 La procédure de livraison — la référence, EN PRODUCTION

Migration `20260915160000_procedure_de_livraison` présente sur `origin/main`.
Plan : [`plan-procedure-de-livraison.md`](plan-procedure-de-livraison.md).

- **Agrégat** `DeliveryProcedure` (`src/b2b/account/domain/entities/delivery-procedure.ts`,
  213 lignes) : `addStep` **en fin**, `reviseStep`, `attachPhoto` /
  `detachPhoto` (rendent l'ancienne clé), `removeStep` (suppression physique,
  rend la clé), `reorder` (permutation EXACTE, sinon 409). Maximum 20.
- **Contenu** `DeliveryStepContent` : titre ≤ 80, texte ≤ 1000. **Photo**
  `DeliveryStepPhoto` : ≤ 1 Mo, JPEG/PNG aux octets, dimensions lisibles. Les
  messages de refus parlent d'« étape » et de « procédure ».
- **Identité** : une procédure par **adresse**, vérifiée active
  (`ensureDeliveryAddress`), unique sur `address_id`, clé étrangère vers
  l'adresse seulement.
- **Séquence d'écriture** (`delivery-procedure-editing.ts`) : valider → ranger
  la photo neuve → verrou (clé société/adresse) + charger/muter/sauver → après
  commit, supprimer l'ancienne photo. Deux portes, client et staff ; la porte
  client ne trace rien (`NOTHING_TO_TRACE`), la porte staff publie UN fait avec
  une `action`.
- **Persistance** : `save` fait un `upsert` par ligne à chaque écriture
  (`prisma-delivery-procedure.repository.ts`), dans `PrismaUnitOfWork.run`
  (`$transaction` sans délai réglé : défaut Prisma de 5 s).
- **Stockage** : `DocumentStore`, qui est le bucket **`kbis`**
  (`platform/context/context.module.ts`) ; `CustomerDocumentStore` est le
  bucket `customers`. Clé `companies/{companyId}/delivery-procedures/…`.
- **Écran partagé** (`packages/b2b-ui/src/company/delivery-procedure/`, 1 221
  lignes hors specs) : port `DeliveryProcedureGateway`, brouillon pur,
  réduction de photo (1600 px, JPEG 0,8 puis 0,6), **un seul composant**
  éditeur qui bascule entre liste et formulaire dans la même carte. Chaque
  vignette est téléchargée par une requête authentifiée, en pleine taille.
- **Filet de tests, et ses trous** :
  - API : 5 specs, et `test/delivery-procedure.e2e-spec.ts`. Celui-ci vérifie
    les **statuts** des refus, jamais leurs **messages** — qui sont affichés
    tels quels — et `nosniff` mais pas `Cache-Control`.
  - Écran : 2 specs `b2b-ui` (brouillon, arithmétique photo). **L'éditeur (327
    lignes) et le formulaire (143) n'ont aucune spec propre** ; ils ne sont
    traversés que par le panneau admin et le dialogue client, et **aucun test
    ne choisit, remplace ni retire une photo**.
  - Fronts : 2 specs admin, 3 plateforme (passerelle, dialogue, libellés).

### 1.2 Ailleurs

- Aucune note staff attachée à une société. Le seul voisin est `Lead.notes`
  (`growth.prisma`), texte libre d'un prospect.
- 🔴 **`b2b_companies` : `write` pour `admin` et `commercial`, `read` pour
  `comptabilite` ET `support`** (`packages/contracts/src/staff-access.ts`,
  l. 298, 323, 360, 387). La première version de ce plan oubliait `support`.
- `lint:context-boundaries` ignore les imports à l'intérieur d'un même bloc ;
  `prisma-model-ownership` raisonne par bloc. Aucun dossier `shared/` n'existe
  au niveau d'un bloc métier (seulement `platform/shared`, et deux à
  l'intérieur de contextes du PIM).
- `lint:journal-tracked` ne surveille que certaines zones
  (`dev-toolbox/gates/journal-tracked.mjs`) : un nouveau contexte n'y est pas.
- Le journal est append-only : aucune route n'y écrit ni n'y efface.

## 2. Décisions

**D1 — Un nouveau contexte `src/b2b/client-notes/`**, agrégat
`ClientNotebook` : le carnet d'UNE société, qui naît à la première note. Pas
dans `account/` : une note de commercial n'est ni une identité ni un réglage.

**D2 — La note** : titre obligatoire ≤ 80, description ≤ 2000, photo
**facultative**. **50 notes au plus** par société (Hugo). Pas de date de la note
papier (Hugo) : la date de dépôt et l'auteur, figés, suffisent.

**D3 — Classées à la main par le commercial, nouvelle note en premier**
(Hugo). Monter / descendre, permutation exacte au réordonnancement — la même
règle que les étapes, qui, elles, ajoutent en fin.

**D4 — Suppression définitive, photo comprise** (Hugo), même exception écrite
à « pas de DELETE physique » que les étapes : le carnet ne se supprime jamais,
une note si. Remplacement de la photo : keep / replace / remove.

**D5 — Visibilité : admin et commercial seulement** (Hugo, confirmé le
2026-09-15). Une ressource de permission neuve, `b2b_client_notes` :
`write` pour `admin` et `commercial`, rien pour `comptabilite`, `support`,
`dev`. Aucune route côté client. L'onglet et ses routes exigent
`b2b_client_notes:read`.

**D6 — Le journal ne garde AUCUN contenu de note.** Chaque geste publie
`company.client_note_edited_by_staff` `{ companyId, noteId, action }`
(`note_added` / `note_revised` / `note_removed` / `notes_reordered`), comme les
gestes staff sur les adresses — ni titre, ni description, ni clé de photo.
Sans ça, une note « supprimée définitivement » resterait lisible dans un journal
qu'on ne peut pas effacer. `b2b/client-notes` entre dans `lint:journal-tracked`.

**D7 — Stockage** : `DocumentStore` (bucket `kbis`), **comme les photos
d'étapes**, clé `companies/{companyId}/client-notes/{noteId}-{ulid}`. Choisi en
connaissance de cause : c'est le bucket des pièces que le staff dépose sur une
société, et aucun code ne liste le préfixe `companies/{id}/`. Le changer après
le premier dépôt demanderait une migration d'objets.

**D8 — Le socle partagé d'abord** (Hugo), et une **convention neuve dite en
clair** : `src/b2b/shared/photo-cards/` est le premier dossier partagé au niveau
d'un bloc métier. Il est admis parce que la règle est commune et pas seulement le
code ; `CLAUDE.md` §3 en reçoit la mention dans le commit qui le crée.

Ce qui se partage, et ce qui se **paramètre** :

| Couche      | Socle                                                                                            | Paramètres / propre à chaque usage                                           |
| ----------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Domaine     | liste ordonnée : ajout, révision, photo attach/detach, retrait (rend la clé), permutation exacte | borne, **côté d'ajout** (fin / tête), longueurs, fabrique des erreurs (mots) |
| Photo       | VO : poids, format aux octets, dimensions                                                        | le message (« étape » / « note »)                                            |
| Application | séquence valider → ranger → verrou/sauver → nettoyer                                             | identité et sa vérification, clé du verrou, clé de stockage, trace           |
| HTTP        | multipart, `servePhoto`                                                                          | chemins, surface, permission                                                 |
| Écran       | brouillon, réduction photo, formulaire, éditeur liste + formulaire, port abstrait                | libellés, bornes, côté d'ajout, passerelle                                   |

**Ce qui ne bouge pas pour la procédure** : tables, routes, contrat
`DeliveryProcedure*`, clés de stockage, textes client fr/en/it (les FICHIERS de
libellés peuvent changer de type, pas leurs textes), messages de refus.
`DeliveryProcedure` garde son API publique et délègue au socle : ses specs
restent à leur place, sans ré-export mort.

**D9 — « Aucun changement observable » se PROUVE avant d'extraire** : un lot 0
pose sur le code actuel les tests qui manquent, et ils doivent passer avant
comme après.

- e2e : les **messages** de chaque refus (étape inconnue, borne, ordre périmé,
  photo trop lourde, format, tronquée) et `Cache-Control` ;
- `b2b-ui` : une spec de l'éditeur et une du formulaire — ajouter, refaire,
  monter/descendre aux bornes, supprimer, **choisir, remplacer et retirer une
  photo**.

**D10 — L'écran des notes** : l'onglet **« Notes »** de la fiche client, entre
Informations et Commandes, héberge **l'éditeur du socle tel quel** — liste et
formulaire dans la même carte, comme la procédure. Rien n'est coupé en deux,
donc l'écran de la procédure ne change pas. Pas de `capture="environment"` :
`accept="image/*"` propose déjà l'appareil ET la galerie, et une note
photographiée plus tôt doit pouvoir se choisir.

**D11 — La charge à 50 notes.**

- Persistance : l'adaptateur des notes n'écrit que ce qui a changé — le
  contenu de la note touchée, et la position des lignes qui ont bougé — au lieu
  d'un `upsert` par ligne. Une note en tête décale toutes les positions : c'est
  un `UPDATE` par rang, pas une réécriture du contenu.
- Écran : les vignettes se chargent **quand elles entrent à l'écran**, pas
  toutes à l'ouverture — cinquante photos d'un Mo sur le téléphone de la
  commerciale ne partent pas d'un coup.

**D12 — Migration additive** : `client_notebooks` (`company_id` **unique** et
clé étrangère `RESTRICT` vers `companies`), `client_notes` (`notebook_id` clé
étrangère `CASCADE`, `position`, `title`, `body`, `photo_key`, auteur figé
`created_by_sub` / `created_by_name`, `created_at`, `updated_at`), index
`(notebook_id, position)` sans unique — même raison que les étapes. Retour
arrière : `DROP` des deux tables tant qu'aucune note n'a été saisie ; après,
c'est détruire les notes d'une commerciale.

## 3. Ce que ce plan ne fait pas

- Pas de recherche dans les notes, pas d'OCR, pas de miniature côté serveur.
- Pas de notes sur un prospect (`Lead`).
- Pas de note visible par le client, ni exportée dans « Données ».
- Pas de glisser-déposer.

## 4. Lots

| Lot | Contenu                                                                                                                                                             | Agent             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 0   | **Le filet** (D9) sur le code actuel : messages de refus et `Cache-Control` en e2e ; specs de l'éditeur et du formulaire `b2b-ui`. Vert AVANT toute extraction.     | batisseur + pablo |
| 1   | **Socle API** `src/b2b/shared/photo-cards/`, tests à son niveau ; `DeliveryProcedure` et sa séquence délèguent. Filet du lot 0 inchangé et vert. Mention CLAUDE.md. | batisseur         |
| 2   | **Socle écran** `b2b-ui/src/photo-cards/` (+ entrée `exports` du `package.json`) ; l'éditeur de procédure le consomme. Filet du lot 0 inchangé et vert.             | pablo             |
| 3   | **Notes API** : migration, permission `b2b_client_notes`, agrégat, handlers staff, contrôleur, fait sans contenu, zone de `journal-tracked`, contrat, tests.        | batisseur         |
| 4   | **Notes écran** : passerelle admin, onglet « Notes » gardé par la permission, vignettes à la demande.                                                               | pablo             |

Chaque lot passe `cerberus` et reçoit son commit. **Les lots 0 à 2 ne partent
pas seuls vers `main`** (merger déploie, CLAUDE.md §0) : ils y vont avec les lots
3 et 4, ou pas du tout — un socle sans second consommateur n'a rien prouvé.
Tant que le lot 3 n'est pas committé, les lots 1 et 2 se défont par un revert.

## 5. Questions pour Hugo

Toutes tranchées le 2026-09-15 : **admin et commercial seulement** (Q1, confirmée après que deux réponses se sont contredites) ; 50 notes au plus ; nouvelle note en tête ; pas de date
de la note papier ; classement à la main par le commercial ; socle partagé
d'abord.

## 6. La contradiction de `vitruve` (2026-09-15) et son sort

| Objection                                                                                                 | Sort                                                                              |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **B1** `support` lit aussi `b2b_companies` : « comme la fiche » ouvre les notes au support                | corrigée — §1.2, D5 ; Q1 reposée, confirmée par Hugo                              |
| **S2** les deux usages divergent (ajout, bornes, identité, verrou, mur, faits, messages)                  | tranchée par Hugo (socle d'abord) — ce qui diverge est paramètre, D8              |
| **S3** « specs inchangées » contredit l'extraction ; socle sans tests                                     | corrigée — `DeliveryProcedure` garde son API et délègue ; tests du socle au lot 1 |
| **S4** le filet ne prouve pas « aucun changement observable » (messages, `Cache-Control`, éditeur, photo) | corrigée — lot 0, D9                                                              |
| **S5** D8 voulait couper l'éditeur ; dialogue et panneau contradictoires                                  | corrigée — l'éditeur tel quel dans l'onglet, D10                                  |
| **S6** `capture="environment"` retire la galerie et change la procédure                                   | corrigée — abandonné, D10                                                         |
| **S7** aucun mécanisme ne garantit le fait journalisé                                                     | corrigée — zone ajoutée à `journal-tracked`, D6                                   |
| **S8** le contenu du fait rendrait la suppression non définitive                                          | corrigée — aucun contenu dans la charge, D6                                       |
| **S9** réécriture complète à chaque geste, 100 vignettes pleine taille                                    | corrigée — borne 50 (Hugo), écriture ciblée et vignettes à la demande, D11        |
| **S10** bucket `kbis` choisi sans le dire                                                                 | assumée et écrite — D7                                                            |
| **S11** premier `shared/` au niveau d'un bloc, convention créée en silence                                | corrigée — dite en D8, mention dans CLAUDE.md au lot 1                            |
| **S12** irréversibilité non signalée ; carnet sans unique ni clé étrangère                                | corrigée — §4 (réversibilité par lot), D12                                        |
| **Mineurs** comptes de lignes et de specs, `exports` de `b2b-ui`, D3 annoncée avant Q3                    | corrigées — §1.1, lot 2, D3                                                       |
