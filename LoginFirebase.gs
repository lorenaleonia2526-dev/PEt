/**
 * @fileoverview Autenticación Firebase para AG Operations.
 *
 * Firebase acredita la identidad mediante un ID token.
 * USERS determina si esa identidad tiene acceso a la aplicación.
 *
 * Estructura USERS:
 * A: nombre.
 * B: correo.
 * C: sin uso para el login.
 * D: UID de Firebase.
 * E: área.
 *
 * No guarda contraseñas ni modifica USERS.
 */

/**
 * Error controlado que puede comunicarse al navegador.
 */
class AgLoginFault extends Error {
  /**
   * @param {string} code Código del error.
   * @param {string} message Mensaje público.
   */
  constructor(code, message) {
    super(message);
    this.name = 'AgLoginFault';
    this.code = code;
  }
}

/**
 * Configura el proyecto Firebase y guarda el ID de la hoja vinculada.
 * Ejecutar una vez desde el editor del proyecto vinculado a la hoja.
 *
 * El sufijo "_" impide llamarla mediante google.script.run.
 *
 * @returns {{configured: boolean, projectId: string}}
 */
function configurarLoginFirebase_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  if (!spreadsheet || !spreadsheet.getSheetByName('USERS')) {
    throw new Error(
      'Ejecute esta función desde el proyecto vinculado ' +
      'a la hoja de operaciones que contiene USERS.'
    );
  }

  PropertiesService.getScriptProperties().setProperties(
    {
      AG_FIREBASE_API_KEY:
        'AIzaSyADfe1oPRRMHHncP1MqBprE2dZq9r0ORdM',

      AG_FIREBASE_PROJECT_ID:
        'peti-f72b0',

      AG_OPERATIONS_SPREADSHEET_ID:
        spreadsheet.getId()
    },
    false
  );

  return {
    configured: true,
    projectId: 'peti-f72b0'
  };
}

/**
 * Consulta pública utilizada por el login.
 *
 * Recibe exclusivamente el ID token obtenido después de que
 * Firebase valide el correo y la contraseña.
 *
 * @param {string} idToken Token de identidad de Firebase.
 * @returns {Object} Resultado de autenticación y autorización.
 */
function getUsuarioPorFirebase(idToken) {
  try {
    if (arguments.length !== 1) {
      throw agLoginAuthFault_();
    }

    const usuario = agLoginRequerirUsuario_(idToken);

    return Object.assign(
      { found: true },
      usuario
    );

  } catch (error) {
    const fault = agLoginPublicFault_(error);

    agLoginLogFault_(fault);

    return {
      found: false,
      code: fault.code,
      message: fault.message
    };
  }
}

/**
 * Comprueba identidad Firebase y autorización en USERS.
 *
 * Las funciones que consultan o modifican información protegida
 * deben ejecutar esta comprobación antes de acceder a los datos.
 *
 * @param {string} idToken Token de identidad de Firebase.
 * @returns {Object} Usuario autorizado.
 */
function agLoginRequerirUsuario_(idToken) {
  try {
    agLoginValidateTokenText_(idToken);

    const config = agLoginConfig_();

    const identity = agLoginVerifyFirebase_(
      idToken,
      config
    );

    return agLoginFindUser_(
      identity,
      config
    );

  } catch (error) {
    throw agLoginPublicFault_(error);
  }
}

/**
 * Obtiene la configuración del servidor.
 *
 * AG_LOGIN_REQUIRE_VERIFIED_EMAIL es opcional:
 * "true": exige correo verificado.
 * "false": no lo exige.
 *
 * @returns {Object} Configuración validada.
 */
function agLoginConfig_() {
  const properties = PropertiesService
    .getScriptProperties()
    .getProperties();

  const apiKey = (
    properties.AG_FIREBASE_API_KEY ||
    'AIzaSyADfe1oPRRMHHncP1MqBprE2dZq9r0ORdM'
  ).trim();

  const projectId = (
    properties.AG_FIREBASE_PROJECT_ID ||
    'peti-f72b0'
  ).trim();

  const spreadsheetId = (
    properties.AG_OPERATIONS_SPREADSHEET_ID || ''
  ).trim();

  const verification = (
    properties.AG_LOGIN_REQUIRE_VERIFIED_EMAIL || 'false'
  ).trim();

  if (
    !/^[A-Za-z0-9_-]{20,256}$/.test(apiKey) ||
    projectId !== 'peti-f72b0' ||
    !/^[A-Za-z0-9_-]{20,128}$/.test(spreadsheetId) ||
    !/^(true|false)$/.test(verification)
  ) {
    throw new AgLoginFault(
      'CONFIGURATION_ERROR',
      'El acceso no está configurado. Contacte al administrador.'
    );
  }

  return {
    apiKey: apiKey,
    projectId: projectId,
    spreadsheetId: spreadsheetId,
    requireVerifiedEmail: verification === 'true'
  };
}

