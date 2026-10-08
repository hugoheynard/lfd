# L'émission de la facture

> 📐 **Plan v2 ; E0 et E1 bâtis le 2026-10-08** (§ 8.1, § 8.2). Touche **l'argent** et un
> document légal : la v1 a été contredite par `vitruve` le même jour (trois
> BLOQUANTS, huit SÉRIEUX), repris au § 9. Les règles du CGI et du Code de
> commerce sont citées **de mémoire**, ni par l'agent ni par moi rouvertes en
> ligne : le cabinet tranche. Reprend
> [`../b2b/architecture-facturation.md`](../b2b/architecture-facturation.md)
> (2026-08-15) là où le code l'a dépassé.

## 1. Le besoin et les décisions d'Hugo

- **2026-10-08** : c'est nous qui émettons, tant qu'un logiciel comptable ne
  le fait pas, et c'est nous qui ferons toujours le fichier de prélèvement.
- **2026-10-08** : profil Factur-X **EN 16931** (version complète).
- **2026-10-08** : F5 (bons en HT pour les pros au compte) attend la facture
  réellement émise.
- **2026-08-15** : une facture pour **toute vente pro** ; la donnée
  structurée fait foi ; numérotation continue et chronologique ; une facture
  émise ne se supprime pas, elle se compense par un **avoir** (381).
- **2026-09-21** : le **public** ne reçoit pas de facture (bon chiffré).

## 2. Ce qui existe (vérifié le 2026-10-08)

- **L'arrêté figé** (`billing_statement`, F3) : par **ligne de débit** (par
  mandat, donc parfois par site), préparé **après** la clôture, sur les bons
  **passés** dans le mois (`billable-order-criterion.ts:49`, `createdAt`). Ses
  dates sont les dates **demandées**, parfois nulles. Il peut être annulé tant
  que le lot n'est pas déposé.
- **L'entité émettrice** porte le bloc vendeur (raison sociale, forme, SIREN,
  TVA, RCS, capital, adresse), pas les mentions de retard.
- **L'acheteur** : `companies.siren` et `tva_intracom` valent `""` par défaut.
- **Les dates de livraison réelles** existent par les faits de retrait et de
  tournée (DF3).
- **Aucune bibliothèque PDF** dans le dépôt.
- **Les remboursements par carte** ne sont pas suivis.

## 3. La décision structurante : la facture avant le lot

La facture récapitulative d'un mois porte sur les **livraisons** du mois et
s'établit **au plus tard à la fin de ce mois** ; sa numérotation est
**chronologique** (CGI art. 289-I-3 et 242 nonies A, de mémoire). Notre
lot, lui, se prépare le 1er, sur les bons **passés**. Les deux ne tiennent pas
ensemble : une facture datée du mois écoulé et numérotée le 1er passerait
après une facture carte du 1er à 00h30 ; une facture qui recopie l'arrêté
facturerait un bon livré le mois suivant.

**Proposé** — la facture devient la pièce, le lot ne fait que l'encaisser :

```mermaid
flowchart LR
  M["Le mois court"] --> F["Dernier jour du mois · 22h<br/>une facture par payeur légal<br/>sur les bons LIVRÉS du mois"]
  F -->|"n° FA-…, figée"| L["Le 1er · lot préparé<br/>une ligne = des factures émises"]
  L --> A["Avis de prélèvement<br/>montant = factures"]
  A --> P["Prélèvement à l'échéance"]
  P -->|rejet| R["la créance reste due<br/>(suivi d'encaissement, pas d'avoir)"]
```

- La facture remplace l'arrêté comme source du montant : une ligne de lot
  encaisse une ou plusieurs factures émises ; l'arrêté ne naît plus.
- Annuler un lot n'annule aucune facture : elle reste due, le lot suivant la
  reprend.
- Une correction après émission (bon faux, geste commercial) se fait par
  **avoir**, jamais en défaisant la facture.
- Le périmètre passe à la **date de livraison réelle** (Q2) ; un bon non
  livré dans le mois attend le mois suivant.

## 4. Les deux régimes

| Régime            | Émise quand ?                                         | Sur quoi                |
| ----------------- | ----------------------------------------------------- | ----------------------- |
| **Pro au compte** | dernier jour du mois, 22h (heure de Paris)            | les bons livrés du mois |
| **Pro par carte** | **à la livraison** (fait de retrait), pas au paiement | la commande seule       |
| **Public**        | jamais                                                | —                       |

