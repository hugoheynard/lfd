# TODO — une dérogation d'accès au journal porte un e-mail

> **Mis de côté par Hugo le 2026-09-19**, pendant le lot B du
> [plan des phrases](plan-phrases-du-journal.md) : le sujet dépasse le
> journal, il touche à ce qu'est une dérogation. Rien n'est décidé.

## Le constat (vérifié le 2026-09-19)

Une dérogation d'accès ouvre une fonctionnalité à **une adresse e-mail**, en
dehors du niveau d'accès général (`b2b/feature-access/`, modèle
`FeatureAccessExemption` : `key`, `email`, auteur, date).

- Ses faits (`feature_access.exemption_added` / `_removed`) écrivent
  **l'e-mail en clair** au journal — contraire à la règle « jamais de
  coordonnées » ([`todo-journal-activite.md`](todo-journal-activite.md), la
  règle en ajoutant un émetteur).
- Le retrait **supprime la ligne** (`deleteMany`,
  `prisma-feature-exemption.repository.ts`). Une fois la dérogation retirée,
  **le journal est la seule trace** de l'adresse qui avait eu accès : retirer
  l'e-mail du fait effacerait la réponse à « qui avait accès ? ».

C'est pourquoi le lot B l'a laissé tel quel : c'est le seul type de fait du
catalogue dont la forme courante porte encore un e-mail, par exception.

## La piste de Hugo

**Donner un accès demande un nom, un prénom et une raison.** Une dérogation
cesse d'être une adresse nue : elle désigne une personne et dit pourquoi on lui
ouvre la porte.

Ce que ça permettrait :

- le journal cite la **personne** (« a ouvert l'espace pro à Jeanne Martin —
  test de la commande récurrente ») et plus son adresse ;
- la raison se relit, ce qu'aucune trace ne dit aujourd'hui.

## Ce qu'il faudra trancher en le bâtissant

- **Où vit l'e-mail** une fois la dérogation retirée : l'archiver plutôt que la
  supprimer (une colonne `archived_at`, migration additive) garde la réponse à
  « qui avait accès » dans la table, et le journal peut alors ne plus citer
  que la personne.
- **Les dérogations existantes** n'ont ni nom ni raison : un repli honnête à
  l'écran, ou une saisie demandée au prochain passage.
- **Les lignes déjà au journal** gardent leur e-mail : le journal ne se
  réécrit pas (décision de Hugo, plan des phrases §6.2). Un effacement ciblé
  serait une migration de données à part, avec `vitruve`.
