# Plan — l'échéance d'une facture réglée par virement devient un réglage

> Statut : **doc-first, rien n'est implémenté.** Décidé par Hugo le 2026-11-13
> (« l'échéance de virement devrait être un réglage »). À contredire par
> `vitruve` (argent) avant tout code. Doc d'état concernée :
> [`le-paiement-par-virement.md`](le-paiement-par-virement.md), § 4, repère V6.

## Partie 1 — En clair

Aujourd'hui, une facture réglée par virement reprend l'échéance du
prélèvement : un nombre de jours après la clôture de la période, qui vient de
la pré-notification SEPA. Ce délai n'a rien à voir avec un virement.

Demain :

- un **réglage par entité juridique**, à côté des réglages du prélèvement :
  « Échéance des factures au virement : N jours après l'émission », **15 jours**
  par défaut ;
- **au plus 45 jours après l'émission**. L'article L441-10 du code de commerce
  admet 60 jours après l'émission ou 45 jours fin de mois ; 45 jours nets
  respectent les deux quelle que soit la date d'émission. C'est un plafond de
  prudence, pas le maximum légal ;
- l'échéance est **figée sur la facture à l'émission**, comme le moyen
  d'encaissement : changer le réglage ne touche aucune facture émise ;
- **pas de report au premier jour ouvré** : c'est le client qui agit, « avant
  le X » reste valable un dimanche, et un report pourrait dépasser le plafond ;
- le PDF, Factur-X (date d'échéance BT-9), « virement en retard » et le bloc
  « Échéance » de la fiche client lisent cette date ;
- le prélèvement ne change pas.

## Partie 2 — Technique, vérifiée dans le code

### Ce qui existe

- **L'échéance figée existe déjà** : `Invoice.dueOn` (`due_on`, `@db.Date`,
  nullable), `apps/lfd-api/prisma/schema/public/invoice.prisma`, lue et écrite
  par `accounting/infrastructure/invoice.mapper.ts`, contrôlée par `assertDates`
  (`domain/entities/invoice-shape.ts`, refuse une échéance avant l'émission).
  **Aucune migration côté facture.**
- **Tous les lecteurs lisent déjà `dueOn`** : PDF (`invoice-pdf-header.ts`,
  `invoice-pdf-summary.ts`), Factur-X (`facturx-settlement.ts` BT-9,
  `facturx-mentions.ts`), retard (`invoice-settlement.ts` `transfer_overdue`,
  `transfer-arrears.ts`, `prisma-unpaid-transfer-invoices.reader.ts`), vue
  (`issued-invoice-view-support.ts`). Changer le calcul à l'émission suffit.
- **Le calcul actuel** : `issue-monthly-invoices.handler.ts`, `prepare()` —
  `invoiceDueDay(closesAt, …, { preNotificationDays, collectionDaysAfterClosure })`
  calculé une fois par passage (`Issuance.dueOn`,
  `application/monthly-invoice-issuance.ts`), puis `draftOf()` le copie sur
  chaque facture quel que soit le moyen. `invoiceDueDay`
  (`domain/services/invoice-due-day.ts`) reporte au jour ouvré.
- **Le moyen par payeur** : `invoicePaymentMeansOf(payer)`
  (`domain/services/monthly-invoicing.ts`), `bank_transfer` — le point de
  bascule.
- **Les réglages de l'entité** : `model LegalEntity` (`accounting.prisma`) —
  `preNotificationDays`, `collectionDaysAfterClosure`,
  `depositCutoffBusinessDays`, mentions de paiement ; setters dans
  `domain/entities/legal-entity.ts`. Aucune colonne existante ne dit « jours
  après l'émission ».
- **Le plafond de 45 jours n'est pas dans le code** : seuls
  `COLLECTION_DAYS_MAX = 60` (après clôture) et `PRE_NOTIFICATION_MAX_DAYS = 60`
  existent. La phrase de la doc d'état (« le réglage du calendrier refuse une
  échéance à plus de 45 jours ») est à corriger au lot 4.
- **Le front** : `fiche-client/bank-transfer-means/` calcule
  `collectionDaysAfterClosure ?? preNotificationDays` et affiche « La même que
  pour un prélèvement… ». Les réglages de l'entité vivent dans
  `comptabilite/entites-juridiques/detail/`.

### Lots

1. **Domaine et base** : migration additive
   `transfer_due_days_after_issue INT NOT NULL DEFAULT 15` sur `legal_entity` ;
   constantes `TRANSFER_DUE_DAYS_MIN = 1`, `TRANSFER_DUE_DAYS_MAX = 45`
   (commentées, L441-10) ; `LegalEntity.setTransferDueDays(days)` sur le modèle
   de `setPreNotificationDays`, erreur de domaine hors bornes, fait au journal ;
   mapper et instantané du créancier.
2. **Émission** : fonction pure `transferDueDay(issuedOn, days)` sans report ;
   `Issuance` porte `collectionDueOn` (le calcul actuel) et `transferDueDays` ;
   `draftOf` choisit selon le moyen du payeur. Avoirs (`dueOn: null`) et
   factures carte inchangés. Rien n'est recalculé après l'émission.
3. **API et front** : le réglage exposé dans la vue de l'entité, commande et
   route sur le modèle de `set-invoice-payment-terms` ; un champ dans les
   réglages de l'entité (« au plus 45 jours ») ; `bank-transfer-means` lit le
   nouveau champ : « N jours après l'émission de la facture. Imprimée sur
   chaque facture ; changer le réglage ne touche pas les factures déjà émises. »
4. **Doc** : V6 du § 4 de `le-paiement-par-virement.md` réécrit, phrase des
   45 jours corrigée.

### Tests

- Domaine : bornes du réglage (1 et 45 acceptés, 0 et 46 refusés, entier),
  défaut 15 ; `transferDueDay` en fin de mois, année bissextile, samedi gardé.
- Émission : dans un même passage, payeur au prélèvement inchangé, payeur au
  virement `issuedOn + N` ; émission tardive toujours `issuedOn + N`.
- Figement : changer le réglage après émission laisse `dueOn`, le PDF et
  Factur-X inchangés.
- `transfer_overdue` le jour `issuedOn + N + 1`.
- Une entité existante lit 15 ; specs front du bloc et du réglage.

### Ce que le plan ne fait pas

- Ni le prélèvement ni les factures carte.
- Aucune facture émise n'est recalculée.
- Ni régime « 45 jours fin de mois », ni réglage par client, ni relance
  automatique.
- La lecture juridique de L441-10 revient au cabinet.

### Décisions de Hugo (2026-11-13), après vitruve

1. **Défaut : 15 jours après l'émission**, posé en base par Hugo (pas une
   valeur choisie d'office). Réglage par entité.
2. **Le délai part de l'émission réelle** : une émission rattrapée en retard
   décale l'échéance d'autant.
3. **L'échéance imprimée n'est pas reportée** ; le constat de retard
   (`transfer_overdue`, écran des virements en retard, jours de retard) ne
   commence qu'au **premier jour ouvré qui suit l'échéance**.
4. **Seul `bank_transfer` change** : tout autre moyen (prélèvement, au compte
   sans mandat) garde l'échéance du cycle.

Ajouts issus de vitruve : l'e-mail « facture émise » (`invoice-issued-mail.ts`)
est un lecteur de `dueOn` et entre dans le test de figement ; le réglage a son
fait au registre du journal (`journal-facts/accounting.ts`) et son contrat ;
l'exemple de facture au virement de la planche des PDF reflète le réglage.
Irréversible : une échéance émise ne se corrige que par avoir ; la fenêtre
gratuite est avant le premier passage mensuel qui suit le déploiement.
