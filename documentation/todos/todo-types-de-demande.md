# TODO — câblage des types de demande

> **État au 2026-09-03** _(relu contre le code ; l'état précédent datait du
> 2026-08-09)_ : le **contrat** est posé et testé
> (`packages/contracts/src/request-topic.ts`, **15** specs — le doc en annonçait 22) ; les libellés vivent dans `@lfd/b2b-ui/appointment`.
>
> « Rien n'est encore persisté » était **faux** : le premier des deux niveaux,
> la **famille**, l'est déjà — `purpose` sur `Appointment` **et** sur
> `SupportRequest`, avec le même vocabulaire des deux côtés. Ce qui manque est
> le **sujet** (`RequestTopic`) et l'**attachement**.
>
> Le modèle et les règles : [`../b2b/architecture-prise-de-rendez-vous.md`](../b2b/architecture-prise-de-rendez-vous.md) §2.2 ter.

## Pourquoi ça attend

La tranche suivante **fige l'énuméré dans une colonne Postgres**. Le vocabulaire
se corrige gratuitement tant qu'aucune ligne ne le porte, et cher après. Le
contrat est donc livré seul, exprès, pour être relu avant migration.

## L'ordre, et pourquoi cet ordre

1. **Persistance** — `topic`, plus le couple qui porte l'objet rattaché, sur
   `Appointment` et `SupportRequest`, tous **nullables** (le sujet est
   facultatif, cf. contrat) + migration appliquée à la base de dev **et** à la
   base de test.

   🔴 **Ne PAS les appeler `subject_kind` / `subject_id`**, comme cette ligne le
   disait. `Appointment` porte **déjà** `subject_type` / `subject_id`, et ils
   veulent dire tout autre chose : **avec qui** est le rendez-vous
   (`company | lead | user`). L'attachement du contrat, lui, désigne **sur quoi**
   porte la demande (`order | subscription | subscription_occurrence`). Deux
   paires quasi homonymes dans la même table, c'est la confusion garantie au
   premier `where` — d'autant que la seconde est nullable et la première pas.
   Nommer `attaches_kind` / `attaches_id`, du nom que le contrat emploie déjà
   (`attaches`).

2. **Charges utiles et vues** — brancher `classificationIssue` dans les trois
   payloads (réservation client, pose staff, demande de support) ; porter `topic`
   et `subject` sur `AppointmentView` / `SupportRequestView`.
3. **`GET /me/attachables`** _(vérifié absent le 2026-09-03)_ — les objets du
   demandeur sur lesquels une demande
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
staff où atterrir.

✅ **Débloqué.** Ce paragraphe disait « pour la commande, **elle n'existe pas** »
en citant le constat P0-1 de l'audit du 2026-08-09. Ce constat est refermé :
`admin/orders`, `admin/order-drafts` et `admin/production` sont montés (relecture
du 2026-09-03 dans
[`../b2b/audit-flux-plateforme-admin.md`](../b2b/audit-flux-plateforme-admin.md)).
Plus rien ne retient l'étape 5 de ce côté.
