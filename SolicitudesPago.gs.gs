/** @fileoverview AG Operations: solicitudes con identidad Firebase acreditada. */

const SP_HOJA_SOLICITUDES = 'CUADRO_CONTROL_SOLICITUDES_DE_P';

const SP_HOJA_TERCEROS = 'LISTADO_CLIENTES_PROVEEDORES';

const SP_HOJA_USUARIOS = 'USERS';

const SP_COLUMNAS_SOLICITUDES = 20;

/**

 * @typedef {Object} SpTerceroInicial

 * @property {string} id

 * @property {string} nombre

 * @property {string} nit

 * @property {string} estado

 * @property {string} tipo

 */

/**

 * Carga usuario, proveedores y clientes tras validar el token.

 *

 * @param {string} idToken Token de identidad de Firebase.

 * @returns {{

 *   success: boolean,

 *   usuario?: Object,

 *   proveedores?: SpTerceroInicial[],

 *   clientes?: SpTerceroInicial[],

 *   message?: string

 * }}

 */

function getDatosInicialesSolicitud_SP(idToken) {

  if (arguments.length !== 1) {

    throw agLoginAuthFault_();

  }

  const usuario = obtenerUsuarioSolicitud_SP_(idToken);

  try {

    const ss = SpreadsheetApp.openById(

      agLoginConfig_().spreadsheetId

    );

    const sheetTerceros = ss.getSheetByName(

      SP_HOJA_TERCEROS

    );

    if (!sheetTerceros) {

      return {

        success: false,

        message: 'No existe la hoja LISTADO_CLIENTES_PROVEEDORES.'

      };

    }

    const ultimaFila = sheetTerceros.getLastRow();

    /** @type {SpTerceroInicial[]} */

    const proveedores = [];

    /** @type {SpTerceroInicial[]} */

    const clientes = [];

    if (ultimaFila >= 2) {

      const data = sheetTerceros

        .getRange(2, 1, ultimaFila - 1, 5)

        .getValues();

      data.forEach(function (fila) {

        const id = fila[0]

          ? String(fila[0]).trim()

          : '';

        const nombre = fila[1]

          ? String(fila[1]).trim()

          : '';

        const nit = fila[2]

          ? String(fila[2]).trim()

          : '';

        const estado = fila[3]

          ? String(fila[3]).trim()

          : '';

        const tipo = fila[4]

          ? String(fila[4]).trim().toUpperCase()

          : '';

        if (

          !nombre ||

          estado.toUpperCase() === 'INACTIVO'

        ) {

          return;

        }

        const registro = {

          id: id,

          nombre: nombre,

          nit: nit,

          estado: estado,

          tipo: tipo

        };

        if (tipo.indexOf('PROVEEDOR') !== -1) {

          proveedores.push(registro);

        }

        if (tipo.indexOf('CLIENTE') !== -1) {

          clientes.push(registro);

        }

      });

    }

    return {

      success: true,

      usuario: usuario,

      proveedores: proveedores,

      clientes: clientes

    };

  } catch (error) {

    return {

      success: false,

      message: 'No fue posible cargar la información inicial.'

    };

  }

}

/**

 * Devuelve las solicitudes del mes actual y del mes inmediatamente anterior.

 * La consulta es de solo lectura y exige un usuario autenticado registrado

 * en la hoja USERS.

 */

/**

 * @typedef {Object} SpRegistroHistorial

 * @property {number} fila

 * @property {number} fechaOrden

 * @property {string} fechaSolicitud

 * @property {string} consecutivo

 * @property {string} referenciaAg

 * @property {string} cliente

 * @property {number} usd

 * @property {number} eur

 * @property {number} cop

 * @property {string} fechaPago

 * @property {string} beneficiario

 * @property {string} personaSolicita

 * @property {string} documentoTransporte

 * @property {string} servicio

 */

/**

 * Consulta las solicitudes del mes actual y del anterior.

 * Valida la identidad antes de acceder a los registros.

 *

 * @param {string} idToken Token de identidad de Firebase.

 * @returns {{

 *   success: boolean,

 *   registros?: SpRegistroHistorial[],

 *   total?: number,

 *   periodos?: Array<{clave: string, etiqueta: string}>,

 *   message?: string

 * }}

 */

