# TODO — resserrer `expectedRevision` des documents légaux

> Ouvert le 2026-09-29, lot P2 de
> [`documentation/legal/plan-page-confidentialite.md`](../legal/plan-page-confidentialite.md) (§4.5, B2).

## Ce qui est en place

Les écritures d'un document légal portent la révision lue (`expectedRevision`),
et l'écriture lui est conditionnée en base : une révision périmée donne un 409.

Pour ne pas casser le back-office en ligne (CLAUDE.md §0 : étendre, basculer,
resserrer), le champ est **facultatif** sur les cinq écritures déjà servies :
titre, ajout, modification, déplacement, suppression (`?expectedRevision=`).
Quand il est absent, l'écriture n'est **pas** conditionnée : c'est le comportement
d'avant (`upsertUnconditioned` dans `prisma-platform-content.repository.ts`).
Il est déjà obligatoire sur `POST /admin/content/legal/:mention/sections`.

## À faire, une fois le back-office déployé avec la révision

1. Vérifier en production que le back-office déployé envoie `expectedRevision` sur les cinq routes.
2. Retirer `.optional()` des schémas `legalDocumentTitlePayloadSchema`,
   `legalDocumentParagraphWritePayloadSchema`, `legalDocumentPositionPayloadSchema`
   et `legalDocumentRevisionQuerySchema`.
3. Passer `expectedRevision: number` dans les commandes et le port, `revision: number` dans l'agrégat.
4. Supprimer `upsertUnconditioned`.
5. Remplacer le test e2e « écrit sans contrôle… » par un 400.

Tant que ce n'est pas fait, un écran périmé peut encore effacer la section
requise créée par un collègue.
