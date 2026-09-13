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

// ── Ansattoppslag mot Ordrestyring ──────────────────────────────────────
// Kontorsted i Entra er et fritekstfelt uten eierskap. Ordrestyring
// vedlikeholdes derimot daglig, fordi ordrer og timer avhenger av det.
// Maalt 13.09.2026: 335 aktive ansatte, 248 med @minel.no-adresse, og kun
// ÉN e-post som gaar igjen i to selskaper. Vi bruker derfor OS som kilde,
// med kontorsted som reserve.
const OS_KEYS = {
  'Minel Drøbak Elektriske AS':     process.env.ORDRESTYRING_DROBAK,
  'Minel Kreativ Elektro Ski AS':   process.env.ORDRESTYRING_KREATIV_SKI,
  'Minel Elmontasje AS':            process.env.ORDRESTYRING_ELMONTASJE,
  'Minel Elmontasje Elverum AS':    process.env.ORDRESTYRING_ELMONTASJE_ELVERUM,
  'Minel Gjøvik AS':                process.env.ORDRESTYRING_GJOVIK,
  'Minel Ainstall AS':              process.env.ORDRESTYRING_AINSTALL,
  'Minel Land Elektriske AS':       process.env.ORDRESTYRING_LAND_ELEKTRISKE,
  'Minel Skogvang Installasjon AS': process.env.ORDRESTYRING_SKOGVANG,
  'Minel Gudbrandsdal AS':          process.env.ORDRESTYRING_GUDBRANDSDAL,
};
// Ansatte som staar aktive i flere selskaper i Ordrestyring. Uten en avklaring
// her ville de falt tilbake paa kontorsted, fordi vi ikke gjetter.
// Avklart med Oyvind 13.09.2026.
const FLERE_SELSKAP = {
  'lars.aamodt@minel.no': 'Minel Land Elektriske AS',
};

const OS_URL = 'https://elkonor.ordrestyring.no/api/graphql';
const ANSATT_TTL = 30 * 60 * 1000;
let _ansattKart = null;      // { epost: selskap }  — tvetydige er utelatt
let _ansattTid = 0;
let _ansattHenter = null;    // hindrer at ti samtidige kall bygger kartet ti ganger

async function hentAnsatteFor(selskap, noekkel) {
  const r = await fetch(OS_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + noekkel, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ operationName: 'Ansatte', query: 'query Ansatte { users { items { email active } } }', variables: {} })
  });
  const j = await r.json();
  const items = (j && j.data && j.data.users && j.data.users.items) || [];
  return items.filter(u => u.active)
    .map(u => String(u.email || '').toLowerCase().trim())
    .filter(e => e.includes('@'));
}

async function byggAnsattKart(context) {
  const par = Object.entries(OS_KEYS).filter(([, k]) => k);
  const res = await Promise.allSettled(par.map(([s, k]) => hentAnsatteFor(s, k)));
  const treff = {};      // epost -> [selskap, ...]
  res.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    const selskap = par[i][0];
    r.value.forEach(e => { (treff[e] = treff[e] || []).push(selskap); });
  });
  const kart = {};
  let tvetydige = 0, avklarte = 0;
  Object.entries(treff).forEach(([e, liste]) => {
    const unike = [...new Set(liste)];
    if (unike.length === 1) { kart[e] = unike[0]; return; }
    // Staar en person i to selskaper: bruk avklaringen om vi har en, ellers
    // utelat dem og la kontorsted avgjoere. Vi gjetter aldri.
    if (FLERE_SELSKAP[e]) { kart[e] = FLERE_SELSKAP[e]; avklarte++; }
    else tvetydige++;
  });
  if (context && context.log) {
    context.log(`[ansattkart] ${Object.keys(kart).length} e-poster fra ${res.filter(r => r.status === 'fulfilled').length}/${par.length} selskaper, ${avklarte} avklarte, ${tvetydige} tvetydige`);
  }
  return kart;
}

async function ansattKart(context) {
  if (_ansattKart && Date.now() - _ansattTid < ANSATT_TTL) return _ansattKart;
  if (!_ansattHenter) {
    _ansattHenter = byggAnsattKart(context)
      .then(k => { _ansattKart = k; _ansattTid = Date.now(); return k; })
      .catch(e => { if (context && context.log) context.log.warn('[ansattkart] feilet: ' + e.message); return _ansattKart || {}; })
      .finally(() => { _ansattHenter = null; });
  }
  return _ansattHenter;
}

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
async function hentBrukerSelskap(raa, context) {
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
      const altEpost = String(me.mail || '').toLowerCase();
      if (BLOKKERTE.includes(epost) || (altEpost && BLOKKERTE.includes(altEpost))) {
        svar = { ok: false, grunn: 'bruker sperret' };
      } else {
        const loc = String(me.officeLocation || '').trim().toLowerCase();
        const viaKontor = OFFICE_MAP[loc] || null;

        // 1) Konsern foerst. Ordrestyring har ikke noe konsernbegrep — slo OS
        //    til foerst, ville de tjue konsernkontoene blitt degradert til ett
        //    enkeltselskap.
        if (viaKontor === '__admin__') {
          svar = { ok: true, selskap: '__admin__', admin: true, epost, kilde: 'kontorsted' };
        } else {
          // 2) Ordrestyring — den kilden som faktisk vedlikeholdes.
          let viaOs = null;
          try {
            const kart = await ansattKart(context);
            viaOs = kart[epost] || (altEpost ? kart[altEpost] : null) || null;
          } catch (e) { /* faller videre til kontorsted */ }

          if (viaOs) {
            svar = { ok: true, selskap: viaOs, admin: false, epost, kilde: 'ordrestyring' };
          } else if (viaKontor) {
            // 3) Kontorsted som reserve.
            svar = { ok: true, selskap: viaKontor, admin: false, epost, kilde: 'kontorsted' };
          } else {
            svar = { ok: false, grunn: 'ikke funnet i Ordrestyring eller kontorsted', epost };
          }
        }
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
//
// NB: brukes IKKE paa lesende endepunkter. Tilgangsmodellen fra 13.09.2026 er
// at alle innloggede Minel-ansatte skal se konsernbildet, alle selskapers
// ordrereserve og prosjektlister. Denne er til INPUT-veier — altsaa naar noen
// skal endre data. Per i dag lagres prosjekter via broen minel-sp-bridge, som
// ikke kan endres, saa input-sperren finnes foreloepig kun i klienten.
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

  const b = await hentBrukerSelskap(raa, context);
  if (!b.ok) return loggOgSvar(false, b.grunn, b.epost ? ' bruker=' + b.epost : '');
  if (b.admin) return loggOgSvar(true, 'ok (admin)', ' bruker=' + b.epost);
  if (b.selskap === onsketSelskap) return loggOgSvar(true, 'ok', ` bruker=${b.epost} kilde=${b.kilde}`);
  return loggOgSvar(false, 'feil selskap', ` bruker=${b.epost} hoerer_til=${b.selskap}`);
}

module.exports = { sjekkTilgang, sjekkSelskap, hentBrukerSelskap, hentRaaToken, vurderToken, modus, TENANT, OFFICE_MAP };
