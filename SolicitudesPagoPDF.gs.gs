/**
 * @fileoverview Acceso autenticado al documento imprimible de pago.
 * Conserva las veinte columnas, el logo y los datos de las dos copias.
 * El permiso de apertura es de un solo uso, limitado a un consecutivo.
 * El ID token se conserva únicamente en caché del servidor hasta 60 segundos;
 * nunca se incluye en la URL ni se registra en mensajes o logs.
 */

/** @typedef {{success:boolean, message?:string, consecutivo?:string, datos?:Object, logoDataUri?:string, pdfUrl?:string}} SpPdfRespuesta */
/** @typedef {{version:number, consecutivo:string, uid:string, idToken:string, expiresAt:number}} SpPdfPermiso */

const SPPDF_HOJA_SOLICITUDES = 'CUADRO_CONTROL_SOLICITUDES_DE_P';
const SPPDF_COLUMNAS = 20;
const SPPDF_LOGO_FILE_ID = '1vw0SnMLDVs6xBegBh7B8014unElJf1UA';
const SPPDF_ZONA_HORARIA = 'America/Bogota';
const SPPDF_PERMISO_SEGUNDOS = 60;
const SPPDF_CACHE_PREFIJO = 'AG_SP_PDF_V1_';

/** Error de negocio cuyo mensaje puede mostrarse. */
class SpPdfErrorPublico extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'SpPdfErrorPublico';
  }
}

/**
 * Consulta desde una sesión Firebase acreditada.
 * @param {string} idToken
 * @param {string} consecutivo
 * @returns {SpPdfRespuesta}
 */
function cargarSolicitudPagoPDF_SP(idToken, consecutivo) {
  if (arguments.length !== 2) { throw agLoginAuthFault_(); }
  agLoginRequerirUsuario_(idToken);
  try {
    return construirRespuestaSolicitudPDF_SP_(consecutivo);
  } catch (error) {
    return resolverErrorSolicitudPDF_SP_(error);
  }
}

/**
 * Consume el permiso de apertura y vuelve a comprobar el token en Firebase.
 * No acepta un consecutivo como prueba de identidad.
 * @param {string} permiso
 * @param {string} consecutivo
 * @returns {SpPdfRespuesta}
 */
function cargarSolicitudPagoPDFConPermiso_SP(permiso, consecutivo) {
  if (arguments.length !== 2) { throw agLoginAuthFault_(); }
  try {
    const grant = consumirPermisoSolicitudPDF_SP_(permiso, consecutivo);
    const usuario = agLoginRequerirUsuario_(grant.idToken);
    if (usuario.uid !== grant.uid || grant.expiresAt <= Date.now()) {
      throw agLoginAuthFault_();
    }
    return construirRespuestaSolicitudPDF_SP_(grant.consecutivo);
  } catch (error) {
    return resolverErrorSolicitudPDF_SP_(error);
  }
}

/**
 * Alias autenticado para las llamadas existentes de apertura.
 * @param {string} idToken
 * @param {string} consecutivo
 * @returns {SpPdfRespuesta}
 */
function abrirSolicitudPagoPDF_SP(idToken, consecutivo) {
  if (arguments.length !== 2) { throw agLoginAuthFault_(); }
  return cargarSolicitudPagoPDF_SP(idToken, consecutivo);
}

/**
 * Autoriza una nueva apertura de una solicitud existente.
 * @param {string} idToken
 * @param {string} consecutivo
 * @returns {SpPdfRespuesta}
 */
function obtenerUrlReimpresionSolicitudPagoPDF_SP(idToken, consecutivo) {
  if (arguments.length !== 2) { throw agLoginAuthFault_(); }
  const usuario = agLoginRequerirUsuario_(idToken);
  try {
    const limpio = normalizarConsecutivoSolicitudPDF_SP_(consecutivo);
    if (!obtenerDatosSolicitudPDF_SP_(limpio)) {
      throw new SpPdfErrorPublico('No se encontró la solicitud ' + limpio + '.');
    }
    return {
      success: true,
      consecutivo: limpio,
      pdfUrl: obtenerUrlSolicitudPagoPDF_SP_(limpio, idToken, usuario)
    };
  } catch (error) {
    return resolverErrorSolicitudPDF_SP_(error);
  }
}

/**
 * Función privada. Sus llamadores deben aportar el usuario ya acreditado.
 * Emite un permiso limitado al documento y al vencimiento del token.
 * @param {string} consecutivo
 * @param {string} idToken
 * @param {{uid:string, expiresAt:number}} usuario
 * @returns {string}
 */
