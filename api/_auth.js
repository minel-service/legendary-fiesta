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

module.exports = { sjekkTilgang, vurderToken, modus, TENANT };