Un paiement par carte avant livraison est un acompte, pas une vente : la
facture suit la livraison. **E5 attend le suivi des remboursements** (plan à
part) : une commande payée, livrée puis remboursée doit produire son avoir.

## 5. Le modèle

`Invoice`, agrégat de `b2b/accounting/domain/` :

```
id, number                 ← FA-<année>-<n°>, attribué à l'émission
legal_entity_id            ← une séquence PAR ENTITÉ ET PAR ANNÉE (§9)
type                       ← 380 facture | 381 avoir (+ invoice_id corrigée)
issued_on, due_on          ← due_on = date du prélèvement / à réception
seller, buyer              ← figés ; buyer = le PAYEUR LÉGAL (Q3)
lines                      ← par produit et par prix (D2), HT repris des bons (F6),
                             + références des bons (BT-13) et dates de livraison RÉELLES
delivery_address           ← si elle diffère de l'adresse de facturation
vat_breakdown, totals
mentions                   ← pénalités (Q4), indemnité 40 €, escompte « néant »,
                             catégorie « livraison de biens », pas d'option débits
document_key, sha256       ← posés UNE fois, après le rendu
```

- **Le statut de paiement n'est pas sur la facture.** Elle est une pièce
  immuable ; « prélevée », « rejetée », « réglée par carte » vivent dans le
  suivi d'encaissement (`collection_*`, `order_collection`).
- **Refus d'émettre**, nommés, sans valeur inventée : acheteur sans SIREN ;
  acheteur assujetti sans TVA ; mentions de retard absentes ; vendeur
  incomplet.
- **Immuabilité** : port `insert` + `attachDocument` (une seule fois) ;
  déclencheur en base qui refuse tout le reste, et `document_key` de NULL à
  une valeur, une seule fois.
- **Numérotation** : un compteur par (entité, année), `FOR UPDATE`, dans la
  transaction de l'émission ; un rollback rend le numéro avec la
  transaction, aucun trou. La facture du mois se fait **payeur par payeur**,
  une transaction courte chacune, pour ne pas bloquer les factures carte.

## 6. Le rendu Factur-X

- **Après** la transaction d'émission, par un fait durable : XML CII EN 16931,
  PDF/A-3 avec le XML embarqué, dépôt en stockage objet, puis
  `attachDocument`. Une facture émise sans rendu est un état visible et
  rejouable.
- **Validation** dans les tests : Schematron CEN EN 16931 (CII) pour le XML,
  **veraPDF** pour le PDF/A-3. Télécharger ces outils et les figer dans le
  dépôt demande l'accord d'Hugo.
- **Le point dur est le PDF/A-3.** E3 commence par un essai borné : si en
  deux jours aucune bibliothèque Node ne passe veraPDF, on prend un service
  de conversion derrière un port, ou un rendu hors Node.
- **Conservation 10 ans** : seau dédié en écriture unique (verrou d'objet ou
  règle de rétention), clé qui n'est jamais réécrite ; l'empreinte prouve,
  le verrou empêche.

## 7 bis. Réponses d'Hugo (2026-10-08)

- **Q1 — oui** : la facture au dernier jour du mois, le lot ne fait
  qu'encaisser des factures émises.
- **Q2 — non, le mois de la COMMANDE** : « une commande faite le 30 ou le 31
  et livrée le 1er est facturée sur le mois passé ». Le périmètre reste
  `createdAt` (celui du relevé et du lot). Conséquence assumée : la facture
  du 31 au soir porte des bons pas encore livrés ; **à confirmer par le
  cabinet** (fait générateur à la livraison, facture établie avant). Un bon
  jamais retiré reste facturé, et signalé (§ 3.3 du simulateur).
- **Q3 — le principal, et prévenir** : l'acheteur légal est la maison mère ;
  l'émission prévient les rôles facturation de la maison mère **et** des
  sous-comptes dont les bons figurent sur la facture.
- **Q4 — une suggestion à l'écran** : le réglage des pénalités propose le
  taux légal par défaut (BCE + 10 points) comme suggestion, modifiable par
  l'admin ; rien n'est posé d'office.
- **Q5 — pièce et kilo** : « une boîte de 6 est une pièce ». Le catalogue
  vend à l'unité (déclinaisons et conditionnements, `weightGrams` est le
  poids NET d'une unité) et `order_lines.quantity` est un entier : une
  pièce (`H87`) partout tant qu'aucun produit ne se vend **au poids
  variable**. Un produit pesé à la vente demanderait une unité portée par
  la déclinaison et une quantité décimale — un chantier du catalogue, pas
  de la facture. **Hugo : il y en aura, « mais pas tout de suite ».** La
  facture porte donc dès E1 un code d'unité PAR LIGNE (`H87` aujourd'hui) et
  une quantité qui admettra des décimales, pour qu'une ligne `KGM` n'impose
  pas de changer la forme d'une pièce déjà émise ; la vente au poids reste
  un chantier à part.