function obtenerUrlSolicitudPagoPDF_SP_(consecutivo, idToken, usuario) {
  const limpio = normalizarConsecutivoSolicitudPDF_SP_(consecutivo);
  agLoginValidateTokenText_(idToken);
  if (!usuario || typeof usuario.uid !== 'string' || !usuario.uid ||
      !Number.isFinite(usuario.expiresAt) || usuario.expiresAt <= Date.now()) {
    throw agLoginAuthFault_();
  }
  const baseUrl = ScriptApp.getService().getUrl();
  if (!baseUrl) {
    throw new SpPdfErrorPublico('No fue posible obtener la URL de la aplicación.');
  }
  const permiso = (Utilities.getUuid() + Utilities.getUuid())
    .replace(/-/g, '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(permiso)) {
    throw agLoginServiceFault_();
  }
  const now = Date.now();
  const expiresAt = Math.min(now + SPPDF_PERMISO_SEGUNDOS * 1000, usuario.expiresAt);
  if (expiresAt <= now) { throw agLoginAuthFault_(); }
  /** @type {SpPdfPermiso} */
  const grant = {
    version: 1, consecutivo: limpio, uid: usuario.uid, idToken: idToken,
    expiresAt: expiresAt
  };
  CacheService.getScriptCache().put(
    SPPDF_CACHE_PREFIJO + permiso,
    JSON.stringify(grant),
    Math.max(1, Math.ceil((expiresAt - now) / 1000))
  );
  return baseUrl + '?page=solicitudPagoPDF&consecutivo=' +
    encodeURIComponent(limpio) + '&permiso=' + encodeURIComponent(permiso);
}

/**
 * Lee y elimina el permiso bajo lock para impedir dos consumos concurrentes.
 * Una entrada ausente o vencida no permite consultar datos de la solicitud.
 * @param {string} permiso
 * @param {string} consecutivo
 * @returns {SpPdfPermiso}
 */
function consumirPermisoSolicitudPDF_SP_(permiso, consecutivo) {
  if (typeof permiso !== 'string' || !/^[a-f0-9]{64}$/.test(permiso)) {
    throw agLoginAuthFault_();
  }
  const limpio = normalizarConsecutivoSolicitudPDF_SP_(consecutivo);
  const cache = CacheService.getScriptCache();
  const lock = LockService.getScriptLock();
  let adquirido = false;
  try {
    if (!lock.tryLock(5000)) { throw agLoginServiceFault_(); }
    adquirido = true;
    const key = SPPDF_CACHE_PREFIJO + permiso;
    const text = cache.get(key);
    if (!text || text.length > 20000) { throw agLoginAuthFault_(); }
    /** @type {SpPdfPermiso} */
    let grant;
    try {
      grant = JSON.parse(text);
    } catch (error) {
      cache.remove(key);
      throw agLoginAuthFault_();
    }
    if (!grant || grant.version !== 1 || grant.consecutivo !== limpio ||
        typeof grant.uid !== 'string' || !grant.uid ||
        typeof grant.idToken !== 'string' ||
        !Number.isFinite(grant.expiresAt) || grant.expiresAt <= Date.now()) {
      throw agLoginAuthFault_();
    }
    cache.remove(key);
    return grant;
  } finally {
    if (adquirido) { lock.releaseLock(); }
  }
}

/** @param {string} consecutivo @returns {string} */
function normalizarConsecutivoSolicitudPDF_SP_(consecutivo) {
  if (typeof consecutivo !== 'string') {
    throw new SpPdfErrorPublico('No se recibió un consecutivo válido.');
  }
  const limpio = consecutivo.trim().toUpperCase();
  if (!/^SOL-PG\d{1,16}$/.test(limpio)) {
    throw new SpPdfErrorPublico('No se recibió un consecutivo válido.');
  }
  return limpio;
}

/** @param {string} consecutivo @returns {SpPdfRespuesta} */
function construirRespuestaSolicitudPDF_SP_(consecutivo) {
  const limpio = normalizarConsecutivoSolicitudPDF_SP_(consecutivo);
  const datos = obtenerDatosSolicitudPDF_SP_(limpio);
  if (!datos) {
    throw new SpPdfErrorPublico('No se encontró la solicitud ' + limpio + '.');
  }
  return {
    success: true, consecutivo: limpio, datos: datos,
    logoDataUri: obtenerLogoSolicitudPagoPDF_SP_()
  };
}

/** @param {unknown} error @returns {SpPdfRespuesta} */
function resolverErrorSolicitudPDF_SP_(error) {
  if (error instanceof AgLoginFault) { throw error; }
  return {
    success: false,
    message: error instanceof SpPdfErrorPublico ? error.message :
      'No fue posible preparar el documento. Vuelva a abrirlo desde la aplicación.'
  };
}

/**
 * A:T: mes, semana, fecha, consecutivo, referencia, cliente, USD, EUR, COP,
 * pago, solicita, fecha pago, beneficiario, NIT, área, BL, contenedor,
 * servicio, D.O. y observaciones.
 * @param {string} consecutivo
 * @returns {Object|null}
 */