/**
 * Rechaza entradas que no tienen formato de ID token.
 * Esta comprobación no acredita por sí sola la autenticidad.
 *
 * @param {string} idToken Token recibido.
 * @returns {void}
 */
function agLoginValidateTokenText_(idToken) {
  if (
    typeof idToken !== 'string' ||
    idToken.length < 100 ||
    idToken.length > 16384 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(idToken)
  ) {
    throw agLoginAuthFault_();
  }
}

/**
 * Decodifica un segmento del token.
 * Su contenido todavía no se considera confiable.
 *
 * @param {string} segment Segmento Base64 URL.
 * @returns {Object} Objeto decodificado.
 */
function agLoginDecodeObject_(segment) {
  try {
    const bytes = Utilities.base64DecodeWebSafe(segment);

    const text = Utilities
      .newBlob(bytes)
      .getDataAsString('UTF-8');

    const value = JSON.parse(text);

    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      throw agLoginAuthFault_();
    }

    return value;

  } catch (error) {
    throw agLoginAuthFault_();
  }
}

/**
 * Comprueba una fecha Unix expresada en segundos.
 *
 * @param {*} value Valor que se comprobará.
 * @returns {boolean}
 */
function agLoginTimestamp_(value) {
  return Number.isSafeInteger(value) && value > 0;
}

/**
 * Envía el token completo a Firebase para validar su autenticidad.
 * Comprueba también proyecto, vencimiento y estado de la cuenta.
 *
 * Solo admite autenticación mediante correo y contraseña.
 *
 * @param {string} idToken Token de identidad.
 * @param {Object} config Configuración del servidor.
 * @returns {Object} Identidad comprobada.
 */
function agLoginVerifyFirebase_(idToken, config) {
  const parts = idToken.split('.');

  const header = agLoginDecodeObject_(parts[0]);
  const payload = agLoginDecodeObject_(parts[1]);

  const now = Math.floor(Date.now() / 1000);
  const firebaseClaims = payload.firebase;

  if (
    header.alg !== 'RS256' ||
    typeof header.kid !== 'string' ||
    !header.kid ||
    header.kid.length > 256 ||

    payload.aud !== config.projectId ||
    payload.iss !==
      'https://securetoken.google.com/' + config.projectId ||

    typeof payload.sub !== 'string' ||
    !payload.sub ||
    payload.sub.length > 128 ||

    typeof payload.email !== 'string' ||
    !payload.email.trim() ||
    payload.email.length > 254 ||

    !agLoginTimestamp_(payload.exp) ||
    !agLoginTimestamp_(payload.iat) ||
    !agLoginTimestamp_(payload.auth_time) ||

    payload.exp <= now ||
    payload.iat > now + 60 ||
    payload.auth_time > now + 60 ||
    payload.auth_time > payload.iat + 60 ||
    payload.exp <= payload.iat ||

    !firebaseClaims ||
    typeof firebaseClaims !== 'object' ||
    Array.isArray(firebaseClaims) ||
    firebaseClaims.tenant !== undefined ||
    firebaseClaims.sign_in_provider !== 'password'
  ) {
    throw agLoginAuthFault_();
  }

  let response;

  try {
    const url =
      'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' +
      encodeURIComponent(config.apiKey);

    response = UrlFetchApp.fetch(
      url,
      {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({
          idToken: idToken
        }),
        muteHttpExceptions: true,
        followRedirects: false,
        validateHttpsCertificates: true
      }
    );

  } catch (error) {
    throw agLoginServiceFault_();
  }

  const status = response.getResponseCode();

  if (
    status === 400 ||
    status === 401 ||
    status === 403
  ) {
    throw agLoginAuthFault_();
  }

  if (status !== 200) {
    throw agLoginServiceFault_();
  }

  let body;

  try {
    const content = response.getContentText();

    if (content.length > 1048576) {
      throw agLoginServiceFault_();
    }

    body = JSON.parse(content);

  } catch (error) {
    throw agLoginServiceFault_();
  }

  if (
    !body ||
    typeof body !== 'object' ||
    !Array.isArray(body.users) ||
    body.users.length !== 1
  ) {
    throw agLoginAuthFault_();
  }

  const account = body.users[0];

  if (
    !account ||
    typeof account !== 'object' ||

    account.localId !== payload.sub ||

    typeof account.email !== 'string' ||
    !account.email.trim() ||
    account.email.length > 254 ||

    account.email.trim().toLowerCase() !==
      payload.email.trim().toLowerCase() ||

    account.disabled === true ||
    account.tenantId !== undefined ||

    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    throw agLoginAuthFault_();
  }

  /*
   * auth_time identifica cuándo se autenticó el usuario.
   * iat puede cambiar al renovar el token sin introducir
   * nuevamente la contraseña.
   */
  if (account.validSince !== undefined) {
    const validSince = String(account.validSince);

    if (
      !/^\d{1,12}$/.test(validSince) ||
      payload.auth_time < Number(validSince)
    ) {
      throw agLoginAuthFault_();
    }
  }

  if (
    config.requireVerifiedEmail &&
    account.emailVerified !== true
  ) {
    throw agLoginAccessFault_();
  }

  return {
    uid: account.localId,
    email: account.email.trim().toLowerCase(),
    emailVerified: account.emailVerified === true,
    expiresAt: payload.exp * 1000
  };
}

