# Plan — la page « Mes factures » de la boutique

> **Doc-first, 2026-10-21.** Rien n'est bâti. Demandé par Hugo le 2026-10-21 :
> « avoir vraiment la page factures » à la place de la carte de
> `/mon-compte#compte-invoices`. Touche à l'argent (statut de règlement, total
> dû) : contredit par `vitruve` avant d'être soumis.

## 0. Ce qui existe (ouvert le 2026-10-21)

- **La carte** `apps/lfc-ecommerce-frontend/src/app/client/mon-compte/invoices/`
  (cartes bureau et mobile, panneau, dialogue d'une pièce) ; `/mes-factures`
  redirige vers `/mon-compte#compte-invoices` (`app.routes.ts`).
- **La route** `GET /companies/:companyId/invoices`
  (`b2b/accounting/http/company-invoices.controller.ts`) →
  `ListMyCompanyInvoicesQuery` ; mur des rôles `owner|billing`
  (`domain/services/invoice-access.ts`), mur de données dans
  `PrismaCompanyInvoicesReader.visibleTo` (payeur OU pièce couvrant un bon de la
  société). **Sans pagination, sans filtre**, triée `year asc, rank asc` — le
  contrat dit « les plus récentes d'abord » (`packages/contracts/src/issued-invoices.ts`) :
  l'un des deux ment, à corriger dans le lot P1.
- **Le PDF** `GET /companies/:companyId/invoices/:invoiceId/pdf` (Factur-X
  PDF/A-3 rangé une fois, `invoice.document_key`).
- **Aucun statut de règlement par facture.** Le contrat le dit (« Aucun statut
  de paiement ») et `facture-emise.md` aussi. Ce qui existe :
  - carte : `invoice.paid_on` + `prepaid_cents`, posés à l'émission ;
  - prélèvement : `collection_batch_line_invoice` (lot, rang de ligne,
    facture) est le SEUL lien facture → lot ; `collection_batch.status`
    (`constituted|deposited|cancelled`, `deposited_at`) ;
    `collection_return` par ligne (`returned_on`, `resolution` :
    `pending|represented|settled_otherwise|written_off`) ;
  - par COMMANDE : `order_collection.state` (dont `settled_otherwise`,
    `written_off`) — sans lien vers la facture.
- **Un avoir ne s'impute sur rien** : `invoice.corrects_invoice_id` sans montant
  ni solde. Pas de lettrage.
- **Aucun zip** dans le dépôt, ni bibliothèque.

## 1. Ce qu'on bâtit

Une page `/mes-factures` du shell client (pas de `fold-page-layout` : bandeau
du shell, comme `/mes-commandes`), entrée du menu du compte. La carte quitte
`/mon-compte` ; la redirection `/mes-factures` disparaît.

- **En tête : le total dû** — somme TTC des factures « prélèvement prévu » et
  « rejeté » (Hugo, Q2). Les avoirs ne s'y soustraient pas et sont listés à
  part avec leur montant. Une ligne dit, s'il y a lieu, combien sont rejetées.
- **Filtres** : année, mois, Factures / Avoirs / Tout.
- **La liste**, plus récentes d'abord : numéro, type, période, émission,
  montant TTC, **statut**, ouvrir, télécharger.
- **Télécharger plusieurs** : la sélection, ou « tout ce qui est filtré », en
  un zip.

## 2. Le statut d'une facture (règles)

Le client ne règle jamais à la main : carte en ligne, ou prélèvement. Un statut
DÉRIVÉ, calculé à la lecture — aucune colonne neuve, aucune écriture.

| Statut client                          | Règle                                                      | Date affichée      |
| -------------------------------------- | ---------------------------------------------------------- | ------------------ |
| **Acquittée par carte**                | `paid_on` non nul                                          | `paid_on`          |
| **Prélèvement prévu**                  | facture au compte sans ligne dans un lot `deposited`       | `due_on`           |
| **Prélevée**                           | sa dernière ligne est dans un lot `deposited`, sans retour | à trancher, §5 Q-A |
| **Prélèvement rejeté — à régulariser** | sa dernière ligne a un retour `pending`                    | `returned_on`      |
| — (avoir)                              | `kind = credit_note`                                       | pas de statut      |

« En retard » = **rejet**, et rien d'autre (Hugo, Q1) : une échéance dépassée
sans lot est NOTRE retard, pas celui du client.

« Dernière ligne » : une facture peut repasser dans un lot après un retour
(`represented`) ; c'est la plus récente qui dit l'état.

## 3. Les lots

| Lot    | Contenu                                                                                                                                                                                                                                                                                               | Agent     |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **P1** | Serveur : le statut dérivé dans `IssuedInvoiceSummaryView` (contrat), lu en UNE requête par lot de factures (pas une par facture) ; tri plus récent d'abord ; filtres `year`, `month`, `kind` en query ; total dû calculé côté serveur sur le périmètre filtré ; tests aux trois niveaux, dont le mur | batisseur |
| **P2** | Serveur : `GET …/invoices.zip` (mêmes filtres, ou une liste d'ids), PDF rangés seulement (`documentAvailable`), noms `FA-AAAA-NNNNNN.pdf`, plafond de pièces ; bibliothèque zip à choisir (consommateur unique : hors catalogue)                                                                      | batisseur |
| **P3** | Front : la page, son entrée de menu, le retrait de la carte et de la redirection ; textes dans les dictionnaires (+ `pnpm copy:digest`)                                                                                                                                                               | pablo     |

## 4. Hors périmètre

- Le lettrage des avoirs (un avoir qui réduit un prélèvement).
- Payer une facture en ligne depuis la page.
- Le back-office (il a ses propres écrans de lots et de retours).

## 5. Questions ouvertes

- ~~**Q-A**~~ tranchée par le code (§7). **Q-A — « Prélevée le … »** : `collection_batch` ne porte que
  `deposited_at` (remise à la banque), pas la date d'échéance du prélèvement
  demandée. Afficher « Prélèvement transmis le [deposited_at] », ou lire une
  date d'échéance ailleurs (ligne, fichier XML) ?
- **Q-B — Réglée autrement** : un retour résolu `settled_otherwise` ou
  `written_off`, et une commande `settled_otherwise` sans retour (virement ?) :
  quel statut client ? Le lien commande → facture n'existe pas pour
  `order_collection`.
- **Q-C — Factures multi-payeurs** : une pièce visible parce qu'elle couvre un
  bon de la société sans qu'elle en soit le payeur (`visibleTo`) entre-t-elle
  dans SON total dû ?

## 6. Décisions (Hugo, 2026-10-21)

- **Q1** — « En retard » = rejet bancaire, seul état en défaut.
- **Q2** — Total dû = factures non prélevées (prévu + rejeté), avoirs non
  soustraits, listés à part.
- **Q3** — La carte de `/mon-compte` est retirée ; la page a son entrée de menu.
- **Q4** — Statut, filtres, total dû et téléchargement groupé.

## 7. Révision après `vitruve` (2026-10-21) — l'emporte

**Ce qui était faux dans le §0** : `collection_batch` porte aussi
`requested_collection_day` et `postponed_from_day`, et `collection_notice`
porte la date annoncée au client (`collection_day`). Q-A est donc tranchée par
le code : « Prélevée le [requested_collection_day] », repli sur la date du
préavis pour un lot ancien. `deposited_at` n'est pas une date du client.

**7.1 La table de statut, totale et ordonnée** (la première règle qui
s'applique gagne) :

1. avoir → pas de statut ;
2. `paid_on` → **Acquittée par carte** ;
3. dernière ligne de la facture dans un lot NON annulé (ordre :
   `collection_batch.constituted_at`, lots `cancelled` exclus — un lot annulé
   relâche ses factures) :
   - lot `constituted` → **Prélèvement prévu le [requested_collection_day]** ;
   - lot `deposited`, sans retour → **Prélevée le [requested_collection_day]** ;
   - retour `pending` → **Prélèvement rejeté — à régulariser** ;
   - retour `represented` (la reprise n'a pas encore de lot) →
     **Nouveau prélèvement prévu** ;
   - retour `settled_otherwise` → **Réglée** ;
   - retour `written_off` → **Clôturée**, hors du total dû (Hugo, Q-D, 2026-10-21 : passer en perte, c'est renoncer) ;
4. aucune ligne → **Prélèvement prévu le [due_on]**, sauf facture BLOQUÉE —
   un de ses bons n'est plus ouvert (réglé autrement, annulé…), ou elle a été
   écartée d'un lot (`no_mandate`, `invoice_split`) → **En cours de
   traitement** (« notre équipe s'en occupe »), HORS du total dû (Hugo, Q-E,
   2026-10-21). La cause, elle, est un chantier comptable à part : régler une
   FACTURE plutôt qu'un bon déjà facturé — inscrit en TODO, hors de ce plan.

Pas de prélèvement partiel (`collection-assembly.ts`, `facture-emise.md`) :
une facture est encaissée entière ou pas. Un rejet porte sur toute la LIGNE,
donc sur toutes les factures qu'elle regroupe : l'écran le dit (« rejeté avec
2 autres factures du même prélèvement »).

**7.2 Les pièces d'un autre payeur (Q-C, Hugo 2026-10-21 : « oui, tout »)** :
une société voit aussi les pièces d'un AUTRE payeur qui couvrent ses bons
(`visibleTo`) — en pratique, un site et les factures de son principal. Elles
portent leur statut, rejet compris, et entrent dans le total dû de la société
qui les voit. **Écart assumé** avec `get-my-detached-unpaid-orders`
(« jamais les impayés d'un autre ») : la règle de Hugo est qu'un site voit ce
qui le concerne. Le mur des rôles (`owner|billing`) reste la frontière : un
contact sans ce rôle ne voit aucune facture.

**7.3 Le total dû** ne suit PAS les filtres : c'est l'état du compte, pas
celui de la liste filtrée.

**7.4 Le contrat** : `IssuedInvoiceSummaryView` est lue par le back-office
(quatre écrans et l'agent). Le statut entre dans une vue CLIENT distincte
(`MyIssuedInvoiceView` = résumé + `settlement`), pas dans le résumé partagé.

**7.5 Le zip (P2)** : tout lire et vérifier (empreinte) AVANT d'envoyer les
en-têtes, rangé en STORE (un PDF/A ne se compresse pas), plafond de 200
pièces (refus nommé au-delà) ; une pièce non rendue ou un id non visible fait
REFUSER le zip en les nommant, jamais un zip incomplet en 200. Le mur : une
seule lecture `visibleTo` filtrée par les ids.

## 8. Ce qui est bâti

### P1 — le serveur (2026-10-21, non commité à l'écriture)

- **Le contrat** `packages/contracts/src/my-issued-invoices.ts` :
  `MyIssuedInvoiceView` = `IssuedInvoiceSummaryView` + `settlement`
  (`status`, `date`, `otherInvoicesOnDebit`), `MyAmountDueView`,
  `MyIssuedInvoicesView`, et `myInvoicesQuerySchema` (`year`, `month`,
  `kind` ; un mois sans année est refusé). `IssuedInvoiceSummaryView` n'a
  pas bougé : le back-office lit toujours `IssuedInvoicesView`.
- **Le statut**, pur : `apps/lfd-api/src/b2b/accounting/domain/services/invoice-settlement.ts`,
  la table du §7.1 dans son ordre. À instant de constitution égal, le lot
  d'id le plus grand (ULID) l'emporte.
- **« Bloquée »**, lue ainsi : la facture n'a AUCUNE ligne dans un lot non
  annulé, et au moins un de ses bons (`invoice_order`) a une ligne
  `order_collection` dans un autre état que `due` — `excluded` (quelle que
  soit la raison, pas seulement `no_mandate` / `invoice_split`),
  `settled_otherwise`, `cancelled`, ou un état de lot sans ligne de facture.
  L'absence de ligne `order_collection` vaut `due`.
- **Le total dû et les filtres**, purs : `apps/lfd-api/src/b2b/accounting/domain/services/my-invoices-ledger.ts`.
  Le total compte `collection_planned`, `collection_rejected` **et
  `recollection_planned`** (voir écarts) ; il est calculé sur toutes les
  pièces visibles, AVANT le filtre. Le filtre porte sur l'année et le mois
  d'**émission**. L'ordre : numéro décroissant.
- **La lecture** : port `apps/lfd-api/src/b2b/accounting/domain/ports/invoice-settlement-facts.reader.ts`,
  adaptateur `apps/lfd-api/src/b2b/accounting/infrastructure/prisma-invoice-settlement-facts.reader.ts` —
  deux requêtes pour toutes les pièces (lignes + lot + avis + retour + nombre
  de factures de la ligne ; bons sortis de `due`). Lots annulés lus, écartés
  par le domaine.
- **La route** `GET /companies/:companyId/invoices?year&month&kind` rend
  `MyIssuedInvoicesView` ; le mur des rôles (`owner|billing`) n'a pas bougé.
- **L'ordre** : `PrismaCompanyInvoicesReader.visibleTo` lit `year desc, rank desc`.
- **Tests** : domaine (`apps/lfd-api/src/b2b/accounting/domain/services/__tests__/invoice-settlement.spec.ts`,
  `apps/lfd-api/src/b2b/accounting/domain/services/__tests__/my-invoices-ledger.spec.ts`),
  application (`issued-invoice.handlers.spec.ts`, un double
  `FixedSettlementFacts`), e2e `apps/lfd-api/test/my-invoices.e2e-spec.ts` (émise → en lot
  → déposée → rejetée, bon réglé autrement, filtres, 403 / 404), contrat
  (`packages/contracts/src/__tests__/my-issued-invoices.spec.ts`).

**Écarts avec le plan**

- Le §0 disait que l'`ORDER BY asc` contredisait le contrat : faux, la vue le
  retournait (`invoicesViewOf` faisait `reverse()`). La liste était déjà
  « plus récentes d'abord ». L'ordre est désormais dit par la lecture ET par
  le domaine.
- `recollection_planned` (re-présentée, sans lot encore) entre dans le total
  dû : le §7.1 ne le tranchait pas ; c'est un prélèvement prévu au sens de Q2.
  **À confirmer par Hugo.**
- « Bloquée » s'étend à toute raison d'exclusion (le §7.1 en citait deux).
  **À confirmer par Hugo.**
- `settled` et `closed` n'ont pas de date ; `collection_planned` /
  `collected` d'un lot sans échéance figée ni avis rendent `date: null`.