function listarSolicitudesPago_SP(idToken) {

  if (arguments.length !== 1) {

    throw agLoginAuthFault_();

  }

  obtenerUsuarioSolicitud_SP_(idToken);

  try {

    const ss = SpreadsheetApp.openById(

      agLoginConfig_().spreadsheetId

    );

    const sheet = ss.getSheetByName(

      SP_HOJA_SOLICITUDES

    );

    if (!sheet) {

      return {

        success: false,

        message: 'No existe la hoja ' + SP_HOJA_SOLICITUDES + '.'

      };

    }

    const zonaHoraria =

      ss.getSpreadsheetTimeZone() ||

      Session.getScriptTimeZone() ||

      'America/Bogota';

    const ahora = new Date();

    const fechaMesAnterior = new Date(

      ahora.getFullYear(),

      ahora.getMonth() - 1,

      1

    );

    const claveMesActual = Utilities.formatDate(

      ahora,

      zonaHoraria,

      'yyyy-MM'

    );

    const claveMesAnterior = Utilities.formatDate(

      fechaMesAnterior,

      zonaHoraria,

      'yyyy-MM'

    );

    const periodos = [

      crearPeriodoListadoSolicitud_SP_(

        fechaMesAnterior,

        zonaHoraria

      ),

      crearPeriodoListadoSolicitud_SP_(

        ahora,

        zonaHoraria

      )

    ];

    const ultimaFila = sheet.getLastRow();

    if (ultimaFila < 2) {

      return {

        success: true,

        registros: [],

        total: 0,

        periodos: periodos

      };

    }

    const data = sheet

      .getRange(

        2,

        1,

        ultimaFila - 1,

        SP_COLUMNAS_SOLICITUDES

      )

      .getValues();

    /** @type {SpRegistroHistorial[]} */

    const registros = [];

    data.forEach(function (fila, indice) {

      const fechaSolicitud =

        normalizarFechaListadoSolicitud_SP_(fila[2]);

      if (!fechaSolicitud) {

        return;

      }

      const claveMesFila = Utilities.formatDate(

        fechaSolicitud,

        zonaHoraria,

        'yyyy-MM'

      );

      if (

        claveMesFila !== claveMesActual &&

        claveMesFila !== claveMesAnterior

      ) {

        return;

      }

      registros.push({

        fila: indice + 2,

        fechaOrden: fechaSolicitud.getTime(),

        fechaSolicitud: Utilities.formatDate(

          fechaSolicitud,

          zonaHoraria,

          'dd/MM/yyyy'

        ),

        consecutivo: limpiarTextoSolicitud_SP_(fila[3]),

        referenciaAg: limpiarTextoSolicitud_SP_(fila[4]),

        cliente: limpiarTextoSolicitud_SP_(fila[5]),

        usd: convertirValorSolicitud_SP_(fila[6]),

        eur: convertirValorSolicitud_SP_(fila[7]),

        cop: convertirValorSolicitud_SP_(fila[8]),

        fechaPago: fila[11]

          ? formatearFechaListadoSolicitud_SP_(

              fila[11],

              zonaHoraria

            )

          : '',

        beneficiario: limpiarTextoSolicitud_SP_(fila[12]),

        personaSolicita: limpiarTextoSolicitud_SP_(fila[10]),

        documentoTransporte: limpiarTextoSolicitud_SP_(fila[15]),

        servicio: limpiarTextoSolicitud_SP_(fila[17])

      });

    });

    registros.sort(function (a, b) {

      if (b.fechaOrden !== a.fechaOrden) {

        return b.fechaOrden - a.fechaOrden;

      }

      return b.fila - a.fila;

    });

    return {

      success: true,

      registros: registros,

      total: registros.length,

      periodos: periodos

    };

  } catch (error) {

    return {

      success: false,

      message: 'No fue posible consultar las solicitudes.'

    };

  }

}

