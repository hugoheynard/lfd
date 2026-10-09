# TODO — la facture du mois, avant la première émission

> Ouvert le 2026-10-09. La première facture du mois tombe le **30 novembre
> 2026 à 23h55** (heure de Paris) si le déploiement a lieu en octobre
> (`invoicing_floor` = 1er du mois qui suit). Voir
> [`facture-emise.md`](facture-emise.md).

## La règle, déjà tenue

**Même automatique, pas de facture si pas de commande** (Hugo, 2026-10-09).
La facture du mois part des **bons du mois**, regroupés par payeur légal
(`ordersByPayer`, `b2b/accounting/domain/services/monthly-invoicing.ts`) : un
client qui n'a rien commandé au compte n'apparaît pas — ni facture, ni
signalement, quelle que soit sa fiche. Tenu par le test « sans aucun bon du
mois : ni facture, ni payeur signalé » (`monthly-invoicing.spec.ts`).

## À faire avant le 30 novembre

- [ ] **Adresses de facturation manquantes.** 65 sociétés n'ont pas
      d'adresse de facturation active (compté en production le 2026-10-09).
      Celles qui commanderont au compte en novembre verront leur facture
      **signalée** au lieu d'émise (`buyer_address_missing`), avec le geste :
      ajouter l'adresse sur la fiche client. Compléter d'abord les fiches des
      clients au compte. Requête de contrôle :

      ```sql
              SELECT count(*) FROM public.companies c
              WHERE NOT EXISTS (
                SELECT 1 FROM public.addresses a
                WHERE a.company_id = c.id AND a.kind = 'billing' AND a.archived_at IS NULL
              );
              ```

- [ ] **Mentions de paiement de l'entité** (pénalités de retard, indemnité de
      40 €) : sans elles, aucune facture ne part (`payment_terms_missing`).
      Les poser sur la fiche de l'entité émettrice.
- [ ] **Le 30 novembre au soir**, regarder l'écran « Prélèvement du mois » :
      factures émises et payeurs signalés.
