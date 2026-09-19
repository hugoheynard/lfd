# Mandat — l'amendement d'un mandat actif

> Ouvert le 2026-09-15. Les trois autres restes de la frappe — `DtOfSgntr`, le
> verrou du créancier imprimé, la purge des pièces jamais signées — sont
> construits : [`plan-restes-du-mandat.md`](plan-restes-du-mandat.md).

## Ce qui manque

Changer de RIB sous un mandat actif n'a pas de mécanisme d'amendement :
`AmdmntInd` est écrit `false`, et le lot lit le RIB courant.

**En attendant, c'est inexprimable** : le client et le staff sont refusés en 409
(`BankAccountBoundToActiveMandateError`) ; le geste de sortie est de révoquer le
mandat actif, enregistrer le nouveau RIB, et frapper un nouveau mandat.

## Pourquoi c'est différé (décidé par Hugo le 2026-09-15)

1. **Les règles dépendent de la banque**, et la doc du dépôt n'atteste que « `FRST`
   et `OrgnlDbtrAgt = SMNDA` après un changement de banque » (CFONB). À demander à
   la Caisse d'Épargne :
   - `FRST` est-il encore exigé avec `SMNDA` ?
   - en **interentreprises**, un changement de banque impose-t-il un **nouveau
     mandat** plutôt qu'un amendement ?
   - quels champs pour un changement de compte dans la même banque
     (`OrgnlDbtrAcct`) ?
2. **Un amendement se consomme au dépôt, et le dépôt n'existe pas** : le lot est un
   XML téléchargé, aucun fichier n'est figé. Il faut d'abord un geste « lot
   déposé » qui fige ce que CE fichier a annoncé (manifeste au téléchargement, ou
   XML déposé téléversé) — sans quoi l'annonce s'éteint sur un recalcul.

Le modèle envisagé et ses objections sont aux §5 et §7 (#1, #2, #4, #12) du plan.

## Supprimer les deux colonnes Stripe du mandat

> Ouvert le 2026-09-19. Le code du mandat Stripe a été supprimé ce jour-là —
> aucun mandat Stripe en production (Hugo) : port `MandateGateway`, adaptateur,
> champs du domaine, lecture et écriture des colonnes.

`payment_mandates.stripe_customer_id` et `payment_mandates.payment_method_id`
restent en base, nullable, **ni lues ni écrites** : l'adaptateur Prisma les
écarte par `omit` à chaque lecture, pour que le code en ligne ne les
sélectionne déjà plus le jour où elles disparaissent. Aucun index ni
contrainte ne les cite (les trois index partiels du 2026-09-12 portent sur
`company_id`, `creditor_id`, `reference` et `status` — vérifié le 2026-09-19).

Ce qui reste : les supprimer par migration, **dans un déploiement à part** —
retrait des deux champs du modèle `PaymentMandate` et `DROP COLUMN` dans le
même passage, après qu'une version sans lecture a été en ligne. C'est une
migration de données : `vitruve` puis `lecteur-de-migrations` avant.
