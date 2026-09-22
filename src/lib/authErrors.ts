/**
 * Co říct dítěti, když přihlášení nebo registrace selže.
 *
 * Dvě věci najednou, protože jedna bez druhé nestačí:
 *
 * 1. **Dítě** dostane srozumitelnou větu a hlavně to, co s tím může udělat.
 *    Anglické hlášky ze Supabase mu nepomůžou a prozrazují o backendu víc,
 *    než je zdrávo.
 * 2. **Kdo to staví** musí mít v konzoli přesně to, co vrátil server. Když
 *    se schová obojí, zbude „zkus to znovu za chvíli" a problém se nedá
 *    odladit — přesně na tom jsme jednou ztratili půl večera.
 */

export interface FriendlyAuthError {
  title: string;
  description: string;
}

interface Rule {
  match: RegExp;
  friendly: FriendlyAuthError;
}

const RULES: Rule[] = [
  {
    // Při registraci: selhal trigger handle_new_user — typicky proto, že
    // v databázi ještě neběžely migrace.
    match: /saving new user/i,
    friendly: {
      title: 'Databáze účet nevytvořila',
      description: 'Vypadá to na nedodělané nastavení databáze, ne na chybu u tebe. Dej vědět tomu, kdo Kamosféru spravuje.',
    },
  },
  {
    match: /invalid api key|no api key/i,
    friendly: {
      title: 'Kamosféra se nedomluví s databází',
      description: 'Přístupový klíč neplatí. Tohle musí opravit správce — zkoušet znovu nemá smysl.',
    },
  },
  {
    match: /signups? (not allowed|disabled)/i,
    friendly: {
      title: 'Registrace je zavřená',
      description: 'Nové účty teď nejdou zakládat. Zeptej se toho, kdo tě sem pozval.',
    },
  },
  {
    match: /already registered|already exists|duplicate|user already/i,
    friendly: {
      title: 'Tenhle email už tu je',
      description: 'Zkus se rovnou přihlásit, nebo použij jiný email.',
    },
  },
  {
    match: /profiles_username_key|username.*(exists|duplicate)/i,
    friendly: {
      title: 'Přezdívku už někdo má',
      description: 'Vyber si jinou a zkus to znovu.',
    },
  },
  {
    match: /password.*(short|least|weak)|weak password/i,
    friendly: {
      title: 'Heslo je moc krátké',
      description: 'Dej mu aspoň šest znaků.',
    },
  },
  {
    match: /invalid email|email.*invalid/i,
    friendly: {
      title: 'Email nevypadá správně',
      description: 'Zkontroluj, jestli tam nechybí zavináč nebo tečka.',
    },
  },
  {
    match: /rate limit|too many requests|over_email_send_rate/i,
    friendly: {
      title: 'Moc pokusů za sebou',
      description: 'Dej tomu pár minut a zkus to znovu.',
    },
  },
  {
    match: /invalid login credentials|invalid credentials/i,
    friendly: {
      title: 'Nesprávný email nebo heslo',
      description: 'Zkontroluj obojí a zkus to znovu.',
    },
  },
  {
    match: /email not confirmed/i,
    friendly: {
      title: 'Email ještě není potvrzený',
      description: 'Podívej se do pošty a klikni na odkaz, který jsme ti poslali.',
    },
  },
  {
    match: /failed to fetch|network|load failed/i,
    friendly: {
      title: 'Nejde se připojit',
      description: 'Zkontroluj připojení k internetu a zkus to znovu.',
    },
  },
];

/**
 * Neznámou chybu nezamlčíme. Schovat i tu znamená, že se problém nedá
 * odladit bez otevírání konzole — a to po nikom chtít nejde. Rozpoznané
 * případy zůstávají v lidské řeči; tenhle jeden ukáže i to, co řekl server.
 */
function fallback(message: string): FriendlyAuthError {
  if (/database error/i.test(message)) {
    return {
      title: 'Chyba v databázi',
      description:
        'Nejde o chybu u tebe — je to v nastavení databáze. Ukaž tohle správci: ' +
        message.trim().slice(0, 200),
    };
  }
  const detail = message.trim().slice(0, 200);
  return {
    title: 'Nepovedlo se',
    description: detail
      ? `Zkus to prosím znovu. Pokud to bude trvat, ukaž tohle správci: ${detail}`
      : 'Zkus to prosím znovu. Pokud to bude trvat, dej vědět správci.',
  };
}

/**
 * Přeloží chybu na větu pro dítě a **zároveň ji vypíše do konzole**, ať se
 * dá zjistit, co se doopravdy stalo.
 */
export function explainAuthError(error: unknown, context: string): FriendlyAuthError {
  const message = error instanceof Error ? error.message : String(error ?? '');

  // Tohle je ta část, která nesmí zmizet: v devtools má být pravda.
  console.error(`[auth] ${context} selhalo:`, error);

  return RULES.find((rule) => rule.match.test(message))?.friendly ?? fallback(message);
}
