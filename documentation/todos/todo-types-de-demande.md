# TODO — câblage des types de demande

> **État au 2026-08-09** : le **contrat** est posé et testé
> (`packages/contracts/src/request-topic.ts`, 22 specs) ; les libellés vivent dans
> `@lfd/b2b-ui/appointment`. **Rien n'est encore persisté ni affiché.**
>
> Le modèle et les règles : [`../b2b/architecture-prise-de-rendez-vous.md`](../b2b/architecture-prise-de-rendez-vous.md) §2.2 ter.

## Pourquoi ça attend

La tranche suivante **fige l'énuméré dans une colonne Postgres**. Le vocabulaire
se corrige gratuitement tant qu'aucune ligne ne le porte, et cher après. Le
contrat est donc livré seul, exprès, pour être relu avant migration.

## L'ordre, et pourquoi cet ordre

1. **Persistance** — `topic`, `subject_kind`, `subject_id` sur `Appointment` et
   `SupportRequest`, tous **nullables** (le sujet est facultatif, cf. contrat) +
   migration appliquée à la base de dev **et** à la base de test.
2. **Charges utiles et vues** — brancher `classificationIssue` dans les trois
   payloads (réservation client, pose staff, demande de support) ; porter `topic`
   et `subject` sur `AppointmentView` / `SupportRequestView`.
3. **`GET /me/attachables`** — les objets du demandeur sur lesquels une demande
   peut porter : ses paniers récurrents, ses commandes récentes, les prochaines
   échéances. C'est ce qui alimente `offerableTopics` et `autoAttach` ; sans lui,
   le second niveau reste décoratif.
4. **Cascade côté client** — motif → sujet (filtré par `offerableTopics`) → objet
   (pré-sélectionné par `autoAttach` quand il n'y a qu'un candidat).
5. **Côté staff** — le sujet en sous-titre de la page rendez-vous, et l'objet
   **cliquable** : le commercial ouvre le panier récurrent concerné en un clic.
   C'est là que la taxonomie cesse d'être une taxonomie et devient un gain de
   temps.

Les étapes 1–2 n'ont d'intérêt qu'accompagnées de la 3 : un sujet stocké que rien
ne rattache n'est qu'un libellé plus long.

## Dépendance

L'étape 5 suppose que les paniers récurrents et les commandes aient une page
staff où atterrir. Pour la commande, **elle n'existe pas** — cf.
[`../b2b/audit-flux-plateforme-admin.md`](../b2b/audit-flux-plateforme-admin.md)
P0-1.