## 7. Questions à Hugo (et au cabinet)

- **Q1** — La bascule du § 3 : la facture au dernier jour du mois, le lot
  ne fait qu'encaisser. _Proposé : oui._ C'est ce qui change le plus de
  choses déjà bâties (l'arrêté, F2/F3, l'aperçu, PA2).
- **Q2** — Le mois d'une commande devient celui de sa **livraison réelle**
  (retrait ou dépôt). Un bon jamais retiré ne se facture pas. _Proposé : oui._
- **Q3** — L'acheteur légal d'un site qui suit la facturation de son
  principal : le principal (proposé), même si le site a son propre mandat.
- **Q4** — Les pénalités de retard : le taux légal par défaut est le taux
  BCE + 10 points (L441-10, de mémoire), sauf taux convenu (plancher :
  3 × le taux d'intérêt légal).
- **Q5** — L'unité des lignes : toutes à la pièce (`H87`) ?
- **Au cabinet** : la date d'établissement d'une facture récapitulative, et
  les nouvelles mentions de la réforme (SIREN acheteur, adresse de
  livraison, catégorie d'opération, option débits).

## 8. Les lots

| Lot    | Contenu                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------- |
| **E0** | ✅ **bâti le 2026-10-08** (non commité à l'écriture) — cf. § 8.1                                  |
| **E1** | ✅ **bâti le 2026-10-08** (non commité à l'écriture) — cf. § 8.2                                  |
| **E2** | tables, numérotation, immuabilité en base                                                         |
| **E3** | essai PDF/A-3 borné, puis le rendu Factur-X validé (Schematron, veraPDF), seau en écriture unique |
| **E4** | la facture du mois (dernier jour, 22h) sur les livraisons ; le lot encaisse des factures          |
| **E5** | la facture carte à la livraison — après le suivi des remboursements                               |
| **E6** | e-mail, « Mes factures », l'onglet facturation de la fiche ; puis F5                              |

### 8.1 E0 — ce qui a été bâti et tranché (2026-10-08)

- **Mentions de paiement sur l'entité** (`InvoicePaymentTerms`, colonnes
  `invoice_late_penalty_rate_bp`, `invoice_recovery_indemnity_cents`,
  `invoice_early_payment_discount`, migration
  `20261008180000_les_mentions_de_paiement_de_la_facture`) : toutes
  **nullables** = « à renseigner ». Taux en **points de base** (1 % = 100,
  1 à 10 000) : le taux BCE se publie au centième, un entier le porte sans
  flottant. Indemnité en centimes, **4 000 à 100 000** : le plancher de 40 €
  est le montant du texte (de mémoire) et attrape un « 40 » tapé en
  centimes. Escompte en clair, 1 à 200 caractères ; un texte blanc redevient
  `null`. Route `PUT /admin/accounting/legal-entities/:id/invoice-payment-terms`
  (`b2b_accounting`), fait `legal_entity.invoice_payment_terms_changed` (l'après).
- **Q4 à l'écran** : la carte « Mentions de la facture » fait saisir le taux
  BCE (non enregistré) et propose BCE + 10 points sous un badge
  « suggestion », repris sur un bouton. Aucun taux BCE dans le code.
- **Refus d'émettre nommés** : `invoiceIssuanceBlockers(seller, buyer)`
  (`apps/lfd-api/src/b2b/accounting/domain/services/invoice-issuance-blockers.ts`) rend les manques —
  entité absente ou archivée, vendeur incomplet (RCS ; TVA si la forme est
  assujettie), mentions absentes, acheteur absent, sans SIREN, assujetti sans
  TVA (règle de `vatNumberRequired`, redite sans importer `account`). La
  porte d'activation n'a **pas** changé : un compte actif sans SIREN reste
  actif, et le dossier le signale.
- **L'entité du dossier** : le plan ne la nommait pas. Tranché comme le
  mandat (`soleIssuer`) : la seule entité en service ; plusieurs →
  manque `several_issuers` plutôt qu'un choix. À revoir en E4 si une seconde
  entité encaisse.
- **Unité** : `InvoiceUnit` (`H87` pièce, `KGM` kilogramme) ; chaque ligne
  agrégée porte `unitCode: "H87"`. Les arrêtés figés (corps v1) ne
  l'écrivent pas et se relisent en `H87`. La quantité décimale reste à E1.
- **Visible** : le dossier de facturation affiche les manques en tête des
  signalements ; la fiche de l'entité, ceux du vendeur (`missingToInvoice`).

### 8.2 E1 — ce qui a été bâti et tranché (2026-10-08)

Domaine pur, sans table ni route : `apps/lfd-api/src/b2b/accounting/domain/`
`entities/invoice.ts` (+ `invoice.types.ts`, `invoice-invariants.ts`,
`invoice-parties.ts`), `value-objects/invoice-number.ts`,
`value-objects/invoice-quantity.ts`, `errors/invoice-errors.ts`,
`services/invoice-from-dossier.ts`.

- **Numéro** : `InvoiceNumber`, `FA-<année>-<6 chiffres>`, rang 1 à 999 999,
  avoirs dans la **même** séquence (architecture § 4.2). L'année du numéro
  doit être celle de `issued_on`. L'attribuer reste à E2.
- **Parties** : vendeur et acheteur figés reprennent `StatementSeller` /
  `StatementBuyer` de l'arrêté. `Invoice.issue` juge par
  `invoiceIssuanceBlockers` **avant** tout le reste et refuse
  (`InvoiceIssuanceBlockedError`, 409) en citant tous les manques ; les
  mentions sont copiées de l'entité, catégorie `goods`, `vatOnDebits: false`.
- **Quantité** : `InvoiceQuantity` en **millièmes entiers** (1,250 kg = 1250),
  pas de flottant ; une pièce `H87` reste entière, `KGM` admet trois
  décimales.
- **Dates de livraison** : par **bon** (`orders[].deliveredOn`, BT-13), `null`
  quand inconnue. Les dates demandées du dossier ne passent pas.
- **Remises et frais** : pas de ligne à part ; ils vivent dans la ventilation
  (`invoiceVatBreakdown`, parts par taux), reprise telle quelle.
- **Invariants** (`InvoiceTotalsMismatchError`, 500) : marchandise par taux =
  Σ lignes, base = marchandise − remises + frais, Σ bases = HT, Σ TVA = TVA,
  TTC = HT + TVA ; échéance ≥ émission.
- **Avoir** : `Invoice.creditNote` reprend parties et mentions de la facture
  corrigée, sans échéance ; refuse de corriger un avoir, une date antérieure,
  un bon absent de la facture ; plafond **par taux** (base et TVA) =
  facture − avoirs déjà émis, que l'appelant passe (`priorCreditNotes`) ; un
  avoir à zéro est refusé.
- **Immuabilité** : aucune méthode de mutation sauf `attachDocument`, une
  fois (une seconde pose, même identique, est refusée). `Invoice.restore`
  revalide forme et totaux sans rejuger les parties.
- **Pas de statut de paiement**.

## 9. Ce que `vitruve` a relevé (v1, 2026-10-08)

- **BLOQUANTS, corrigés** : Q1 (b) antidatait et cassait l'ordre
  chronologique → la facture au dernier jour du mois (§ 3) ; le périmètre
  « passés » facturait avant la livraison → livraison réelle (Q2) ; un rejet
  bancaire n'appelle pas d'avoir et un dépôt n'est pas un encaissement → le
  paiement quitte la facture (§ 5).
- **SÉRIEUX, corrigés** : ligne de débit contre payeur (Q3) ; mentions
  manquantes — échéance, livraison réelle, SIREN acheteur, adresse de
  livraison, catégorie, débits, BT-13 (§ 5) ; transaction de l'émission et
  rendu après coup (§ 5, § 6) ; arrêté annulé sous une facture émise → la
  facture précède le lot (§ 3) ; facture carte au paiement → à la livraison,
  après les remboursements (§ 4) ; « une seule séquence » révisée en « par
  entité » : une seule entité encaisse aujourd'hui, la décision de 2026-08-15
  n'est pas contredite tant qu'il n'y en a qu'une, mais elle est dite (§ 5) ;
  PDF/A-3 sans bibliothèque ni critère d'abandon → essai borné, veraPDF
  (§ 6) ; conservation sans mécanisme → seau en écriture unique (§ 6).
- **MINEURS, repris** : taux légal des pénalités (Q4) ; dates nulles de
  l'arrêté (§ 2) ; les questions avant E0 (§ 8).
