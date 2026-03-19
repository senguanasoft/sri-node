import express from 'express';
import fetch from 'node-fetch';
import { CookieJar } from 'tough-cookie';
import fetchCookie from 'fetch-cookie';
import { decode } from 'html-entities';

// CONFIG
const jar = new CookieJar();
const fetchWithCookies = fetchCookie(fetch, jar);

const app = express();
const PORT = process.env.PORT || 3000;

// FUNCIONES
function validarRuc(ruc) {
    if (!ruc) throw new Error("RUC requerido");
    if (ruc.length !== 13) throw new Error("RUC debe tener 13 dígitos");
}

async function initSession() {
    await fetchWithCookies('https://srienlinea.sri.gob.ec/', {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
}

async function existeRuc(ruc) {
    const res = await fetchWithCookies(
        `https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/ConsolidadoContribuyente/existePorNumeroRuc?numeroRuc=${ruc}`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );

    const text = decode(await res.text());

    if (text !== 'true') throw new Error("RUC no existe");
}

// FUNCION PRINCIPAL RUC
async function getRuc(ruc) {
    validarRuc(ruc);
    await initSession();
    await existeRuc(ruc);

    const res = await fetchWithCookies(
        `https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/ConsolidadoContribuyente/obtenerPorNumerosRuc?ruc=${ruc}`,
        {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/json'
            }
        }
    );

    const text = await res.text();
    const decoded = decode(text);

    if (decoded.includes('<html')) {
        throw new Error("Respuesta inválida (HTML)");
    }

    const data = JSON.parse(decoded);

    if (!data || data.length === 0) {
        throw new Error("No existe contribuyente");
    }

    return data[0];
}

// RUTA API
app.get('/ruc/:ruc', async (req, res) => {
    try {
        const data = await getRuc(req.params.ruc);
        res.json({ success: true, value: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// START
app.listen(PORT, () => {
    console.log(`Servidor Node corriendo en puerto ${PORT}`);
});