/** @param {Date} fecha @param {string} zonaHoraria @returns {{clave:string,etiqueta:string}} */

function crearPeriodoListadoSolicitud_SP_(fecha, zonaHoraria) {

  const meses = [

    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',

    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'

  ];

  return {

    clave: Utilities.formatDate(fecha, zonaHoraria, 'yyyy-MM'),

    etiqueta:

      meses[Number(Utilities.formatDate(fecha, zonaHoraria, 'M')) - 1] +

      ' ' +

      Utilities.formatDate(fecha, zonaHoraria, 'yyyy')

  };

}

/** @param {*} valor @returns {Date|null} */

function normalizarFechaListadoSolicitud_SP_(valor) {

  if (!valor) {

    return null;

  }

  if (

    Object.prototype.toString.call(valor) === '[object Date]' &&

    !isNaN(valor.getTime())

  ) {

    return valor;

  }

  const texto = String(valor).trim();

  let match = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (match) {

    const fechaLatina = new Date(

      Number(match[3]),

      Number(match[2]) - 1,

      Number(match[1])

    );

    return isNaN(fechaLatina.getTime())

      ? null

      : fechaLatina;

  }

  match = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (match) {

    const fechaIso = new Date(

      Number(match[1]),

      Number(match[2]) - 1,

      Number(match[3])

    );

    return isNaN(fechaIso.getTime())

      ? null

      : fechaIso;

  }

  const fecha = new Date(texto);

  return isNaN(fecha.getTime())

    ? null

    : fecha;

}

/** @param {*} valor @param {string} zonaHoraria @returns {string} */

function formatearFechaListadoSolicitud_SP_(valor, zonaHoraria) {

  const fecha = normalizarFechaListadoSolicitud_SP_(valor);

  if (!fecha) {

    return limpiarTextoSolicitud_SP_(valor);

  }

  return Utilities.formatDate(

    fecha,

    zonaHoraria,

    'dd/MM/yyyy'

  );

}

/**

 * @param {string} idToken

 * @returns {{found:boolean,nombre:string,email:string,uid:string,area:string,expiresAt:number}}

 */

function obtenerUsuarioSolicitud_SP_(idToken) {

  const usuario = agLoginRequerirUsuario_(idToken);

  return Object.assign({found: true}, usuario);

}

  /**

 * @typedef {Object} SpDatosSolicitud

 * @property {string} referenciaAg

 * @property {string} cliente

 * @property {string} tipoPago

 * @property {string} beneficiario

 * @property {string} fechaPago

 * @property {string} area

 * @property {string} docTransporte

 * @property {string} contenedor

 * @property {string} servicio

 * @property {string} moneda

 * @property {string|number} valor

 * @property {string} doNumber

 * @property {string} observaciones

 */

/**

 * Guarda una solicitud utilizando la identidad acreditada.

 * El solicitante se obtiene del servidor, no de datos.uid,

 * datos.email ni de un nombre enviado por el navegador.

 *

 * @param {string} idToken Token de identidad de Firebase.

 * @param {SpDatosSolicitud} datos Datos del formulario.

 * @returns {{

 *   success: boolean,

 *   message: string,

 *   consecutivo?: string,

 *   referenciaAg?: string,

 *   pdfUrl?: string,

 *   fila?: number

 * }}

 */

