import { Prisma } from "../../../platform/database/client/client.js";

/**
 * Les fragments SQL partagés par les deux adaptateurs des particuliers du
 * comptoir. Ils restent dans `infrastructure/` : aucun type Prisma n'en sort.
 */

/**
 * Un **particulier** : une personne de `users` rattachée à aucune société (ni
 * membre, ni invitée à l'être) et non désactivée. Les comptes connectables et
 * les fiches invitées (`auth0_sub` nul) en sont tous deux.
 */
export const PARTICULAR_WHERE = Prisma.sql`
  u.status <> 'disabled'
  AND NOT EXISTS (SELECT 1 FROM public.memberships m WHERE m.user_id = u.id)
`;

/**
 * La clé de rapprochement d'un téléphone, calculée en base — la même règle que
 * `phoneMatchKey` (domaine) : chiffres seuls, `+33` et `0033` ramenés à `0`.
 * Les deux changent ensemble.
 */
export const PHONE_KEY = Prisma.sql`
  CASE
    WHEN btrim(u.phone) LIKE '+33%'
      THEN '0' || substr(regexp_replace(u.phone, '[^0-9]', '', 'g'), 3)
    WHEN regexp_replace(u.phone, '[^0-9]', '', 'g') LIKE '0033%'
      THEN '0' || substr(regexp_replace(u.phone, '[^0-9]', '', 'g'), 5)
    ELSE regexp_replace(u.phone, '[^0-9]', '', 'g')
  END
`;