/**
 * Busca la identidad comprobada en USERS.
 *
 * Exige UID único y correo coincidente.
 * No permite acceder únicamente por coincidencia de correo.
 *
 * @param {Object} identity Identidad comprobada por Firebase.
 * @param {Object} config Configuración del servidor.
 * @returns {Object} Perfil autorizado.
 */
function agLoginFindUser_(identity, config) {
  const sheet = SpreadsheetApp
    .openById(config.spreadsheetId)
    .getSheetByName('USERS');

  if (!sheet || sheet.getLastColumn() < 5) {
    throw new AgLoginFault(
      'CONFIGURATION_ERROR',
      'El acceso no está configurado. Contacte al administrador.'
    );
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    throw agLoginAccessFault_();
  }

  const data = sheet
    .getRange(1, 1, lastRow, 5)
    .getDisplayValues();

  const missingHeader = [0, 1, 3, 4].some(
    function (index) {
      return !data[0][index].trim();
    }
  );

  if (missingHeader) {
    throw new AgLoginFault(
      'CONFIGURATION_ERROR',
      'El acceso no está configurado. Contacte al administrador.'
    );
  }

  let match = null;

  for (let index = 1; index < data.length; index++) {
    const row = data[index];

    if (row[3].trim() !== identity.uid) {
      continue;
    }

    if (match !== null) {
      throw agLoginAccessFault_();
    }

    match = row;
  }

  if (
    match === null ||
    !match[0].trim() ||
    !match[4].trim() ||
    match[1].trim().toLowerCase() !== identity.email ||
    identity.expiresAt <= Date.now()
  ) {
    throw agLoginAccessFault_();
  }

  return {
    nombre: match[0].trim(),
    area: match[4].trim(),
    email: identity.email,
    uid: identity.uid,
    emailVerified: identity.emailVerified,
    expiresAt: identity.expiresAt
  };
}

/**
 * Incluye el HTML del login desde el template principal.
 *
 * @returns {string} Contenido del login.
 */
function agIncluirLogin_() {
  return HtmlService
    .createTemplateFromFile('Login')
    .evaluate()
    .getContent();
}

/**
 * Incluye únicamente los archivos auxiliares del login.
 *
 * @param {string} filename Nombre del archivo HTML.
 * @returns {string} Contenido del archivo.
 */
function agIncluirLoginParte_(filename) {
  if (
    filename !== 'LoginStylesheet' &&
    filename !== 'LoginJavascript'
  ) {
    throw new Error('Archivo de login no permitido.');
  }

  return HtmlService
    .createHtmlOutputFromFile(filename)
    .getContent();
}

/**
 * Genera un error de autenticación.
 *
 * @returns {AgLoginFault}
 */
function agLoginAuthFault_() {
  return new AgLoginFault(
    'AUTH_REQUIRED',
    'AG_AUTH_REQUIRED: No fue posible acreditar la identidad. ' +
    'Inicie sesión nuevamente.'
  );
}

/**
 * Genera un error de autorización.
 *
 * @returns {AgLoginFault}
 */
function agLoginAccessFault_() {
  return new AgLoginFault(
    'ACCESS_DENIED',
    'AG_AUTH_REQUIRED: Esta cuenta no tiene acceso autorizado ' +
    'a AG Operations.'
  );
}

/**
 * Genera un error temporal del servicio.
 *
 * @returns {AgLoginFault}
 */
function agLoginServiceFault_() {
  return new AgLoginFault(
    'SERVICE_UNAVAILABLE',
    'No fue posible verificar el acceso. Inténtelo nuevamente.'
  );
}

/**
 * Evita enviar detalles internos de errores al navegador.
 *
 * @param {*} error Error recibido.
 * @returns {AgLoginFault}
 */
function agLoginPublicFault_(error) {
  return error instanceof AgLoginFault
    ? error
    : agLoginServiceFault_();
}

/**
 * Registra únicamente el código del fallo.
 * No registra contraseña, correo ni token.
 *
 * @param {AgLoginFault} fault Error controlado.
 * @returns {void}
 */
function agLoginLogFault_(fault) {
  console.warn(
    JSON.stringify({
      component: 'AG_LOGIN',
      code: fault.code
    })
  );
}
