// ════════════════════════════════════════════
// DELT TILGANGSSJEKK FOR MANAGED FUNCTIONS
// ════════════════════════════════════════════
// Bakgrunn: /api/ordrestyring-proxy sto lenge helt aapen (authLevel anonymous,
// ingen tokensjekk, CORS *). Hvem som helst kunne hente ordre- og timedata for
// alle ni selskapene ved aa kjenne URL-en. Innloggingen i appen filtrerte kun
// hva grensesnittet VISTE, ikke hva API-et utleverte.
//
// VIKTIG OM STYRKEN PAA DENNE SJEKKEN:
// Tokenet appen har er et Microsoft Graph-token. Slike tokener kan ikke
// signaturvalideres av oss — Microsoft legger en nonce i headeren nettopp for
// aa hindre at andre API-er validerer tokener utstedt til Graph. Vi leser
// derfor innholdet uten aa verifisere signaturen.
// Det betyr i praksis:
//   STOPPER:  tilfeldig internett-trafikk, scanning, andre nettsteder som
//             kaller endepunktet fra en besoekendes nettleser.
//   STOPPER IKKE: en som kjenner formatet og lager et token med riktig tid.
// Ekte kryptografisk sikring krever at appen ber om et token for VAART eget
// API (egen scope paa app-registreringen) i stedet for et Graph-token.
// Se dok i svaret — det er en bevisst beslutning, ikke gjort her.
//
// MODUS (appinnstilling TILGANG_MODUS):
//   'logg'   — standard. Validerer og logger, men slipper ALT gjennom.
//              Trygg oppstart: kan ikke laase ute noen.
//   'streng' — avviser kall som ikke har gyldig token.
// Settes til 'streng' foerst naar loggen har vaert ren en stund.

const TENANT = '7ee2ac67-421e-4ac2-8998-f1f3e0c10fa7';

function modus() {
  return (process.env.TILGANG_MODUS || 'logg').toLowerCase() === 'streng' ? 'streng' : 'logg';
}

// Static Web Apps bruker Authorization-headeren til sin egen autentisering og
// bytter ut innholdet foer det naar managed functions. Klienten sender derfor
// tokenet i X-Minel-Token. Authorization beholdes som reserve.
function hentRaaToken(req) {
  const h = (req && req.headers) || {};
  const egen = h['x-minel-token'] || h['X-Minel-Token'];
  if (egen) return { raa: String(egen), kilde: 'x-minel-token' };
  const auth = h.authorization || h.Authorization || '';
  if (auth.startsWith('Bearer ')) return { raa: auth.slice(7), kilde: 'authorization' };
  return { raa: '', kilde: 'ingen' };
}

