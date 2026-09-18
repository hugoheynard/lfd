# TODO — le `sub` Auth0 sert encore d'auteur un peu partout

> ⚪ **Remplacé le 2026-09-18** par [`../plan-l-auteur-est-la-fiche.md`](../plan-l-auteur-est-la-fiche.md) :
> cet inventaire manquait la moitié des colonnes, un second journal et une
> empreinte du catalogue. Gardé pour l'histoire de la décision.

> Ouvert le 2026-09-18. Sorti volontairement de
> [`architecture-journal-de-l-annuaire.md`](architecture-journal-de-l-annuaire.md) §8, sur
> l'objection de `vitruve` : changer l'acteur du contexte aurait changé **en
> silence** l'unité de toutes les colonnes ci-dessous.

Hugo, le 2026-09-18 : un auteur ne doit pas stocker le `sub` (fuite de donnée)
mais l'identifiant de la fiche staff. C'est fait pour les dérogations
(`granted_by_staff_id`). Il reste, vérifié le même jour :

- **le journal** — `activity_events.actor_id` vaut le `sub` pour tout acte
  staff (`AdminAuthGuard` pose l'acteur avant la résolution de la fiche), et
  `ActivityEventView.actorId` le sert au back-office ;
- **des colonnes qui lisent l'acteur du contexte** : `updatedBy`
  (`prisma-product.repository.ts`), `readyBy`, `takenBy`, `publishedBy` (PIM),
  `acceptedBy` (catalogue) — certaines s'affichent telles quelles
  (`revisions-page.html`, `overview-page.html`, `publish-rail.ts`) ;
- **des colonnes `*_by_sub`** : `feature-access.prisma`, `client-notes.prisma`,
  `account.prisma` (deux), `settings.prisma`, `alerts.prisma` ;
- **une cinquantaine d'appels à `@StaffSub()`** ;
- trois e2e qui attendent le `sub` en `actorId` (`admin-company-pieces`,
  `delivery-procedure`, `client-notes-wall`).

## Ce qu'il faudra trancher

- **L'historique** : réécrire `actor_id` des faits passés par jointure
  `staff_users.auth0_id` est risqué — un `sub` peut passer d'une fiche supprimée
  à une nouvelle sous la même adresse, et `actor_name` est nul sur les faits les
  plus anciens. Les laisser, c'est garder deux formes selon la date.
- **L'ordre** : colonne par colonne, chacune en trois temps (étendre, basculer,
  resserrer), plutôt qu'un changement de l'acteur du contexte qui les basculerait
  toutes d'un coup.

Migration de données : `vitruve` obligatoire avant de soumettre un plan.