function guardarSolicitudPago_SP(idToken, datos) {

  if (arguments.length !== 2) {

    throw agLoginAuthFault_();

  }

  const usuario = obtenerUsuarioSolicitud_SP_(idToken);

  const lock = LockService.getScriptLock();

  let lockAdquirido = false;

  let mensajeValidacion = '';

  /**

   * Marca únicamente errores de validación que pueden mostrarse.

   *

   * @param {boolean} condicion

   * @param {string} mensaje

   * @returns {void}

   */

  function exigir(condicion, mensaje) {

    if (!condicion) {

      mensajeValidacion = mensaje;

      throw new Error(mensaje);

    }

  }

  try {

    exigir(

      !!datos &&

      typeof datos === 'object' &&

      !Array.isArray(datos),

      'No se recibieron datos válidos de la solicitud.'

    );

    lock.waitLock(30000);

    lockAdquirido = true;

    if (!Number.isFinite(usuario.expiresAt) || usuario.expiresAt <= Date.now()) {

      throw agLoginAuthFault_();

    }

    const ss = SpreadsheetApp.openById(

      agLoginConfig_().spreadsheetId

    );

    const sheet = ss.getSheetByName(

      SP_HOJA_SOLICITUDES

    );

    exigir(

      !!sheet,

      'No existe la hoja ' + SP_HOJA_SOLICITUDES + '.'

    );

    const ahora = new Date();

    const mesesSolicitud = [

      'ENERO', 'FEBRERO', 'MARZO', 'ABRIL',

      'MAYO', 'JUNIO', 'JULIO', 'AGOSTO',

      'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'

    ];

    const mes = mesesSolicitud[ahora.getMonth()];

    const semana = obtenerNumeroSemanaSolicitud_SP_(ahora);

    const fechaPago = convertirFechaSolicitud_SP_(

      datos.fechaPago

    );

    exigir(

      !!fechaPago,

      'La fecha de pago es obligatoria.'

    );

    const tipoPago = limpiarTextoSolicitud_SP_(

      datos.tipoPago

    );

    const tiposPagoPermitidos = [

      'Transferencia a cuenta bancaria',

      'Pago por página / PSE'

    ];

    exigir(

      tiposPagoPermitidos.indexOf(tipoPago) !== -1,

      'Debe seleccionar un tipo de pago válido.'

    );

    const beneficiario = limpiarTextoSolicitud_SP_(

      datos.beneficiario

    );

    exigir(

      !!beneficiario,

      'Debe seleccionar un beneficiario.'

    );

    const cliente = limpiarTextoSolicitud_SP_(

      datos.cliente

    );

    exigir(

      !!cliente,

      'Debe seleccionar un cliente.'

    );

    const referenciaAgNormalizada =

      limpiarTextoSolicitud_SP_(datos.referenciaAg)

        .toUpperCase();

    exigir(

      /^(AGM|AGX)\d{4}$/.test(referenciaAgNormalizada),

      'La REFERENCIA AG debe tener el formato AGM0000 o AGX0000.'

    );

    const doNumber = limpiarTextoSolicitud_SP_(

      datos.doNumber

    );

    exigir(

      /^\d{9}$/.test(doNumber),

      'El D.O. debe contener exactamente 9 dígitos numéricos.'

    );

    const proveedor = buscarProveedorSolicitud_SP_(

      beneficiario

    );

    exigir(

      !!proveedor,

      'El beneficiario seleccionado no existe como proveedor.'

    );

    const nit = proveedor.nit || '';

    exigir(

      !!nit,

      'El proveedor seleccionado no tiene NIT registrado.'

    );

    exigir(

      !!limpiarTextoSolicitud_SP_(usuario.nombre),

      'El usuario autenticado no tiene nombre registrado en USERS.'

    );

    exigir(

      !!buscarClienteSolicitud_SP_(cliente),

      'El cliente seleccionado no existe como cliente activo.'

    );

    const area = limpiarTextoSolicitud_SP_(datos.area);

    const areasPermitidas = [

      'Comercial',

      'Gerencia',

      'Operaciones',

      'Customer Service'

    ];

    exigir(

      areasPermitidas.indexOf(area) !== -1,

      'Debe seleccionar un área válida.'

    );

    const documentoTransporte =

      limpiarTextoSolicitud_SP_(datos.docTransporte);

    exigir(

      !!documentoTransporte,

      'El documento de transporte / BL es obligatorio.'

    );

    const contenedor = limpiarTextoSolicitud_SP_(

      datos.contenedor

    );

    exigir(

      !!contenedor,

      'El contenedor es obligatorio.'

    );

    const servicio = limpiarTextoSolicitud_SP_(

      datos.servicio

    );

    exigir(

      !!servicio,

      'El servicio es obligatorio.'

    );

    const observaciones = limpiarTextoSolicitud_SP_(

      datos.observaciones

    );

    const moneda = limpiarTextoSolicitud_SP_(

      datos.moneda

    ).toUpperCase();

    exigir(

      ['USD', 'EUR', 'COP'].indexOf(moneda) !== -1,

      'La moneda seleccionada no es válida.'

    );

    const valor = convertirValorSolicitud_SP_(

      datos.valor

    );

    exigir(

      Number.isFinite(valor) && valor > 0,

      'El valor debe ser mayor que cero.'

    );

    if (!Number.isFinite(usuario.expiresAt) || usuario.expiresAt <= Date.now()) {

      throw agLoginAuthFault_();

    }

    const operacion = roValidarPago_(ss, datos);

    const consecutivo =

      obtenerSiguienteConsecutivoSolicitud_SP_(sheet);

    const pdfUrl =

      obtenerUrlSolicitudPagoPDF_SP_(consecutivo, idToken, usuario);

    const fila = [

      mes,                                // A

      semana,                             // B

      ahora,                              // C

      consecutivo,                        // D

      operacion.referenciaAg,             // E

      operacion.cliente,                  // F

      moneda === 'USD' ? valor : '',       // G

      moneda === 'EUR' ? valor : '',       // H

      moneda === 'COP' ? valor : '',       // I

      tipoPago,                           // J

      usuario.nombre,                     // K

      fechaPago,                          // L

      beneficiario,                       // M

      nit,                                // N

      area,                               // O

      operacion.blGuia,                   // P

      contenedor,                         // Q

      servicio,                           // R

      operacion.do,                       // S

      observaciones                       // T

    ];

    if (!Number.isFinite(usuario.expiresAt) || usuario.expiresAt <= Date.now()) {

      throw agLoginAuthFault_();

    }

    const filaNueva = sheet.getLastRow() + 1;

    roEscribirSolicitud_(ss, sheet, filaNueva, fila);

    sheet

      .getRange(filaNueva, 3)

      .setNumberFormat('dd/MM/yyyy');

    sheet

      .getRange(filaNueva, 12)

      .setNumberFormat('dd/MM/yyyy');

    return {

      success: true,

      message: 'Solicitud registrada correctamente: ' + consecutivo,

      consecutivo: consecutivo,

      referenciaAg: referenciaAgNormalizada,

      pdfUrl: pdfUrl,

      fila: filaNueva

    };

  } catch (error) {

    if (error instanceof AgLoginFault) {

      throw error;

    }

    return {

      success: false,

      message:

        (error instanceof RoFault ? error.message : '') ||
        mensajeValidacion ||

        'No fue posible guardar la solicitud.'

    };

  } finally {

    if (lockAdquirido) {

      try {

        lock.releaseLock();

      } catch (error) {

        // La liberación no debe sustituir el resultado del guardado.

      }

    }

  }

}

