# Le mandat SEPA, côté client — `/mon-compte`

> Écrit le 2026-09-14 à la demande de Hugo. **Soumis à `vitruve`** (argent +
> frontière de sécurité, `CLAUDE.md` §9 bis) avant toute ligne de code.
> Rien de ce qui suit n'est construit.

## 0. La demande

À côté de la carte RIB, une carte **« Générer mon mandat »**. Une fois généré,
le client peut **le voir** et **le télécharger** (deux icônes), lit la consigne
**« renvoyez le mandat daté et signé »**, et dispose d'un bouton **« utiliser la
signature électronique »**.

## 1. Ce qui existe (vérifié le 2026-09-14)

| Geste                                         | Staff                                                                                                         | Client |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------ |
| Frapper un mandat (RUM neuve, statut `draft`) | `POST /admin/companies/:id/mandate` — `MintMandateHandler`                                                    | ❌     |
| Lire le mandat courant                        | `GET /admin/companies/:id/mandate` → `MandateSectionView` (+ `publishableKey`)                                | ❌     |
| Aperçu PDF                                    | `GET /admin/companies/:id/mandate/preview.pdf` — **toujours filigrané EXEMPLE**                               | ❌     |
| PDF nominatif (avec RUM)                      | seulement en **pièce jointe** de `POST …/mandate/:mandateId/send` (`buildCustomerMandate`)                    | ❌     |
| Déposer le scan signé                         | `PUT /admin/companies/:id/mandate/proof` (PDF ou image, scellé AES-256-GCM, **ne change pas le statut**)      | ❌     |
| Déclarer signé → **active**                   | `PUT …/mandate/:mandateId/signature` (`signedAt` du papier ; révoque l'ancien actif dans la même transaction) | ❌     |
| Révoquer                                      | `DELETE /admin/companies/:id/mandate`                                                                         | ❌     |
| Signature électronique                        | aucune intégration, aucun prestataire dans le dépôt                                                           | ❌     |

Faits porteurs :

- `MintMandateHandler` **n'exige pas le RIB** — c'est l'impression qui refuse
  sans lui ; un brouillon existant fait refuser en **409** en nommant sa RUM.
  Aucun fait n'est écrit au journal.
- `AdminMandatesController` affirme qu'il n'existe **pas** d'endpoint client
  jumeau, « la clientèle ne saisira jamais ses coordonnées bancaires ». Le
  2026-09-14, le RIB client a été ouvert (`plan-rib-client.md`) : cette phrase
  est désormais fausse et devra être corrigée dans le même lot.
- 🔴 **Bloqueur connu** : `todos/todo-mandat-core-contre-b2b.md` — le lot déclare
  `LclInstrm = B2B`, le formulaire imprimé est un **CORE** (remboursement à 8
  semaines). La Caisse d'Épargne n'a pas répondu. Tout mandat signé avant la
  bascule est à refaire.

## 2. Les décisions proposées

| Sujet                      | Proposition                                                                                                                                                                                                                                                                                                                                                   | Pourquoi                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Qui                        | `owner` et `billing` (comme le RIB) ; non-membre 404, autre rôle 403                                                                                                                                                                                                                                                                                          | Le mandat autorise à débiter le compte que ces rôles gèrent                                                                                 |
| Générer                    | `POST /companies/:id/mandate` → même `MintMandateCommand` ; si un brouillon existe : **pas d'erreur**, on rend le brouillon courant                                                                                                                                                                                                                           | Un client qui recharge ne doit pas buter sur un 409                                                                                         |
| **Pas de mandat sans RIB** | 🔴 **Décidé par Hugo le 2026-09-14** : la frappe exige un RIB enregistré, **pour le staff comme pour le client**. La règle entre dans `MintMandateHandler` (erreur métier 409 nommée, message qui dit d'enregistrer le RIB d'abord), pas dans le seul contrôleur client ; le commentaire du handler « n'exige pas le RIB, l'impression refusera » est corrigé | Un mandat nomme le compte qu'il autorise à débiter : sans compte, il n'autorise rien, et une RUM frappée pour rien est une référence perdue |
| Lire                       | `GET /companies/:id/mandate` → vue client : `reference`, `status`, `last4`, `hasProof`, `acceptedAt` — **sans** `publishableKey`, `bankCode`                                                                                                                                                                                                                  | Le client n'a pas d'IBAN Element                                                                                                            |
| Voir / télécharger         | `GET /companies/:id/mandate/document.pdf[?inline=1]` → `buildCustomerMandate` du mandat **courant** (brouillon ou actif), nominatif, **jamais** un autre mandat                                                                                                                                                                                               | L'aperçu EXEMPLE ne sert à rien au client ; le nominatif est ce qu'on lui envoie déjà par courriel                                          |
| Renvoyer signé             | `PUT /companies/:id/mandate/proof` (multipart, mêmes règles de fichier que le staff) → `AttachMandateProofCommand`, **statut inchangé**                                                                                                                                                                                                                       | Le client prouve ; il ne s'active pas lui-même                                                                                              |
| Activer                    | **reste staff** : le commercial lit la pièce, déclare la date du papier (`PUT …/signature`)                                                                                                                                                                                                                                                                   | Activer = autoriser un débit ; une date déclarée par le débiteur seul n'est pas une preuve relue                                            |
| Prévenir le staff          | une notification staff « mandat signé déposé » (cloche du back-office)                                                                                                                                                                                                                                                                                        | Sans elle, la pièce dort                                                                                                                    |
| Signature électronique     | bouton **visible et désactivé**, libellé « Bientôt disponible »                                                                                                                                                                                                                                                                                               | ⚠️ à trancher par Hugo : un bouton sans action est ce qu'on retire ailleurs                                                                 |
| Bloqueur CORE/B2B          | la carte est derrière un **drapeau d'accès** `customerMandate` (`hidden`/`visible`, défaut **`hidden`**) dans `/admin/feature-access`, ouvert quand la banque a répondu                                                                                                                                                                                       | Ne pas faire signer des centaines de mandats à refaire                                                                                      |
| Journal                    | faits `payment_mandate.minted_by_customer`, `payment_mandate.proof_attached` écrits dans la transaction                                                                                                                                                                                                                                                       | `CLAUDE.md` §0 : un geste client sur un mandat doit laisser une trace                                                                       |

## 3. Les lots

**Lot 0 — le formulaire devient INTERENTREPRISES** (tranché par Hugo le
2026-09-14 ; todo `todos/todo-mandat-core-contre-b2b.md`). Préalable à tout le
reste : aucun client ne doit signer le texte CORE.

- **Une seule source du schéma** : une constante du domaine comptable (ex.
  `SEPA_SCHEME = "B2B"`) lue par le rendu du lot (`pain008.ts`, aujourd'hui
  `LclInstrm` en dur) **et** par le formulaire (`sepa-mandate-pdf.ts`). Un test
  qui échoue si les deux divergent.
- **Le formulaire** : titre « Mandat de prélèvement SEPA **interentreprises** » ;
  retrait du paragraphe de remboursement à 8 semaines ; texte d'autorisation du
  modèle EPC B2B (le débiteur autorise le créancier et sa banque ; mandat
  réservé aux transactions entre entreprises ; **pas de remboursement après
  débit**, mais la banque peut être priée de ne pas débiter avant l'échéance) ;
  la consigne de **déclarer le mandat à sa banque** avant le premier débit. Le
  libellé exact est à confronter au modèle que la banque confirmera — le lot le
  dit, il ne l'invente pas.
- **Le courriel d'envoi** (`customer.mandate-to-sign`) : aligné sur le même
  vocabulaire.
- **Les mandats déjà frappés** : un brouillon imprimé en CORE ne doit pas être
  signé tel quel — l'état de la production est à relever avant (la todo ne l'a
  pas vérifié).
- Tests : le PDF rendu contient « interentreprises » et ne contient plus « 8
  semaines » ; le lot et le formulaire lisent la même valeur.

**Lot A — API** : un nouveau contrôleur client dans `b2b/payments/http/`
(bus seulement), queries/commands « My… » qui murent (port de rôle comme
`BankAccountGuardReader`) puis délèguent ; route PDF nominative ; dépôt de la
preuve ; faits au journal ; notification staff ; clé `customerMandate` au
catalogue d'accès (contrat) ; correction du JSDoc « pas d'endpoint client ».
Tests : unitaires du mur (4 rôles + non-membre), handlers (sans RIB 409 — staff ET client,
brouillon existant rendu, preuve sans mandat 404), e2e sur Postgres (le PDF
porte la RUM et pas « EXEMPLE », la société voisine 404, rôles, drapeau fermé).

**Lot B — app cliente** : section `mandate` (carte bureau, carte mobile,
panneau) à côté du RIB, visible si RIB présent + rôle + drapeau ; états
« aucun mandat » (bouton Générer), « brouillon » (voir, télécharger, consigne,
dépôt du scan, bouton e-signature), « preuve déposée — en vérification »,
« actif · RUM ». Tests par état et par rôle.

## 4. Ce que ce plan ne fait pas

- Pas de signature électronique réelle (prestataire à choisir).
- Pas de révocation par le client.
- Pas de bascule CORE → B2B du formulaire : c'est la todo dédiée.

## 5. Tranché par Hugo le 2026-09-14

1. **Signature électronique** : bouton **visible et désactivé** (« Bientôt
   disponible ») tant qu'aucun prestataire n'est branché.
2. **Drapeau `customerMandate`** : **fermé par défaut**, ouvert en admin quand
   la banque a répondu sur le schéma (bloqueur CORE/B2B).
3. **`billing`** génère et dépose, comme pour le RIB.

## 6. Ce que la contradiction a changé (vitruve, 2026-09-14)

Première passe : 4 BLOQUANT, 6 SÉRIEUX. Réponses — (1) et (3) tranchées par
Hugo, le reste décidé en suivant ce que le back fait déjà.

| #      | Objection                                                                                                                           | Réponse                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 🔴   | Le drapeau ne ferme aucune route (`feature-access.levels.ts` : « masquer n'est pas fermer »)                                        | **Une vraie garde serveur** (Hugo) : un marqueur sur les routes client du mandat, refus 409 nommé drapeau fermé, sur le modèle de `@RequiresShop` / `FeatureAccessGuard`. E2e « drapeau fermé → 409 sur POST, GET PDF, PUT preuve ». La clé `customerMandate` n'est donc PAS une clé masquable : elle a ses propres niveaux (`closed` / `open`), défaut `closed`, et `ALL_VISIBLE` des fixtures n'est pas touché |
| 2 🔴   | Le client peut écraser la preuve d'un mandat actif ou révoqué (`findAwaitingProof` retombe sur `findCurrent`, clé de stockage fixe) | Le dépôt client **ne vise que le brouillon** (`findDraft`, 404 sinon) ; l'agrégat refuse `attachProof` hors `draft` pour le chemin client ; la clé de stockage porte l'identifiant du mandat **et** un horodatage : un dépôt ne recouvre jamais le précédent                                                                                                                                                     |
| 3 🔴   | Le PDF nominatif rend l'IBAN entier (`customer-mandate-support.ts:75-88`)                                                           | **Assumé par Hugo** : un mandat EPC porte l'IBAN du débiteur. L'invariant « l'IBAN ne redescend jamais » du RIB client est **amendé et daté** dans `company-bank-account.controller.ts` et `customer-bank-account-view.ts` (la vue JSON reste `last4`), et `todos/todo-rib-client-transmission.md` gagne la ligne « le PDF du mandat rend l'IBAN à qui porte un jeton owner/billing »                            |
| 4 🔴   | « Brouillon ou actif, nominatif » est faux : la RUM ne s'imprime que pour un `draft`                                                | Le client **ne voit et ne télécharge que le brouillon**. Pour un mandat actif, la carte montre la RUM, la date du papier et « pièce déposée » — pas de PDF recomposé                                                                                                                                                                                                                                             |
| 5      | Pas de mécanisme pour « rendre le brouillon », course → 500 (P2002 non traduit)                                                     | Le handler client lit `findDraft` avant de frapper et, sur violation de `payment_mandates_one_draft_per_company`, relit et rend le brouillon. L'adaptateur traduit P2002 en `MandateDraftAlreadyExistsError` (le staff garde son 409)                                                                                                                                                                            |
| 6      | Le client peut frapper le remplaçant d'un actif ; l'activation ne lit pas la preuve                                                 | Frappe client **refusée 409 quand un mandat est actif** (le remplacement reste staff, comme l'écran staff le fait déjà). `SignMandateHandler` **exige une preuve sur CE mandat** avant d'activer — staff compris                                                                                                                                                                                                 |
| 7      | Le mandat ne fige aucun compte ; un RIB remplacé fait diverger papier et débit                                                      | Suivant le back, qui calcule le signal « compte changé » et l'ignore délibérément en attendant la banque : **pas de gel du compte dans ce lot**. Mais côté client, **remplacer le RIB est refusé 409 tant qu'un mandat est `draft` avec preuve ou `active`** — le changement de banque passe par le staff, comme le remplacement de mandat. Le trou staff reste écrit dans la todo mandat                        |
| 8      | La règle « pas de mandat sans RIB » casse l'écran staff et 3 justifications                                                         | L'écran staff masque « Frapper » sans RIB et dit pourquoi ; les trois commentaires (`mint-mandate.handler.ts:40-45`, `payment-mandate.ts:106-108`, `paiement-section.html:94-96`) sont corrigés ; le spec du handler est refait ; ordre des gardes : société → **RIB** → émetteur → brouillon ; les brouillons déjà frappés sans RIB restent (la règle ne vise que la frappe)                                    |
| 9      | Journal promis sans mécanisme ; l'activation n'en écrit pas                                                                         | Faits `payment_mandate.minted`, `payment_mandate.proof_attached`, `payment_mandate.signed` pour staff ET client, suivant `account-facts.ts` : acte du staff dans la transaction, fait du client best-effort ; dépôt de preuve `@hors-transaction` comme le KBIS                                                                                                                                                  |
| 10     | Deux justifications périmées (aperçu « toujours EXEMPLE »)                                                                          | Corrigées : `admin-company-bank-account.controller.ts:123-131`, `comptabilite/prelevement-sepa.md:39` ; passage d'`auditeur-de-justifications` en fin de lot                                                                                                                                                                                                                                                     |
| MINEUR | Cloche, états oubliés, nommage                                                                                                      | Notification staff avec clé d'anti-doublon par mandat et échec non bloquant ; la carte gère `pending`, `failed`, `revoked`, `expired` (« aucun mandat en cours ») ; noms sans suffixe client                                                                                                                                                                                                                     |
