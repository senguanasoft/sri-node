import fetch from 'node-fetch';
import { CookieJar } from 'tough-cookie';
import fetchCookie from 'fetch-cookie';
import { decode } from 'html-entities';

// ==============================
// CONFIG GLOBAL
// ==============================
const jar = new CookieJar();
const fetchWithCookies = fetchCookie(fetch, jar);

// ==============================
// VALIDACIONES
// ==============================
function validarRuc(ruc) {
    if (!ruc) throw new Error("RUC requerido");
    if (ruc.length !== 13) throw new Error("RUC debe tener 13 dígitos");
}

function validarCedula(cedula) {
    if (!cedula) throw new Error("Cédula requerida");
    if (cedula.length !== 10) throw new Error("Cédula debe tener 10 dígitos");
}

// ==============================
// INIT SESSION (IMPORTANTE)
// ==============================
async function initSession() {
    await fetchWithCookies('https://srienlinea.sri.gob.ec/', {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
}

// ==============================
// EXISTENCIA RUC
// ==============================
async function existeRuc(ruc) {
    const res = await fetchWithCookies(
        `https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/ConsolidadoContribuyente/existePorNumeroRuc?numeroRuc=${ruc}`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );

    const text = decode(await res.text());

    if (text !== 'true') throw new Error("RUC no existe");
}

// ==============================
// EXISTENCIA CÉDULA
// ==============================
async function existeCedula(cedula) {
    const res = await fetchWithCookies(
        `https://srienlinea.sri.gob.ec/sri-registro-civil-servicio-internet/rest/DatosRegistroCivil/existeNumeroIdentificacion?numeroIdentificacion=${cedula}`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );

    const text = decode(await res.text());

    if (text !== 'true') throw new Error("Cédula no existe");
}

// ==============================
// TOKEN AUTOMÁTICO (CÉDULA)
// ==============================
async function obtenerToken() {

    const res = await fetchWithCookies(
        'https://srienlinea.sri.gob.ec/sri-captcha-servicio-internet/rest/ValidarCaptcha/validarCaptcha',
        {
            method: 'POST',
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ codigo: "" })
        }
    );

    const text = decode(await res.text());

    console.log("\n🔐 TOKEN RAW:\n", text);

    const data = JSON.parse(text);

    if (!data.mensaje) {
        throw new Error("No se pudo obtener token");
    }

    return data.mensaje;
}

// ==============================
// CONSULTAR RUC
// ==============================
async function getRuc(ruc, tokenSri = null) {

    validarRuc(ruc);
    await initSession();
    await existeRuc(ruc);

    const res = await fetchWithCookies(
        `https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/ConsolidadoContribuyente/obtenerPorNumerosRuc?ruc=${ruc}`,
        {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/json',
                ...(tokenSri && { Authorization: tokenSri })
            }
        }
    );

    const text = await res.text();
    const decoded = decode(text);

    console.log("\n📥 RAW RUC:\n", decoded);

    if (decoded.includes('<html')) {
        throw new Error("Respuesta inválida (HTML)");
    }

    const data = JSON.parse(decoded);

    if (!data || data.length === 0) {
        throw new Error("No existe contribuyente");
    }

    return data[0];
}

// ==============================
// CONSULTAR CÉDULA
// ==============================
async function getCedula(cedula) {

    validarCedula(cedula);
    await initSession();
    await existeCedula(cedula);

    const token = await obtenerToken();

    console.log("🔑 TOKEN:", token);

    const res = await fetchWithCookies(
        `https://srienlinea.sri.gob.ec/sri-registro-civil-servicio-internet/rest/DatosRegistroCivil/obtenerDatosCompletosPorNumeroIdentificacionConToken?numeroIdentificacion=${cedula}`,
        {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/json',
                'Authorization': token,
                'Referer': 'https://srienlinea.sri.gob.ec/',
                'Origin': 'https://srienlinea.sri.gob.ec'
            }
        }
    );

    let text = await res.text();
    let decoded = decode(text);

    console.log("\n📥 RAW CÉDULA:\n", decoded);

    if (decoded.includes('Acceso denegado')) {
        throw new Error("SRI bloqueó (token inválido)");
    }

    decoded = decoded.replace(/^\[/, '').replace(/\]$/, '');

    return JSON.parse(decoded);
}

// ==============================
// TEST
// ==============================
async function main() {
    try {

        console.log("\n========== RUC ==========");
        const ruc = await getRuc("1790241483001");
        console.log("✅ RUC:", ruc);

        console.log("\n========== CÉDULA ==========");
        const cedula = await getCedula("0102030405");
        console.log("✅ CÉDULA:", cedula);

    } catch (err) {
        console.error("\n❌ ERROR:", err.message);
    }
}

main();