/**

 * Comprueba solicitudes anteriores para un documento de transporte.

 * La identidad se valida antes de consultar los registros.

 *

 * @param {string} idToken Token de identidad de Firebase.

 * @param {string} documentoTransporte Documento de transporte o BL.

 * @returns {{

 *   success: boolean,

 *   duplicado?: boolean,

 *   conceptos?: string[],

 *   solicitudes?: string[],

 *   message?: string

 * }}

 */

function verificarDocumentoTransporteSolicitud_SP(

  idToken,

  documentoTransporte

) {

  if (arguments.length !== 2) {

    throw agLoginAuthFault_();

  }

  obtenerUsuarioSolicitud_SP_(idToken);

  try {

    if (typeof documentoTransporte !== 'string') {

      return {

        success: false,

        message: 'El documento de transporte debe ser un texto.'

      };

    }

    const buscado =

      normalizarDocumentoTransporteSolicitud_SP_(

        documentoTransporte

      );

    if (!buscado) {

      return {

        success: true,

        duplicado: false,

        conceptos: [],

        solicitudes: []

      };

    }

    const sheet = SpreadsheetApp

      .openById(agLoginConfig_().spreadsheetId)

      .getSheetByName(SP_HOJA_SOLICITUDES);

    if (!sheet) {

      return {

        success: false,

        message: 'No existe la hoja ' + SP_HOJA_SOLICITUDES + '.'

      };

    }

    const ultimaFila = sheet.getLastRow();

    if (ultimaFila < 2) {

      return {

        success: true,

        duplicado: false,

        conceptos: [],

        solicitudes: []

      };

    }

    const data = sheet

      .getRange(

        2,

        1,

        ultimaFila - 1,

        SP_COLUMNAS_SOLICITUDES

      )

      .getValues();

    /** @type {string[]} */

    const conceptos = [];

    /** @type {string[]} */

    const solicitudes = [];

    let duplicado = false;

    data.forEach(function (fila) {

      const documentoRegistrado =

        normalizarDocumentoTransporteSolicitud_SP_(

          fila[15]

        );

      if (documentoRegistrado !== buscado) {

        return;

      }

      duplicado = true;

      const concepto =

        limpiarTextoSolicitud_SP_(fila[17]) ||

        'Sin servicio registrado';

      const solicitud =

        limpiarTextoSolicitud_SP_(fila[3]);

      if (conceptos.indexOf(concepto) === -1) {

        conceptos.push(concepto);

      }

      if (

        solicitud &&

        solicitudes.indexOf(solicitud) === -1

      ) {

        solicitudes.push(solicitud);

      }

    });

    return {

      success: true,

      duplicado: duplicado,

      conceptos: conceptos,

      solicitudes: solicitudes

    };

  } catch (error) {

    return {

      success: false,

      message: 'No fue posible comprobar el documento de transporte.'

    };

  }

}

