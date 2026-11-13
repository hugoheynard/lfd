# L'argent et la comptabilité : ce qui est fait, ce qui ne l'est pas

> État vérifié **dans le code** le 2026-11-13 (pas dans la carte des
> chantiers, qui le disait de mémoire et était en retard sur plusieurs
> lignes). Réservé aux chantiers d'argent et de comptabilité ; le reste vit
> dans [`../carte-des-chantiers.md`](../carte-des-chantiers.md).

## En bref

| Sujet                                                     | État             |
| --------------------------------------------------------- | ---------------- |
| Modifier une commande payée par carte (M2), hausse/baisse | ✅ en production |
| XML du lot de prélèvement réservé à l'écriture comptable  | ✅ fait          |
| Échéance du virement réglable par entité                  | ✅ en production |
| Avoirs                                                    | 🟨 partiel       |
| Prélèvement d'essai                                       | 🟨 partiel       |
| Une remise acquise reste acquise                          | 🟨 partiel       |
| Les six décisions par défaut du 2026-10-02 (RL1)          | 🟨 partiel       |
| Les formules                                              | 🟨 à vérifier    |
| Rembourser un reste payé par carte (E9)                   | ⬜ non fait      |
| Tarification R2, R13, R16                                 | ⬜ non fait      |
| « Payé sur place » pour une saisie de l'équipe            | ⬜ non fait      |
| Le chemin du prix dans la saisie de l'équipe              | ⬜ non fait      |
| Le poids dans les abonnements                             | ⬜ non fait      |
| Revoir les échéances calculées                            | ⬜ non fait      |
| Fidélité ouverte aux pros                                 | ⬜ non fait      |
| Schémas Postgres des promotions et de la fidélité         | ⬜ non fait      |

## Le détail

### Fait

- **M2** : bloc `card-payment` (`card-payment.module.ts`), baisse par
  `RevisionCardRefund` (`orders/revision/application/services/revision-card-refund.ts`),
  hausse par les gestes `propose-`, `apply-`, `abandon-`, `expire-`,
  `relaunch-card-increase` ;
  [`../commandes/modification/modifier-une-commande.md`](../commandes/modification/modifier-une-commande.md).
  Reste refusé proprement : S3, et une baisse sous bon de fidélité (C-2b).
- **XML du lot** : `accounting/http/admin-collection-batches.controller.ts`,
  sous `b2b_accounting:write`.
- **Échéance du virement** :
  [`le-paiement-par-virement.md`](le-paiement-par-virement.md) § 4.

### Partiel — ce qui manque

- **Avoirs** : l'avoir après un remboursement carte est émis et rendu
  (PDF/A-3, Factur-X 381 — `refund-reconciler.ts`,
  `render-credit-note-document.handler.ts`). Manquent l'avoir sur un bon
  (ZB) et l'émission manuelle par l'équipe ; BT-26 attend le cabinet.
- **Prélèvement d'essai** : bâti (`collection-test.ts`,
  `admin-collection-tests.controller.ts`). Introuvables : le registre « non
  déposé » et la conservation de 10 ans.
- **Remise acquise** : bâtie, avec son script de reprise
  (`prisma-order-discount-terms-backfill.ts`). Reste à lancer la reprise en
  production, au lancement commercial.
- **RL1** : l'e-mail au client « livraison reportée » n'existe pas.
- **Formules** : le module `lafoliecoffee/bundles/` existe ; les quatre
  objections bloquantes de `vitruve` ne sont pas revérifiées.

### Non fait

- **E9** : le remboursement du reste existe (`requestRemainder`,
  `card-payment/channels/requests/card-refunds.ts`) mais le reliquat refuse
  toujours une commande carte (`shortfall-decidability.ts`,
  `CardOrderShortfallError`) et rien ne l'appelle. Le plus petit chantier du
  bloc.
- **Tarification** : R2 (simulation dans le navigateur), R13 (prix vivant ou
  bloqué, décision), R16 (engagement par famille, `loaded-pricer.ts` mesure
  par SKU).
- **« Payé sur place »** : décision attendue.
- **Chemin du prix dans la saisie de l'équipe** : mis de côté le 2026-11-12.
- **Poids dans les abonnements** : refusé par le domaine
  (`WeightArticleInSubscriptionError`).
- **Échéances calculées** : quatre questions ouvertes (arrondi, plafond,
  marges, point de départ).
- **Fidélité aux pros** : `LoyaltyProNotYetOpenableError`.
- **Schémas Postgres dédiés** : les tables vivent dans `public`.
