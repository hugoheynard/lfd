# TODO — « Nous écrire » : les données des visiteurs hors du registre RGPD

**Ouvert le 2026-10-09** par le lot backend de
[`nous-contacter.md`](nous-contacter.md) (§5.3).

`public.contact_message` porte des données personnelles d'un **tiers** — le
visiteur ou le client qui écrit : `author_name`, `author_email`,
`author_phone`, `body`, et `user_id` / `company_id` quand il est connecté.

Le registre machine [`documentation/legal/rgpd-registre.json`](../legal/rgpd-registre.json)
ne sait pas les porter : son champ `personne` n'admet que `livreur`, `staff`
et `receptionnaire` (`dev-toolbox/gates/rgpd-staff.mjs`, vérifié le
2026-10-09). Seules les colonnes de l'auteur du **traitement**
(`handled_by_*`) et du réglage (`contact_settings.updated_by_*`) y sont.

Ce qui est bâti : anonymisation à **12 mois après traitement**
(`CONTACT_MESSAGE_RETENTION_MONTHS`, `src/b2b/contact/domain/contact-retention.ts`),
par le balayage nocturne `admin/contact/messages/anonymization/sweep`.

Reste à décider :

- la durée — 12 mois est un défaut **à confirmer par Hugo** ;
- un message **jamais traité** n'est jamais anonymisé : faut-il une seconde
  borne, depuis la réception ?
- étendre le registre (et sa porte) aux clients et visiteurs, ou tenir ces
  données dans un autre inventaire.