/** @param {*} valor @returns {string} */

function normalizarDocumentoTransporteSolicitud_SP_(valor) {

  return limpiarTextoSolicitud_SP_(valor).toUpperCase().replace(/[\s\-_.\/]/g, '');

}

/**

 * Busca un proveedor en el libro configurado; conserva la regla original.

 *

 * @param {string} nombreBuscado

 * @returns {{id:string,nombre:string,nit:string}|null}

 */

function buscarProveedorSolicitud_SP_(nombreBuscado) {

  const ss =

    SpreadsheetApp.openById(agLoginConfig_().spreadsheetId);

  const sheet =

    ss.getSheetByName(

      SP_HOJA_TERCEROS

    );

  if (!sheet) {

    return null;

  }

  const ultimaFila =

    sheet.getLastRow();

  if (ultimaFila < 2) {

    return null;

  }

  const data =

    sheet

      .getRange(

        2,

        1,

        ultimaFila - 1,

        5

      )

      .getValues();

  const buscado =

    String(nombreBuscado || '')

      .trim()

      .toLowerCase();

  for (let i = 0; i < data.length; i++) {

    const nombre =

      data[i][1]

        ? String(data[i][1])

            .trim()

            .toLowerCase()

        : '';

    const tipo =

      data[i][4]

        ? String(data[i][4])

            .trim()

            .toUpperCase()

        : '';

    if (

      nombre === buscado &&

      tipo.indexOf('PROVEEDOR') !== -1

    ) {

      return {

        id: data[i][0]

          ? String(data[i][0]).trim()

          : '',

        nombre: data[i][1]

          ? String(data[i][1]).trim()

          : '',

        nit: data[i][2]

          ? String(data[i][2]).trim()

          : '',

        estado: data[i][3]

          ? String(data[i][3]).trim()

          : '',

        tipo: tipo

      };

    }

  }

  return null;

}

/**

 * Busca un cliente activo en el libro configurado.

 *

 * @param {string} nombreBuscado

 * @returns {{id: string, nombre: string, nit: string}|null}

 */