function lesPayload(raa) {
  const deler = raa.split('.');
  if (deler.length < 2) throw new Error('ikke et JWT');
  // JWT bruker base64url — bytt tegn og fyll paa padding.
  let b64 = deler[1].replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

// Returnerer { ok, grunn, kilde, bruker } — uten aa lekke tokenverdier.
function vurderToken(req) {
  const { raa, kilde } = hentRaaToken(req);
  if (!raa) return { ok: false, grunn: 'ingen token', kilde };
  let p;
  try { p = lesPayload(raa); }
  catch (e) { return { ok: false, grunn: 'ugyldig token-format', kilde }; }
  if (p.tid !== TENANT) return { ok: false, grunn: p.tid ? 'feil tenant' : 'mangler tenant', kilde };
  if (p.exp && p.exp * 1000 < Date.now()) return { ok: false, grunn: 'utloept token', kilde };
  return { ok: true, grunn: 'ok', kilde, bruker: p.preferred_username || p.upn || p.oid || 'ukjent' };
}

// Hovedinngang. Returnerer { tillat, status, melding, vurdering }.
// I logg-modus er tillat alltid true — men vurderingen logges slik at vi ser
// om ekte trafikk ville blitt avvist foer vi skrur paa streng modus.
function sjekkTilgang(context, req, endepunkt) {
  const v = vurderToken(req);
  const m = modus();
  const logg = `[tilgang ${endepunkt}] modus=${m} resultat=${v.grunn} kilde=${v.kilde}` +
    (v.ok ? ` bruker=${v.bruker}` : '');
  if (context && context.log) { v.ok ? context.log(logg) : context.log.warn(logg); }
  if (v.ok || m === 'logg') return { tillat: true, vurdering: v, modus: m };
  // 401 = «logg inn paa nytt» (mangler eller utloept). 403 = «du har ikke lov».
  const maaLoggeInn = (v.grunn === 'ingen token' || v.grunn === 'utloept token');
  return {
    tillat: false, status: maaLoggeInn ? 401 : 403,
    melding: 'Ikke tilgang (' + v.grunn + ')', vurdering: v, modus: m
  };
}

// ════════════════════════════════════════════
// SELSKAPSSKILLE
// ════════════════════════════════════════════
// Speiler OFFICE_MAP i src/index.html. Holdes i synk manuelt — endres den ene,
// maa den andre endres ogsaa, ellers ser klienten noe annet enn API-et tillater.
const OFFICE_MAP = {
  '372 minel as': '__admin__',
  '374 minel skogvang installasjon as': 'Minel Skogvang Installasjon AS',
  '374 minel skogvang installasjon': 'Minel Skogvang Installasjon AS',
  '374 minel skogvang teledata øst': 'Minel Skogvang Installasjon AS',
  '375 minel elmontasje as': 'Minel Elmontasje AS',
  '375 minel elmontasje hamar': 'Minel Elmontasje AS',
  '376 minel gjøvik as': 'Minel Gjøvik AS',
  '376 minel gjøvik': 'Minel Gjøvik AS',
  '377 minel land elektriske as': 'Minel Land Elektriske AS',
  '377 minel land elektrisk as': 'Minel Land Elektriske AS',
  '377 minel land elektriske': 'Minel Land Elektriske AS',
  '377 minel land elektrisk': 'Minel Land Elektriske AS',
  '378 minel elmontasje elverum as': 'Minel Elmontasje Elverum AS',
  '378 minel elmontasje elverum': 'Minel Elmontasje Elverum AS',
  '379 minel gudbrandsdal as': 'Minel Gudbrandsdal AS',
  '379 minel gudbrandsdal': 'Minel Gudbrandsdal AS',
  '381 minel ainstall as': 'Minel Ainstall AS',
  '381 minel ainstall': 'Minel Ainstall AS',
  '383 minel kreativ elektro ski as': 'Minel Kreativ Elektro Ski AS',
  '383 minel kreativ elektro ski': 'Minel Kreativ Elektro Ski AS',
  '383 minel kreativ ski': 'Minel Kreativ Elektro Ski AS',
  '384 minel drøbak elektriske as': 'Minel Drøbak Elektriske AS',
  '384 minel drøbak elektriske': 'Minel Drøbak Elektriske AS',
  '385 minel kreativ elektro askim as': 'Minel Kreativ Elektro Ski AS',
  '385 minel kreativ elektro askim': 'Minel Kreativ Elektro Ski AS',
};
const BLOKKERTE = ['jonas.prestkvern@minel.no'];

// Cache saa vi ikke slaar opp mot Graph for hvert eneste kall. En full
// oppdatering i klienten gjoer ~20 kall; uten cache ble det 20 Graph-kall.
const _cache = new Map();
const CACHE_MS = 5 * 60 * 1000;

function cacheNokkel(raa) {
  // Aldri lagre selve tokenet — kun et hash av det.
  return require('crypto').createHash('sha256').update(raa).digest('hex').slice(0, 32);
}

// Slaar opp brukerens selskap via Graph med brukerens EGET token.
// Dette er samtidig ekte verifisering: vi kan ikke sjekke signaturen paa et
// Graph-token selv, men Microsoft gjoer det naar tokenet faktisk brukes.
// Et forfalsket token gir 401 fra Graph og slipper dermed ikke gjennom.
async function hentBrukerSelskap(raa) {
  const n = cacheNokkel(raa);
  const traff = _cache.get(n);
  if (traff && Date.now() - traff.tid < CACHE_MS) return traff.svar;

  let svar;
  try {
    const r = await fetch('https://graph.microsoft.com/v1.0/me?$select=officeLocation,userPrincipalName,mail', {
      headers: { Authorization: 'Bearer ' + raa }
    });
    if (r.status === 401 || r.status === 403) {
      svar = { ok: false, grunn: 'token avvist av Graph' };
    } else if (!r.ok) {
      svar = { ok: false, grunn: 'Graph svarte ' + r.status };
    } else {
      const me = await r.json();
      const epost = String(me.userPrincipalName || me.mail || '').toLowerCase();
      if (BLOKKERTE.includes(epost)) {
        svar = { ok: false, grunn: 'bruker sperret' };
      } else {
        const loc = String(me.officeLocation || '').trim().toLowerCase();
        const selskap = OFFICE_MAP[loc] || null;
        svar = selskap
          ? { ok: true, selskap, admin: selskap === '__admin__', epost }
          : { ok: false, grunn: 'ukjent kontorsted', epost };
      }
    }
  } catch (e) {
    svar = { ok: false, grunn: 'Graph utilgjengelig: ' + e.message };
  }
  // Cache ogsaa avslag, ellers kan et ugyldig token hamre paa Graph.
  _cache.set(n, { svar, tid: Date.now() });
  if (_cache.size > 200) { for (const k of _cache.keys()) { _cache.delete(k); if (_cache.size <= 100) break; } }
  return svar;
}

// Sjekker at innlogget bruker faktisk hoerer til selskapet det spoerres om.
// Admin (372 Minel AS) naar alle. Foelger samme logg/streng-modus.
async function sjekkSelskap(context, req, onsketSelskap, endepunkt) {
  const m = modus();
  const { raa, kilde } = hentRaaToken(req);
  const loggOgSvar = (ok, grunn, ekstra) => {
    const logg = `[selskap ${endepunkt}] modus=${m} resultat=${grunn} ber_om=${onsketSelskap || '-'}` + (ekstra || '');
    if (context && context.log) { ok ? context.log(logg) : context.log.warn(logg); }
    if (ok || m === 'logg') return { tillat: true, grunn, modus: m };
    return { tillat: false, status: 403, melding: 'Ikke tilgang (' + grunn + ')', grunn, modus: m };
  };
  if (!raa) return loggOgSvar(false, 'ingen token', ' kilde=' + kilde);
  if (!onsketSelskap) return loggOgSvar(false, 'mangler selskap i forespoerselen');

  const b = await hentBrukerSelskap(raa);
  if (!b.ok) return loggOgSvar(false, b.grunn, b.epost ? ' bruker=' + b.epost : '');
  if (b.admin) return loggOgSvar(true, 'ok (admin)', ' bruker=' + b.epost);
  if (b.selskap === onsketSelskap) return loggOgSvar(true, 'ok', ' bruker=' + b.epost);
  return loggOgSvar(false, 'feil selskap', ` bruker=${b.epost} hoerer_til=${b.selskap}`);
}

module.exports = { sjekkTilgang, sjekkSelskap, hentBrukerSelskap, vurderToken, modus, TENANT, OFFICE_MAP };