function obtenerDatosSolicitudPDF_SP_(consecutivo) {
  const sheet = SpreadsheetApp.openById(agLoginConfig_().spreadsheetId)
    .getSheetByName(SPPDF_HOJA_SOLICITUDES);
  if (!sheet) {
    throw new SpPdfErrorPublico('No existe la hoja ' + SPPDF_HOJA_SOLICITUDES + '.');
  }
  const ultimaFila = sheet.getLastRow();
  if (ultimaFila < 2) { return null; }
  const data = sheet.getRange(2, 1, ultimaFila - 1, SPPDF_COLUMNAS).getValues();
  const buscado = normalizarConsecutivoSolicitudPDF_SP_(consecutivo);
  for (let i = data.length - 1; i >= 0; i--) {
    const fila = data[i];
    if (limpiarTextoPDF_SP_(fila[3]).toUpperCase() !== buscado) { continue; }
    return {
      mes: limpiarTextoPDF_SP_(fila[0]),
      semana: limpiarTextoPDF_SP_(fila[1]),
      fechaSolicitud: formatearFechaPDF_SP_(fila[2]),
      consecutivo: limpiarTextoPDF_SP_(fila[3]),
      referenciaAg: limpiarTextoPDF_SP_(fila[4]),
      cliente: limpiarTextoPDF_SP_(fila[5]),
      usd: normalizarImportePDF_SP_(fila[6]),
      eur: normalizarImportePDF_SP_(fila[7]),
      cop: normalizarImportePDF_SP_(fila[8]),
      tipoPago: normalizarTipoPagoPDF_SP_(fila[9]),
      personaSolicita: limpiarTextoPDF_SP_(fila[10]),
      fechaPago: formatearFechaPDF_SP_(fila[11]),
      beneficiario: limpiarTextoPDF_SP_(fila[12]),
      nit: limpiarTextoPDF_SP_(fila[13]),
      area: limpiarTextoPDF_SP_(fila[14]),
      documentoTransporte: limpiarTextoPDF_SP_(fila[15]),
      contenedor: limpiarTextoPDF_SP_(fila[16]),
      servicio: limpiarTextoPDF_SP_(fila[17]),
      doNumber: limpiarTextoPDF_SP_(fila[18]),
      observaciones: limpiarTextoPDF_SP_(fila[19])
    };
  }
  return null;
}

/** @returns {string} */
function obtenerLogoSolicitudPagoPDF_SP_() {
  return 'https://lh3.googleusercontent.com/d/' + SPPDF_LOGO_FILE_ID;
}

/** @param {*} valor @returns {string} */
function formatearFechaPDF_SP_(valor) {
  if (!valor) { return ''; }
  if (Object.prototype.toString.call(valor) === '[object Date]' && !isNaN(valor.getTime())) {
    return Utilities.formatDate(valor, SPPDF_ZONA_HORARIA, 'dd/MM/yyyy');
  }
  const texto = String(valor).trim();
  const iso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return ('0' + iso[3]).slice(-2) + '/' + ('0' + iso[2]).slice(-2) + '/' + iso[1];
  }
  return texto;
}

/** @param {*} valor @returns {string|number} */
function normalizarImportePDF_SP_(valor) {
  if (valor === '' || valor === null || valor === undefined) { return ''; }
  if (typeof valor === 'number') { return valor; }
  const texto = String(valor).trim();
  if (!texto) { return ''; }
  const numero = Number(texto.replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
  return isNaN(numero) ? texto : numero;
}

/** @param {*} valor @returns {string} */
function normalizarTipoPagoPDF_SP_(valor) {
  const texto = limpiarTextoPDF_SP_(valor);
  const mayusculas = texto.toUpperCase();
  if (mayusculas.indexOf('PSE') !== -1 || mayusculas.indexOf('PÁGINA') !== -1 ||
      mayusculas.indexOf('PAGINA') !== -1) { return 'PSE'; }
  if (mayusculas.indexOf('TRANSFER') !== -1) { return 'TRANSFERENCIA'; }
  return texto;
}

/** @param {*} valor @returns {string} */
function limpiarTextoPDF_SP_(valor) {
  return valor === null || valor === undefined ? '' : String(valor).trim();
}

/**
 * Devuelve solamente la interfaz del documento. Sus datos se consultan
 * mediante los endpoints autenticados o el permiso de un solo uso.
 * @param {string} consecutivo
 * @returns {GoogleAppsScript.HTML.HtmlOutput}
 */
function servirSolicitudPagoPDF_SP_(consecutivo) {
  const limpio = normalizarConsecutivoSolicitudPDF_SP_(consecutivo);
  const template = HtmlService.createTemplateFromFile('solicitudPagoPDF');
  template.consecutivo = limpio;
  return template.evaluate()
    .setTitle('Solicitud de Pago ' + limpio)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
