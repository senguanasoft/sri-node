import express from 'express';
import axios from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import { decode } from 'html-entities';

const app = express();
app.use(express.json());

/**
 * Clase tipo Result como en C#
 */
class Result {
    constructor(success, value = null, error = null) {
        this.success = success;
        this.value = value;
        this.error = error;
    }
    static ok(value) { return new Result(true, value, null); }
    static fail(error) { return new Result(false, null, error); }
}

/**
 * Cliente axios con cookies
 */
function createClient() {
    const jar = new CookieJar();
    return wrapper(axios.create({
        jar,
        withCredentials: true,
        timeout: 10000,
        transformResponse: [(data) => data] // 👈 CLAVE
    }));
}

/**
 * =========================
 * 🔍 VALIDACIONES
 * =========================
 */
function validateRuc(ruc) {
    if (!ruc) return "RUC requerido";
    if (ruc.length !== 13) return "RUC debe tener 13 dígitos";
    return null;
}

function validateCedula(cedula) {
    if (!cedula) return "Cédula requerida";
    if (cedula.length !== 10) return "Cédula debe tener 10 dígitos";
    return null;
}

/**
 * =========================
 * 🔍 EXISTENCIA RUC
 * =========================
 */
async function checkRucExistence(ruc) {
    try {
        const res = await axios.get(
            `https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/ConsolidadoContribuyente/existePorNumeroRuc?numeroRuc=${ruc}`,
            { headers: { 'User-Agent': 'Mozilla/5.0' } }
        );

        if (decode(res.data) === 'true') return Result.ok(true);

        return Result.fail({ code: 'RUC_NOT_FOUND', message: 'RUC no existe' });

    } catch {
        return Result.fail({ code: 'RUC_CHECK_ERROR', message: 'Error verificando RUC' });
    }
}

/**
 * =========================
 * 🔍 EXISTENCIA CÉDULA
 * =========================
 */
async function checkCedulaExistence(cedula) {
    try {
        const res = await axios.get(
            `https://srienlinea.sri.gob.ec/sri-registro-civil-servicio-internet/rest/DatosRegistroCivil/existeNumeroIdentificacion?numeroIdentificacion=${cedula}`,
            { headers: { 'User-Agent': 'Mozilla/5.0' } }
        );

        if (decode(res.data) === 'true') return Result.ok(true);

        return Result.fail({ code: 'CEDULA_NOT_FOUND', message: 'Cédula no existe' });

    } catch {
        return Result.fail({ code: 'CEDULA_CHECK_ERROR', message: 'Error verificando cédula' });
    }
}

/**
 * =========================
 * 📡 CONSULTAR RUC
 * =========================
 */
async function fetchRuc(ruc, tokenSri) {
    const client = createClient();

    try {
        const res = await client.get(
            `https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/ConsolidadoContribuyente/obtenerPorNumerosRuc?&ruc=${ruc}`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': 'application/json',
                    'Authorization': tokenSri
                }
            }
        );

        const text = decode(res.data);
        console.log("RUC RAW:", text);

        let data;
        try {
            data = JSON.parse(text);
        } catch {
            return Result.fail({ code: 'INVALID_RESPONSE', message: 'SRI devolvió HTML (captcha/token inválido)' });
        }

        if (!data || data.length === 0 || data[0].NumeroRuc !== ruc) {
            return Result.fail({ code: 'RUC_NOT_FOUND', message: 'No existe contribuyente' });
        }

        return Result.ok(data[0]);

    } catch (err) {
        return Result.fail({ code: 'RUC_FETCH_ERROR', message: err.message });
    }
}

/**
 * =========================
 * 📡 CONSULTAR CÉDULA
 * =========================
 */
async function fetchCedula(cedula, tokenSri) {
    const client = createClient();

    try {
        const res = await client.get(
            `https://srienlinea.sri.gob.ec/sri-registro-civil-servicio-internet/rest/DatosRegistroCivil/obtenerDatosCompletosPorNumeroIdentificacionConToken?numeroIdentificacion=${cedula}`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': 'application/json',
                    'Authorization': tokenSri
                }
            }
        );

        let text = decode(res.data);
        console.log("CEDULA RAW:", text);

        text = text.replace(/^\[/, '').replace(/\]$/, '');

        let data;
        try {
            data = JSON.parse(text);
        } catch {
            return Result.fail({ code: 'INVALID_RESPONSE', message: 'SRI devolvió HTML (captcha/token inválido)' });
        }

        return Result.ok(data);

    } catch (err) {
        return Result.fail({ code: 'CEDULA_FETCH_ERROR', message: err.message });
    }
}

/**
 * =========================
 * 🌐 ENDPOINT RUC
 * =========================
 */
app.get('/ruc/:ruc', async (req, res) => {
    const { ruc } = req.params;
    const tokenSri = req.query.token; // 👈 pasas token aquí

    const validation = validateRuc(ruc);
    if (validation) return res.json(Result.fail({ code: 'VALIDATION', message: validation }));

    const exists = await checkRucExistence(ruc);
    if (!exists.success) return res.json(exists);

    const result = await fetchRuc(ruc, tokenSri);
    res.json(result);
});

/**
 * =========================
 * 🌐 ENDPOINT CÉDULA
 * =========================
 */
app.get('/cedula/:cedula', async (req, res) => {
    const { cedula } = req.params;
    const tokenSri = req.query.token;

    const validation = validateCedula(cedula);
    if (validation) return res.json(Result.fail({ code: 'VALIDATION', message: validation }));

    const exists = await checkCedulaExistence(cedula);
    if (!exists.success) return res.json(exists);

    const result = await fetchCedula(cedula, tokenSri);
    res.json(result);
});

/**
 * =========================
 * 🚀 START SERVER
 * =========================
 */
app.listen(3000, () => {
    console.log('🔥 API SRI corriendo en http://localhost:3000');
});