function buscarClienteSolicitud_SP_(nombreBuscado) {

  const sheet = SpreadsheetApp

    .openById(agLoginConfig_().spreadsheetId)

    .getSheetByName(SP_HOJA_TERCEROS);

  if (!sheet || sheet.getLastRow() < 2) {

    return null;

  }

  const data = sheet

    .getRange(2, 1, sheet.getLastRow() - 1, 5)

    .getValues();

  const buscado = limpiarTextoSolicitud_SP_(

    nombreBuscado

  ).toLowerCase();

  if (!buscado) {

    return null;

  }

  for (let i = 0; i < data.length; i++) {

    const fila = data[i];

    const nombre = limpiarTextoSolicitud_SP_(fila[1]);

    const estado = limpiarTextoSolicitud_SP_(

      fila[3]

    ).toUpperCase();

    const tipo = limpiarTextoSolicitud_SP_(

      fila[4]

    ).toUpperCase();

    if (

      nombre.toLowerCase() === buscado &&

      tipo.indexOf('CLIENTE') !== -1 &&

      estado !== 'INACTIVO'

    ) {

      return {

        id: limpiarTextoSolicitud_SP_(fila[0]),

        nombre: nombre,

        nit: limpiarTextoSolicitud_SP_(fila[2])

      };

    }

  }

  return null;

}

/**

 * Consulta una solicitud desde el libro configurado.

 * Es una función privada utilizada por las operaciones protegidas.

 *

 * @param {string} consecutivo

 * @returns {Object|null}

 */

function obtenerSolicitudPorConsecutivo_SP_(consecutivo) {

  const buscado = limpiarTextoSolicitud_SP_(

    consecutivo

  ).toUpperCase();

  if (!/^SOL-PG\d+$/.test(buscado)) {

    return null;

  }

  const sheet = SpreadsheetApp

    .openById(agLoginConfig_().spreadsheetId)

    .getSheetByName(SP_HOJA_SOLICITUDES);

  if (!sheet) {

    throw new Error(

      'No existe la hoja ' + SP_HOJA_SOLICITUDES + '.'

    );

  }

  const ultimaFila = sheet.getLastRow();

  if (ultimaFila < 2) {

    return null;

  }

  const data = sheet

    .getRange(

      2,

      1,

      ultimaFila - 1,

      SP_COLUMNAS_SOLICITUDES

    )

    .getValues();

  for (let i = 0; i < data.length; i++) {

    const fila = data[i];

    const consecutivoRegistrado =

      limpiarTextoSolicitud_SP_(fila[3]).toUpperCase();

    if (consecutivoRegistrado !== buscado) {

      continue;

    }

    return {

      mes: fila[0],

      semana: fila[1],

      fechaSolicitud: fila[2],

      consecutivo: fila[3],

      referenciaAg: fila[4],

      cliente: fila[5],

      usd: fila[6],

      eur: fila[7],

      cop: fila[8],

      tipoPago: fila[9],

      personaSolicita: fila[10],

      fechaPago: fila[11],

      beneficiario: fila[12],

      nit: fila[13],

      area: fila[14],

      documentoTransporte: fila[15],

      contenedor: fila[16],

      servicio: fila[17],

      doNumber: fila[18],

      observaciones: fila[19]

    };

  }

  return null;

}

/**

 * Conserva el generador existente si está presente en otro archivo del proyecto.

 * @param {string} idToken

 * @param {string} consecutivo

 * @returns {{success:boolean,message:string,consecutivo?:string,pdfUrl?:string}}

 */

function generarPdfSolicitudPorConsecutivo_SP(idToken, consecutivo) {

  if (arguments.length !== 2) { throw agLoginAuthFault_(); }

  obtenerUsuarioSolicitud_SP_(idToken);

  try {

    const consecutivoLimpio =

      limpiarTextoSolicitud_SP_(

        consecutivo

      );

    if (!consecutivoLimpio) {

      throw new Error(

        'No se recibió el consecutivo de la solicitud.'

      );

    }

    const datos =

      obtenerSolicitudPorConsecutivo_SP_(

        consecutivoLimpio

      );

    if (!datos) {

      throw new Error(

        'No se encontró la solicitud ' +

        consecutivoLimpio +

        ' en ' + SP_HOJA_SOLICITUDES + '.'

      );

    }

    if (

      typeof generarPdfSolicitud_SP ===

      'function'

    ) {

      const pdfUrl =

        generarPdfSolicitud_SP(

          consecutivoLimpio,

          datos

        );

      return {

        success: true,

        message:

          'PDF generado correctamente.',

        consecutivo:

          consecutivoLimpio,

        pdfUrl:

          pdfUrl

      };

    }

    throw new Error(

      'La función generadora de PDF no está disponible.'

    );

  } catch (e) {

    return {

      success: false,

      message:

        e && e.message

          ? e.message

          : String(e)

    };

  }

}

