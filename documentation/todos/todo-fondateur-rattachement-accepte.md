# Le fondateur d'une société naît « invité », pas « accepté »

> 📝 Noté le 2026-11-01, **non bâti**. Décision de Hugo du même jour : corriger
> le semis tout de suite, documenter le cas de production, ne pas le bâtir
> sans relecture (il touche l'accès aux sociétés : `vitruve` d'office).

## Ce qui se passe (relu le 2026-11-01)

- `CreateCompanyCommand` écrit le rattachement du créateur sans `accepted_at`
  (`apps/lfd-api/src/b2b/account/infrastructure/prisma-company.repository.ts`,
  `tx.membership.create`) : `invited_at` prend le défaut de la base, `now()`.
- C'est la **requête suivante** de cette personne qui l'accepte :
  `customer-principal.resolver.ts` → `membership-acceptance.ts`
  (`acceptLive`), à condition que l'invitation vive encore
  (`isInvitationAlive`, durée `INVITATION_LIFETIME_DAYS`, 7 jours).
- Toute garde d'accès lit `openingMembership(now)`
  (`apps/lfd-api/src/b2b/shared/company-standing/infrastructure/opening-membership.ts`) :
  accepté, OU invitation vivante. Passé 7 jours sans acceptation, la société
  répond « Entreprise introuvable » (`account.company.not_found`) à son
  propre fondateur.

## Pourquoi c'est rare en production

Juste après la création, la boutique relit le compte (`/me`) : cette lecture
passe par la résolution du client et accepte le rattachement dans la seconde.
Il faudrait que ce rechargement n'ait jamais lieu (onglet fermé, coupure entre
la création et l'affichage) puis aucune visite pendant 7 jours. Le parcours
de création n'a pas été déroulé écran par écran pour le prouver.

## Ce qui l'a révélé

Le semis : ses fondateurs (`seed|…`) ne font jamais de requête. Semés le
2026-10-25, leurs 37 rattachements ont expiré le 2026-11-01, et la remise à
l'état de base de la journée de démo a échoué. **Corrigé côté semis** :
`acceptSeededFounders` (`apps/lfd-api/src/dev/seeding/seeded-founders.seed.ts`),
éprouvé par `apps/lfd-api/test/dev-scenario.e2e-spec.ts`.

## Ce qui reste à faire

1. Faire naître le rattachement du fondateur **accepté** à la création
   (`acceptedAt: now`) : il n'a été invité par personne, il est le détenteur.
   Une société créée par le staff, sans propriétaire, n'est pas concernée.
2. Vérifier en production qu'aucun fondateur n'est déjà fermé — requête en
   lecture seule, à lancer par Hugo :

   ```sql
   select c.raison_sociale, m.invited_at
     from memberships m
     join companies c on c.id = m.company_id
    where m.role = 'owner'
      and m.accepted_at is null
      and m.invited_at < now() - interval '7 days';
   ```

3. S'il y en a : décider s'ils se rouvrent par une acceptation datée de leur
   invitation (migration de données, donc `vitruve` et `lecteur-de-migrations`),
   ou par le geste existant de renouvellement d'invitation.