/** @param {Date} fecha @returns {number} */

function obtenerNumeroSemanaSolicitud_SP_(fecha) {

  const d =

    new Date(

      fecha.getFullYear(),

      fecha.getMonth(),

      fecha.getDate()

    );

  d.setHours(0, 0, 0, 0);

  d.setDate(

    d.getDate() + 4 -

    (d.getDay() || 7)

  );

  const inicio =

    new Date(

      d.getFullYear(),

      0,

      1

    );

  return Math.ceil(

    (

      (

        (

          d - inicio

        ) / 86400000

      ) + 1

    ) / 7

  );

}

/** @param {*} valor @returns {Date|null} */

function convertirFechaSolicitud_SP_(valor) {

  if (!valor) {

    return null;

  }

  if (

    Object.prototype.toString.call(valor) ===

    '[object Date]'

  ) {

    if (!isNaN(valor.getTime())) {

      return valor;

    }

    return null;

  }

  const fecha =

    new Date(valor);

  if (isNaN(fecha.getTime())) {

    return null;

  }

  return fecha;

}

/** @param {*} valor @returns {number} */

function convertirValorSolicitud_SP_(valor) {

  if (

    valor === null ||

    valor === undefined ||

    valor === ''

  ) {

    return 0;

  }

  if (typeof valor === 'number') {

    return valor;

  }

  let texto =

    String(valor)

      .trim()

      .replace(/\s/g, '');

  if (!texto) {

    return 0;

  }

  /**

   * Caso colombiano:

   *

   * 1.234.567,89

   */

  if (

    texto.indexOf('.') !== -1 &&

    texto.indexOf(',') !== -1

  ) {

    texto =

      texto

        .replace(/\./g, '')

        .replace(',', '.');

  } else if (

    texto.indexOf(',') !== -1

  ) {

    /**

     * Si solo existe coma, se interpreta

     * como separador decimal.

     */

    texto =

      texto.replace(',', '.');

  } else {

    /**

     * Si solo existen puntos:

     *

     * 1.000

     *

     * se interpreta como 1000.

     */

    const partes =

      texto.split('.');

    if (partes.length > 2) {

      texto =

        texto.replace(/\./g, '');

    } else if (

      partes.length === 2 &&

      partes[1].length === 3

    ) {

      texto =

        texto.replace('.', '');

    }

  }

  const numero =

    Number(texto);

  return isNaN(numero)

    ? 0

    : numero;

}

/** @param {*} valor @returns {string} */

function limpiarTextoSolicitud_SP_(valor) {

  if (

    valor === null ||

    valor === undefined

  ) {

    return '';

  }

  return String(valor)

    .trim();

}

/** @param {GoogleAppsScript.Spreadsheet.Sheet} sheet @returns {string} */

function obtenerSiguienteConsecutivoSolicitud_SP_(sheet) {

  const ultimaFila =

    sheet.getLastRow();

  let maximo = 0;

  if (ultimaFila >= 2) {

    const valores =

      sheet

        .getRange(

          2,

          4,

          ultimaFila - 1,

          1

        )

        .getValues();

    valores.forEach(function (fila) {

      const valor =

        fila[0]

          ? String(fila[0]).trim()

          : '';

      const match =

        valor.match(

          /^SOL-PG(\d+)$/i

        );

      if (match) {

        const numero =

          parseInt(

            match[1],

            10

          );

        if (

          !isNaN(numero) &&

          numero > maximo

        ) {

          maximo = numero;

        }

      }

    });

  }

  return (

    'SOL-PG' +

    String(maximo + 1)

      .padStart(3, '0')

  );

}
