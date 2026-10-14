/**
 * @fileoverview Provisiones autenticadas. Contrato público: idToken como primer argumento.
 * Conserva monedas, proveedores, ETA/ETD, duplicados, histórico y exportación existentes.
 * @typedef {{nombre:string,email:string,uid:string,area:string,expiresAt:number}} RpIdentidad
 * @typedef {{proveedor:string,etaEtd:string,usd:number,eur:number,cop:number,observaciones:string,filaHoja?:number}} RpFilaEntrada
 * @typedef {{referenciaAg:string,operationVersion:string,filas:RpFilaEntrada[],confirmarDuplicados?:boolean,fechaReporteHistorica?:string}} RpEntrada
 */
/***************************************************************
 * AG OPERATIONS
 * MÓDULO 03 · REPORTE DE PROVISIONES
 *
 * Archivo:
 *   ReporteProvisiones.gs
 *
 * Hojas utilizadas:
 *   - CONTROL_REPORTE_PROVISIONES
 *   - OPERACIONES_REGISTRADAS
 *   - LISTADO_CLIENTES_PROVEEDORES
 *
 * Estructura CONTROL_REPORTE_PROVISIONES:
 *   A  FECHA REPORTE
 *   B  MES
 *   C  SEMANA
 *   D  CLIENTE
 *   E  REFERENCIA_AG
 *   F  D.O.
 *   G  PROVEEDOR
 *   H  ETA/ETD
 *   I  USD
 *   J  EUR
 *   K  COP
 *   L  REPORTADO POR
 *   M  OBSERVACIONES
 *   N  ESTADO
 *   O  FECHA_MODIFICACION
 *   P  MODIFICADO_POR
 ***************************************************************/

/* ============================================================
 * CONFIGURACIÓN
 * ============================================================ */

const RP_CONFIG = Object.freeze({
HOJA_PROVISIONES: 'CONTROL_REPORTE_PROVISIONES',
HOJA_OPERACIONES: 'OPERACIONES_REGISTRADAS',
HOJA_TERCEROS: 'LISTADO_CLIENTES_PROVEEDORES',
HOJA_HISTORIAL_REPROGRAMACIONES:
  'HISTORIAL_REPROGRAMACIONES_PROVISIONES',

  ESTADO_ACTIVA: 'ACTIVA',
  ESTADO_ANULADA: 'ANULADA',

  TIPO_CLIENTE: 'CLIENTE',
  TIPO_PROVEEDOR: 'PROVEEDOR OPERATIVO',
  ESTADO_TERCERO_ACTIVO: 'ACTIVO',

  ZONA_HORARIA: 'America/Bogota',

  ENCABEZADOS_PROVISIONES: [
    'FECHA REPORTE',
    'MES',
    'SEMANA',
    'CLIENTE',
    'REFERENCIA_AG',
    'D.O.',
    'PROVEEDOR',
    'ETA/ETD',
    'USD',
    'EUR',
    'COP',
    'REPORTADO POR',
    'OBSERVACIONES',
    'ESTADO',
    'FECHA_MODIFICACION',
    'MODIFICADO_POR'
  ],

  ENCABEZADOS_OPERACIONES: [
    'ID',
    'REFERENCIA_AG',
    'NOMBRE CLIENTE',
    'BL_DE_REFERENCIA',
    'D.O'
  ],
    ENCABEZADOS_TERCEROS: [
  'ID',
  'NOMBRE CLIENTE',
  'NIT',
  'ESTADO CLIENTE',
  'TIPO TERCERO'
],

ENCABEZADOS_HISTORIAL_REPROGRAMACIONES: [
  'REFERENCIA_AG',
  'FECHA_CAMBIO',
  'ETA_ANTERIOR',
  'ETA_NUEVA',
  'MES_ANTERIOR',
  'MES_NUEVO',
  'SEMANA_ANTERIOR',
  'SEMANA_NUEVA',
  'TOTAL_USD',
  'TOTAL_EUR',
  'TOTAL_COP',
  'CANTIDAD_PROVEEDORES',
  'USUARIO',
  'TIPO_CAMBIO'
]
});

/* ============================================================
 * INICIALIZACIÓN DEL MÓDULO
 * ============================================================ */

/**
 * Ejecutar desde el frontend cuando se abre el Módulo 03.
 *
 * Devuelve:
 * - período cargado;
 * - registros activos de los dos meses;
 * - KPIs semana actual/anterior;
 * - semanas disponibles;
 * - clientes presentes;
 * - referencias presentes.
 *
 * @param {Object=} opciones
 * @return {Object}
 */
/** @param {string} idToken @param {Object=} opciones @returns {Object} */
function rpObtenerDashboard(idToken, opciones) {
  if (arguments.length < 1 || arguments.length > 2) throw agLoginAuthFault_();
  const usuarioAuth = agLoginRequerirUsuario_(idToken);

  try {
    const inicioTotal = Date.now();

    const config = opciones || {};

    roConLock_(function() { roVigencia_(usuarioAuth); rpPrepararEstructura_(); });

    const periodo = rpResolverPeriodo_(
      config.anio,
      config.mes
    );

    /*
     * Registros internos.
     *
     * Conservan objetos Date porque el servidor
     * los necesita para cálculos y comparaciones.
     */
    const registrosInternos =
      rpLeerProvisionesPeriodo_(
        periodo.inicio,
        periodo.finExclusivo,
        false
      );

    /*
     * Registros enviados al navegador.
     *
     * Aquí eliminamos cualquier objeto Date
     * porque google.script.run no puede
     * transportarlo.
     */
    const registrosFrontend =
      registrosInternos.map(
        rpSerializarProvisionFrontend_
      );

    const respuesta = {
      ok: true,

      periodo:
        rpSerializarPeriodo_(periodo),

      registros:
        registrosFrontend,

      filtros:
        rpConstruirFiltros_(
          registrosInternos
        ),

      kpis:
        rpConstruirKpis_(
          registrosInternos
        ),

      generadoEn:
        rpFechaHoraISO_(
          new Date()
        )
    };

    const tiempoTotal =
      rpMedirTiempo_(
        'rpObtenerDashboard',
        inicioTotal
      );

    respuesta.diagnosticoTiempoMs =
      tiempoTotal;

    return respuesta;

  } catch (error) {
    throw rpError_(
      'No fue posible cargar el reporte de provisiones.',
      error
    );
  }
}

/* ============================================================
 * BÚSQUEDA DE OPERACIONES
 * ============================================================ */

/**
 * Busca una referencia AG cuando el usuario termina de escribir.
 *
 * @param {string} referenciaAg
 * @return {Object}
 */

/** @param {string} idToken @param {string} referenciaAg @returns {Object} */
function rpBuscarOperacion(idToken, referenciaAg) {
  if (arguments.length < 1 || arguments.length > 2) throw agLoginAuthFault_();
  const usuarioAuth = agLoginRequerirUsuario_(idToken);

  const inicioTotal = Date.now();

  try {
    const referencia =
      rpNormalizarReferencia_(
        referenciaAg
      );

    rpValidarReferencia_(
      referencia
    );

    const operaciones =
      rpObtenerMapaOperaciones_();

    const operacion =
      operaciones[referencia];

    if (!operacion) {
      return {
        ok: true,
        existe: false,
        referenciaAg: referencia,
        tieneProvisionesActivas: false,
        cantidadProvisionesActivas: 0
      };
    }

    const provisionesActivas =
      rpLeerTodasLasProvisiones_()
        .filter(function (registro) {
          return (
            registro.referenciaAg === referencia &&
            registro.estado !==
              RP_CONFIG.ESTADO_ANULADA
          );
        });

    return {
      ok: true,
      existe: true,

      tieneProvisionesActivas:
        provisionesActivas.length > 0,

      cantidadProvisionesActivas:
        provisionesActivas.length,

      operacion: {
        id:
          operacion.id,
        version: operacion.version,

        referenciaAg:
          operacion.referenciaAg,

        cliente:
          operacion.cliente,

        blGuia:
          operacion.blGuia,

        do:
          operacion.do,

        tieneDo:
          Boolean(
            operacion.do
          ),

        tipoOperacion:
          rpTipoOperacion_(
            referencia
          )
      }
    };

  } catch (error) {
    throw rpError_(
      'No fue posible consultar la operación.',
      error
    );

  } finally {
    rpMedirTiempo_(
      'rpBuscarOperacion',
      inicioTotal
    );
  }
}

/* ============================================================
 * CLIENTES Y PROVEEDORES
 * ============================================================ */

/**
 * Devuelve exclusivamente CLIENTES activos.
 *
 * @return {Object}
 */
/** @param {string} idToken  @returns {Object} */
function rpObtenerClientesActivos(idToken) {
  if (arguments.length < 1 || arguments.length > 1) throw agLoginAuthFault_();
  const usuarioAuth = agLoginRequerirUsuario_(idToken);

  try {
    const terceros = rpLeerTerceros_();

    const clientes = terceros
      .filter(function (tercero) {
        return (
          tercero.estado === RP_CONFIG.ESTADO_TERCERO_ACTIVO &&
          tercero.tipo === RP_CONFIG.TIPO_CLIENTE
        );
      })
      .map(function (tercero) {
        return {
          id: tercero.id,
          nombre: tercero.nombre,
          nit: tercero.nit
        };
      })
      .sort(function (a, b) {
        return a.nombre.localeCompare(
          b.nombre,
          'es',
          { sensitivity: 'base' }
        );
      });

    return {
      ok: true,
      clientes: clientes
    };

  } catch (error) {
    throw rpError_(
      'No fue posible cargar los clientes activos.',
      error
    );
  }
}

/**
 * Devuelve exclusivamente PROVEEDORES OPERATIVOS activos.
 *
 * @return {Object}
 */
/** @param {string} idToken  @returns {Object} */
function rpObtenerProveedoresActivos(idToken) {
  if (arguments.length < 1 || arguments.length > 1) throw agLoginAuthFault_();
  const usuarioAuth = agLoginRequerirUsuario_(idToken);

  try {
    const terceros = rpLeerTerceros_();

    const proveedores = terceros
      .filter(function (tercero) {
        return (
          tercero.estado === RP_CONFIG.ESTADO_TERCERO_ACTIVO &&
          tercero.tipo === RP_CONFIG.TIPO_PROVEEDOR
        );
      })
      .map(function (tercero) {
        return {
          id: tercero.id,
          nombre: tercero.nombre,
          nit: tercero.nit
        };
      })
      .sort(function (a, b) {
        return a.nombre.localeCompare(
          b.nombre,
          'es',
          { sensitivity: 'base' }
        );
      });

    return {
      ok: true,
      proveedores: proveedores
    };

  } catch (error) {
    throw rpError_(
      'No fue posible cargar los proveedores activos.',
      error
    );
  }
}

/* ============================================================
 * CREACIÓN RÁPIDA DE UNA OPERACIÓN
 * ============================================================ */

/**
 * Crea una operación cuando la REFERENCIA AG no existe.
 *
 * Reglas:
 * - REFERENCIA = AGM#### o AGX####
 * - Cliente debe existir, estar activo y ser CLIENTE.
 * - BL / Guía obligatorio.
 * - D.O. opcional.
 * - Si D.O. existe debe tener exactamente 9 dígitos.
 * - ID OP-### generado automáticamente.
 *
 * @param {Object} datos
 * @return {Object}
 */
/** @param {string} idToken @param {RoDatos} datos @returns {RoResultado} */
function rpCrearOperacion(idToken, datos) {
  if (arguments.length !== 2) throw agLoginAuthFault_();
  return roCrearOperacion(idToken, datos);
}

/* ============================================================
 * REGISTRO DE PROVISIONES
 * ============================================================ */

/**
 * Guarda una operación con uno o varios proveedores.
 *
 * payload esperado:
 *
 * {
 *   referenciaAg: 'AGM6773',
 *   operationVersion: 'versión devuelta por la consulta',
 *   confirmarDuplicados: false,
 *   filas: [
 *     {
 *       proveedor: 'MAERSK COLOMBIA S A',
 *       etaEtd: '2026-09-30',
 *       usd: 100,
 *       eur: 0,
 *       cop: 2000000,
 *       observaciones: 'Flete'
 *     }
 *   ]
 * }
 *
 * @param {Object} datos
 * @return {Object}
 */
/** @param {string} idToken @param {RpEntrada} datos @returns {Object} */
function rpGuardarProvisiones(idToken, datos) {
  if (arguments.length < 1 || arguments.length > 2) throw agLoginAuthFault_();
  const usuarioAuth = agLoginRequerirUsuario_(idToken);

    const lock = LockService.getScriptLock();
  let lockAdquirido = false;

    try {
    lock.waitLock(30000);
    lockAdquirido = true;
    roVigencia_(usuarioAuth);

    rpPrepararEstructura_();

    const payload = datos || {};
    const referencia = rpNormalizarReferencia_(
      payload.referenciaAg
    );

    rpValidarReferencia_(referencia);

    const operaciones = rpObtenerMapaOperaciones_();
    const operacion = rpExigirOperacion_(operaciones, referencia, payload.operationVersion);

    if (!operacion) {
      throw new Error(
        'La operación ' +
        referencia +
        ' no existe en OPERACIONES_REGISTRADAS.'
      );
    }

    const filasEntrada = Array.isArray(payload.filas)
      ? payload.filas
      : [];

    if (!filasEntrada.length) {
      throw new Error(
        'Debe registrar por lo menos un proveedor.'
      );
    }

    const proveedoresActivos =
      rpObtenerMapaProveedoresActivos_();

    const filasNormalizadas = filasEntrada.map(
      function (fila, indice) {
        return rpValidarFilaProvision_(
          fila,
          indice + 1,
          proveedoresActivos
        );
      }
    );

    rpValidarMismaEtaEtd_(filasNormalizadas);

    const duplicados = rpDetectarDuplicados_(
      referencia,
      filasNormalizadas,
      []
    );

    if (
      duplicados.length &&
      payload.confirmarDuplicados !== true
    ) {
      return {
        ok: false,
        requiereConfirmacionDuplicado: true,
        duplicados: duplicados,
        mensaje:
          'Se encontraron provisiones similares ya registradas.'
      };
    }

    let fechaReporte = new Date();

if (payload.fechaReporteHistorica) {
  const fechaHistorica =
    rpNormalizarFecha_(
      payload.fechaReporteHistorica
    );

  if (!fechaHistorica) {
    throw new Error(
      'La fecha histórica indicada no es válida.'
    );
  }

  const hoy = new Date();

  const fechaHistoricaDia =
    new Date(
      fechaHistorica.getFullYear(),
      fechaHistorica.getMonth(),
      fechaHistorica.getDate()
    );

  const hoyDia =
    new Date(
      hoy.getFullYear(),
      hoy.getMonth(),
      hoy.getDate()
    );

  if (fechaHistoricaDia > hoyDia) {
    throw new Error(
      'La fecha de reporte no puede ser futura.'
    );
  }

  fechaReporte = fechaHistorica;
}

      const fechaOperativa =
        filasNormalizadas[0].etaEtd;

      const mes =
        rpNombreMes_(fechaOperativa);

      const semana =
        rpNumeroSemanaISO_(fechaOperativa);

    const comercial = usuarioAuth.nombre;

    const filasSalida = filasNormalizadas.map(
      function (fila) {
        return [
          fechaReporte,
          mes,
          semana,
          operacion.cliente,
          referencia,
          operacion.do || '',
          fila.proveedor,
          fila.etaEtd,
          fila.usd === 0 ? '' : fila.usd,
          fila.eur === 0 ? '' : fila.eur,
          fila.cop === 0 ? '' : fila.cop,
          comercial,
          fila.observaciones,
          RP_CONFIG.ESTADO_ACTIVA,
          '',
          ''
        ];
      }
    );

    const sheet = rpAbrirLibro_()
      .getSheetByName(
        RP_CONFIG.HOJA_PROVISIONES
      );

    roVigencia_(usuarioAuth);
    const primeraFila = sheet.getLastRow() + 1;

    sheet
      .getRange(
        primeraFila,
        1,
        filasSalida.length,
        RP_CONFIG.ENCABEZADOS_PROVISIONES.length
      )
      .setValues(rpValoresSeguros_(filasSalida));

    rpAplicarFormatosFilas_(
      sheet,
      primeraFila,
      filasSalida.length
    );

    SpreadsheetApp.flush();

    return {
      ok: true,
      referenciaAg: referencia,
      cantidadRegistrada: filasSalida.length,
      tieneDo: Boolean(operacion.do),
      advertenciaDo: !operacion.do,
      mensaje:
        filasSalida.length === 1
          ? 'La provisión fue registrada correctamente.'
          : (
              filasSalida.length +
              ' provisiones fueron registradas correctamente.'
            )
    };

  } catch (error) {
    // Validación de negocio: respuesta pública controlada, sin exponer errores internos.
    if (error instanceof RoFault && error.code === 'OPERACION_INCOMPLETA') {
      return {ok: false, codigo: error.code, mensaje: error.message};
    }
    throw rpError_(
      'No fue posible registrar las provisiones.',
      error
    );

  } finally {
    try {
      if (lockAdquirido) lock.releaseLock();
    } catch (ignore) {}
  }
}

/* ============================================================
 * DETALLE DE UNA OPERACIÓN
 * ============================================================ */

/**
 * Obtiene todas las provisiones de una referencia.
 *
 * @param {string} referenciaAg
 * @return {Object}
 */

/** @param {string} idToken @param {string} referenciaAg @returns {Object} */
function rpObtenerDetalleOperacion(idToken, referenciaAg) {
  if (arguments.length < 1 || arguments.length > 2) throw agLoginAuthFault_();
  const usuarioAuth = agLoginRequerirUsuario_(idToken);

  try {
    roConLock_(function() { roVigencia_(usuarioAuth); rpPrepararEstructura_(); });

    const referencia =
      rpNormalizarReferencia_(
        referenciaAg
      );

    rpValidarReferencia_(
      referencia
    );

    const operaciones =
      rpObtenerMapaOperaciones_();

    const operacion =
      operaciones[referencia];

    if (!operacion) {
      throw new Error(
        'La operación no existe.'
      );
    }

    const registros =
      rpLeerTodasLasProvisiones_()
        .filter(function (registro) {
          return (
            registro.referenciaAg ===
            referencia
          );
        });

    const activas =
      registros
        .filter(function (registro) {
          return (
            registro.estado !==
            RP_CONFIG.ESTADO_ANULADA
          );
        })
        .map(
          rpSerializarProvisionFrontend_
        );

    const anuladas =
      registros
        .filter(function (registro) {
          return (
            registro.estado ===
            RP_CONFIG.ESTADO_ANULADA
          );
        })
        .map(
          rpSerializarProvisionFrontend_
        );

    return {
      ok: true,

      operacion: {
        id:
          operacion.id,
        version: operacion.version,

        referenciaAg:
          referencia,

        cliente:
          operacion.cliente,

        do:
          operacion.do,

        blGuia:
          operacion.blGuia,

        tipoOperacion:
          rpTipoOperacion_(
            referencia
          )
      },

      filasActivas:
        activas,

      filasAnuladas:
        anuladas
    };

  } catch (error) {
    throw rpError_(
      'No fue posible obtener el detalle de la operación.',
      error
    );
  }
}

/* ============================================================
 * EDICIÓN DE PROVISIONES
 * ============================================================ */

/**
 * Edita todas las provisiones activas de una operación.
 *
 * Permite:
 * - modificar filas existentes;
 * - agregar nuevos proveedores;
 * - quitar proveedores, que se ANULAN;
 *
 * Nunca elimina físicamente información.
 *
 * @param {Object} datos
 * @return {Object}
 */
/** @param {string} idToken @param {RpEntrada} datos @returns {Object} */
function rpActualizarProvisiones(idToken, datos) {
  if (arguments.length < 1 || arguments.length > 2) throw agLoginAuthFault_();
  const usuarioAuth = agLoginRequerirUsuario_(idToken);

  const lock = LockService.getScriptLock();
  let lockAdquirido = false;

  try {
    lock.waitLock(30000);
    lockAdquirido = true;
    roVigencia_(usuarioAuth);

    rpPrepararEstructura_();

    const payload = datos || {};

    const referencia = rpNormalizarReferencia_(
      payload.referenciaAg
    );

    rpValidarReferencia_(referencia);

    const operaciones = rpObtenerMapaOperaciones_();
    const operacion = rpExigirOperacion_(operaciones, referencia, payload.operationVersion);

    if (!operacion) {
      throw new Error(
        'La operación ' +
        referencia +
        ' no existe.'
      );
    }

    const filasEntrada = Array.isArray(payload.filas)
      ? payload.filas
      : [];

    if (!filasEntrada.length) {
      throw new Error(
        'La operación debe conservar por lo menos ' +
        'una provisión activa.'
      );
    }

    const proveedoresActivos =
      rpObtenerMapaProveedoresActivos_();

    const filasNormalizadas = filasEntrada.map(
      function (fila, indice) {
        const validada = rpValidarFilaProvision_(
          fila,
          indice + 1,
          proveedoresActivos
        );

        validada.filaHoja = fila.filaHoja
          ? Number(fila.filaHoja)
          : null;

        return validada;
      }
    );

    rpValidarMismaEtaEtd_(filasNormalizadas);

    const filasExistentes = rpLeerTodasLasProvisiones_()
      .filter(function (registro) {
        return (
          registro.referenciaAg === referencia &&
          registro.estado !== RP_CONFIG.ESTADO_ANULADA
        );
      });

    const etaAnterior =
      filasExistentes.length
        ? filasExistentes[0].etaEtdDate
        : null;

    const etaNueva =
      filasNormalizadas.length
        ? filasNormalizadas[0].etaEtd
        : null;

    const cambioEta =
      Boolean(
        etaAnterior &&
        etaNueva &&
        etaAnterior.getTime() !==
          etaNueva.getTime()
      );

      const mesAnterior =
        cambioEta
          ? rpNombreMes_(etaAnterior)
          : '';

      const mesNuevo =
        cambioEta
          ? rpNombreMes_(etaNueva)
          : '';

      const semanaAnterior =
        cambioEta
          ? rpNumeroSemanaISO_(etaAnterior)
          : 0;

      const semanaNueva =
        cambioEta
          ? rpNumeroSemanaISO_(etaNueva)
          : 0;

    const filasExcluirDuplicado = filasNormalizadas
      .map(function (fila) {
        return fila.filaHoja;
      })
      .filter(Boolean);

    const duplicados = rpDetectarDuplicados_(
      referencia,
      filasNormalizadas,
      filasExcluirDuplicado
    );

    if (
      duplicados.length &&
      payload.confirmarDuplicados !== true
    ) {
      return {
        ok: false,
        requiereConfirmacionDuplicado: true,
        duplicados: duplicados,
        mensaje:
          'Se encontraron provisiones similares ya registradas.'
      };
    }

    const sheet = rpAbrirLibro_()
      .getSheetByName(
        RP_CONFIG.HOJA_PROVISIONES
      );

    const ahora = new Date();

    const usuario = usuarioAuth.nombre;

          const totalesAnteriores =
  filasExistentes.reduce(
    function (acumulado, registro) {
      acumulado.usd +=
        Number(registro.usd) || 0;

      acumulado.eur +=
        Number(registro.eur) || 0;

      acumulado.cop +=
        Number(registro.cop) || 0;

      if (registro.proveedor) {
        acumulado.proveedores[
          rpClaveTexto_(
            registro.proveedor
          )
        ] = true;
      }

      return acumulado;
    },
    {
      usd: 0,
      eur: 0,
      cop: 0,
      proveedores: {}
    }
  );

const cantidadProveedoresAnterior =
  Object.keys(
    totalesAnteriores.proveedores
  ).length;

    const filasExistentesPorNumero = {};

    filasExistentes.forEach(function (registro) {
      filasExistentesPorNumero[registro.filaHoja] =
        registro;
    });

    const filasConservadas = {};

    filasNormalizadas.forEach(function (fila) {
      if (fila.filaHoja) {
        if (!filasExistentesPorNumero[fila.filaHoja]) {
          throw new Error(
            'La fila ' +
            fila.filaHoja +
            ' ya no está disponible para edición.'
          );
        }

        filasConservadas[fila.filaHoja] = true;
      }
    });

    roVigencia_(usuarioAuth);
    /*
     * 1. ACTUALIZAR FILAS EXISTENTES
     */
      filasNormalizadas.forEach(function (fila) {
  if (!fila.filaHoja) {
    return;
  }

  const registroOriginal =
    filasExistentesPorNumero[
      fila.filaHoja
    ];

  if (cambioEta) {
    sheet
      .getRange(
        fila.filaHoja,
        2,
        1,
        2
      )
      .setValues(rpValoresSeguros_([[
        mesNuevo,
        semanaNueva
      ]]));
  }

  const valores = [
    fila.proveedor,
    fila.etaEtd,
    fila.usd === 0 ? '' : fila.usd,
    fila.eur === 0 ? '' : fila.eur,
    fila.cop === 0 ? '' : fila.cop,
    registroOriginal.comercial || '',
    fila.observaciones,
    RP_CONFIG.ESTADO_ACTIVA,
    ahora,
    usuario
  ];

      /*
       * G:P
       */
      sheet
        .getRange(
          fila.filaHoja,
          7,
          1,
          valores.length
        )
        .setValues(rpValoresSeguros_([valores]));

      rpAplicarFormatosFilas_(
        sheet,
        fila.filaHoja,
        1
      );
    });

    /*
     * 2. ANULAR FILAS QUE EL USUARIO QUITÓ
     */
    filasExistentes.forEach(function (registro) {
      if (filasConservadas[registro.filaHoja]) {
        return;
      }

      sheet
        .getRange(registro.filaHoja, 14, 1, 3)
        .setValues(rpValoresSeguros_([[
          RP_CONFIG.ESTADO_ANULADA,
          ahora,
          usuario
        ]]));
    });

    /*
     * 3. AGREGAR FILAS NUEVAS
     */
    const nuevas = filasNormalizadas.filter(
      function (fila) {
        return !fila.filaHoja;
      }
    );

    if (nuevas.length) {
      const fechaReporte = ahora;

      const fechaOperativa =
        etaNueva || fechaReporte;

      const mes =
        rpNombreMes_(fechaOperativa);

      const semana =
        rpNumeroSemanaISO_(fechaOperativa);

            const filasNuevas = nuevas.map(
              function (fila) {
                return [
                  fechaReporte,
                  mes,
                  semana,
                  operacion.cliente,
                  referencia,
                  operacion.do || '',
                  fila.proveedor,
                  fila.etaEtd,
                  fila.usd === 0 ? '' : fila.usd,
                  fila.eur === 0 ? '' : fila.eur,
                  fila.cop === 0 ? '' : fila.cop,
                  usuario,
                  fila.observaciones,
                  RP_CONFIG.ESTADO_ACTIVA,
                  ahora,
                  usuario
                ];
              }
            );

            const primeraFilaNueva =
              sheet.getLastRow() + 1;

            sheet
              .getRange(
                primeraFilaNueva,
                1,
                filasNuevas.length,
                RP_CONFIG.ENCABEZADOS_PROVISIONES.length
              )
              .setValues(rpValoresSeguros_(filasNuevas));

            rpAplicarFormatosFilas_(
              sheet,
              primeraFilaNueva,
              filasNuevas.length
            );
          }

    if (cambioEta) {
        const tipoCambio =
          semanaAnterior !== semanaNueva ||
          mesAnterior !== mesNuevo
            ? 'REPROGRAMACION DE SEMANA'
            : 'AJUSTE ETA/ETD';

        rpRegistrarReprogramacion_({
          referenciaAg: referencia,
          fechaCambio: ahora,
          etaAnterior: etaAnterior,
          etaNueva: etaNueva,
          mesAnterior: mesAnterior,
          mesNuevo: mesNuevo,
          semanaAnterior: semanaAnterior,
          semanaNueva: semanaNueva,
          totalUsd: totalesAnteriores.usd,
          totalEur: totalesAnteriores.eur,
          totalCop: totalesAnteriores.cop,
          cantidadProveedores:
            cantidadProveedoresAnterior,
          usuario: usuario,
          tipoCambio: tipoCambio
        });
      }

    SpreadsheetApp.flush();

    return {
      ok: true,
      referenciaAg: referencia,
      mensaje:
        'Las provisiones fueron actualizadas correctamente.'
    };

  } catch (error) {
    // Validación de negocio: respuesta pública controlada, sin exponer errores internos.
    if (error instanceof RoFault && error.code === 'OPERACION_INCOMPLETA') {
      return {ok: false, codigo: error.code, mensaje: error.message};
    }
    throw rpError_(
      'No fue posible actualizar las provisiones.',
      error
    );

  } finally {
    try {
      if (lockAdquirido) lock.releaseLock();
    } catch (ignore) {}
  }
}

/* ============================================================
 * ANULACIÓN
 * ============================================================ */

/**
 * Anula todas las provisiones activas de una operación.
 *
 * No elimina filas físicamente.
 *
 * @param {string} referenciaAg
 * @param {string=} usuario
 * @return {Object}
 */
/** @param {string} idToken @param {string} referenciaAg @returns {Object} */
function rpAnularOperacionProvisionada(idToken, referenciaAg) {
  if (arguments.length < 1 || arguments.length > 2) throw agLoginAuthFault_();
  const usuarioAuth = agLoginRequerirUsuario_(idToken);

  const lock = LockService.getScriptLock();
  let lockAdquirido = false;

  try {
    lock.waitLock(30000);
    lockAdquirido = true;
    roVigencia_(usuarioAuth);

    rpPrepararEstructura_();

    const referencia = rpNormalizarReferencia_(
      referenciaAg
    );

    rpValidarReferencia_(referencia);

    const registros = rpLeerTodasLasProvisiones_()
      .filter(function (registro) {
        return (
          registro.referenciaAg === referencia &&
          registro.estado !== RP_CONFIG.ESTADO_ANULADA
        );
      });

    if (!registros.length) {
      throw new Error(
        'No existen provisiones activas para anular.'
      );
    }

    const sheet = rpAbrirLibro_()
      .getSheetByName(
        RP_CONFIG.HOJA_PROVISIONES
      );

    const ahora = new Date();
    const modificadoPor = usuarioAuth.nombre;

    roVigencia_(usuarioAuth);
    registros.forEach(function (registro) {
      sheet
        .getRange(registro.filaHoja, 14, 1, 3)
        .setValues(rpValoresSeguros_([[
          RP_CONFIG.ESTADO_ANULADA,
          ahora,
          modificadoPor
        ]]));
    });

    SpreadsheetApp.flush();

    return {
      ok: true,
      cantidadAnulada: registros.length,
      referenciaAg: referencia,
      mensaje:
        'La provisión fue anulada y se conservó ' +
        'en el historial.'
    };

  } catch (error) {
    throw rpError_(
      'No fue posible anular la provisión.',
      error
    );

  } finally {
    try {
      if (lockAdquirido) lock.releaseLock();
    } catch (ignore) {}
  }
}

/* ============================================================
 * EXPORTACIÓN XLSX
 * ============================================================ */

/**
 * Genera un XLSX sin formato especial con los registros filtrados.
 *
 * El frontend recibirá:
 * {
 *   nombreArchivo,
 *   mimeType,
 *   base64
 * }
 *
 * @param {Object=} filtros
 * @return {Object}
 */
/** @param {string} idToken @param {Object=} filtros @returns {Object} */
function rpExportarXlsx(idToken, filtros) {
  if (arguments.length < 1 || arguments.length > 2) throw agLoginAuthFault_();
  const usuarioAuth = agLoginRequerirUsuario_(idToken);

  let temporal = null;

  try {
    const config = filtros || {};

    const periodo = rpResolverPeriodo_(
      config.anio,
      config.mes
    );

    let registros = rpLeerProvisionesPeriodo_(
      periodo.inicio,
      periodo.finExclusivo,
      false
    );

    registros = rpAplicarFiltrosServidor_(
      registros,
      config
    );

    const encabezados = [
      'FECHA REPORTE',
      'MES',
      'SEMANA',
      'CLIENTE',
      'REFERENCIA_AG',
      'D.O.',
      'PROVEEDOR',
      'ETA/ETD',
      'USD',
      'EUR',
      'COP',
      'REPORTADO POR',
      'OBSERVACIONES'
    ];

    const filas = registros.map(
      function (registro) {
        return [
          registro.fechaReporte,
          registro.mes,
          registro.semana,
          registro.cliente,
          registro.referenciaAg,
          registro.do,
          registro.proveedor,
          registro.etaEtd,
          registro.usd || '',
          registro.eur || '',
          registro.cop || '',
          registro.comercial,
          registro.observaciones
        ];
      }
    );

    temporal = SpreadsheetApp.create(
      'RP_EXPORT_TEMP_' + Date.now()
    );

    const sheet = temporal.getSheets()[0];

    sheet.setName('PROVISIONES');

    sheet
      .getRange(
        1,
        1,
        1,
        encabezados.length
      )
      .setValues(rpValoresSeguros_([encabezados]));

    if (filas.length) {
      sheet
        .getRange(
          2,
          1,
          filas.length,
          encabezados.length
        )
        .setValues(rpValoresSeguros_(filas));

      sheet
        .getRange(
          2,
          1,
          filas.length,
          1
        )
        .setNumberFormat('dd/mm/yyyy hh:mm');

      sheet
        .getRange(
          2,
          8,
          filas.length,
          1
        )
        .setNumberFormat('dd/mm/yyyy');
    }

    SpreadsheetApp.flush();

    const idTemporal = temporal.getId();

    const url =
      'https://docs.google.com/spreadsheets/d/' +
      encodeURIComponent(idTemporal) +
      '/export?format=xlsx';

    const respuesta = UrlFetchApp.fetch(
      url,
      {
        headers: {
          Authorization:
            'Bearer ' +
            ScriptApp.getOAuthToken()
        },
        muteHttpExceptions: true
      }
    );

    const codigo = respuesta.getResponseCode();

    if (codigo < 200 || codigo >= 300) {
      throw new Error(
        'Google no pudo generar el archivo XLSX.'
      );
    }

    const blob = respuesta.getBlob();

    const nombreArchivo =
      'Reporte_Provisiones_' +
      Utilities.formatDate(
        new Date(),
        RP_CONFIG.ZONA_HORARIA,
        'yyyyMMdd_HHmm'
      ) +
      '.xlsx';

    return {
      ok: true,
      nombreArchivo: nombreArchivo,
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      base64: Utilities.base64Encode(
        blob.getBytes()
      ),
      cantidadRegistros: filas.length
    };

  } catch (error) {
    throw rpError_(
      'No fue posible exportar el reporte.',
      error
    );

  } finally {
    if (temporal) {
      try {
        DriveApp
          .getFileById(temporal.getId())
          .setTrashed(true);
      } catch (ignore) {}
    }
  }
}

/* ============================================================
 * LECTURA DE PROVISIONES
 * ============================================================ */

/**
 * Lee todas las provisiones.
 *
 * @return {Array}
 */
function rpLeerTodasLasProvisiones_() {
  const sheet = rpAbrirLibro_()
    .getSheetByName(
      RP_CONFIG.HOJA_PROVISIONES
    );

  if (!sheet) {
    throw new Error(
      'No existe la hoja ' +
      RP_CONFIG.HOJA_PROVISIONES +
      '.'
    );
  }

  const ultimaFila = sheet.getLastRow();

  if (ultimaFila < 2) {
    return [];
  }

  const valores = sheet
    .getRange(
      2,
      1,
      ultimaFila - 1,
      RP_CONFIG.ENCABEZADOS_PROVISIONES.length
    )
    .getValues();

  return valores
    .map(function (fila, indice) {
      return rpConvertirFilaProvision_(
        fila,
        indice + 2
      );
    })
    .filter(function (registro) {
      return Boolean(registro.referenciaAg);
    });
}

/**
 * Lee provisiones dentro de un período.
 *
 * @param {Date} inicio
 * @param {Date} finExclusivo
 * @param {boolean} incluirAnuladas
 * @return {Array}
 */
function rpLeerProvisionesPeriodo_(
  inicio,
  finExclusivo,
  incluirAnuladas
) {
  return rpLeerTodasLasProvisiones_()
    .filter(function (registro) {
      if (!registro.etaEtdDate) {
        return false;
      }

      if (
        registro.etaEtdDate < inicio ||
        registro.etaEtdDate >= finExclusivo
      ) {
        return false;
      }

      if (
        !incluirAnuladas &&
        registro.estado === RP_CONFIG.ESTADO_ANULADA
      ) {
        return false;
      }

      return true;
    });
}

/**
 * Convierte una fila del Sheet a objeto.
 *
 * @param {Array} fila
 * @param {number} numeroFila
 * @return {Object}
 */
function rpConvertirFilaProvision_(fila, numeroFila) {
  const fechaReporte = rpNormalizarFecha_(fila[0]);
  const etaEtd = rpNormalizarFecha_(fila[7]);

  const estado =
    rpNormalizarMayusculas_(fila[13]) ||
    RP_CONFIG.ESTADO_ACTIVA;

  return {
    filaHoja: numeroFila,

    fechaReporte:
      fechaReporte
        ? rpFechaHoraISO_(fechaReporte)
        : '',

    fechaReporteDate: fechaReporte,

    mes: rpLimpiarTexto_(fila[1]),

    semana:
      Number(fila[2]) || 0,

    cliente:
      rpLimpiarTexto_(fila[3]),

    referenciaAg:
      rpNormalizarReferencia_(fila[4]),

    do:
      rpNormalizarDo_(fila[5]),

    proveedor:
      rpLimpiarTexto_(fila[6]),

    etaEtd:
      etaEtd
        ? rpFechaISO_(etaEtd)
        : '',

    etaEtdDate: etaEtd,

    usd: rpNumero_(fila[8]),
    eur: rpNumero_(fila[9]),
    cop: rpNumero_(fila[10]),

    comercial:
      rpLimpiarTexto_(fila[11]),

    observaciones:
      rpLimpiarTexto_(fila[12]),

    estado: estado,

    fechaModificacion:
      fila[14]
        ? rpFechaHoraISO_(
            rpNormalizarFecha_(fila[14])
          )
        : '',

    modificadoPor:
      rpLimpiarTexto_(fila[15]),

    tipoOperacion:
      rpTipoOperacion_(
        rpNormalizarReferencia_(fila[4])
      ),

    semanaClave:
      etaEtd
        ? rpClaveSemana_(etaEtd)
        : '',

    semanaEtiqueta:
      etaEtd
        ? rpEtiquetaSemana_(etaEtd)
        : ''
  };
}

/**
 * Convierte un registro interno de provisión
 * en un objeto seguro para google.script.run.
 *
 * IMPORTANTE:
 * No devuelve objetos Date.
 *
 * @param {Object} registro
 * @return {Object}
 */
function rpSerializarProvisionFrontend_(registro) {
  return {
    filaHoja: registro.filaHoja,

    fechaReporte:
      registro.fechaReporte || '',

    mes:
      registro.mes || '',

    semana:
      Number(registro.semana) || 0,

    cliente:
      registro.cliente || '',

    referenciaAg:
      registro.referenciaAg || '',

    do:
      registro.do || '',

    proveedor:
      registro.proveedor || '',

    etaEtd:
      registro.etaEtd || '',

    usd:
      Number(registro.usd) || 0,

    eur:
      Number(registro.eur) || 0,

    cop:
      Number(registro.cop) || 0,

    comercial:
      registro.comercial || '',

    observaciones:
      registro.observaciones || '',

    estado:
      registro.estado || '',

    fechaModificacion:
      registro.fechaModificacion || '',

    modificadoPor:
      registro.modificadoPor || '',

    tipoOperacion:
      registro.tipoOperacion || '',

    semanaClave:
      registro.semanaClave || '',

    semanaEtiqueta:
      registro.semanaEtiqueta || ''
  };
}

/* ============================================================
 * OPERACIONES REGISTRADAS
 * ============================================================ */

/**
 * Mapa:
 * {
 *   AGM6773: {
 *     id,
 *     referenciaAg,
 *     cliente,
 *     blGuia,
 *     do
 *   }
 * }
 *
 * @return {Object}
 */
/** @returns {Object<string, RoOperacion>} */
function rpObtenerMapaOperaciones_() {
  const mapa = Object.create(null);
  roLeerOperaciones_(rpAbrirLibro_()).forEach(function(op) { mapa[op.referenciaAg] = op; });
  return mapa;
}

/**
 * Genera OP-001, OP-002...
 *
 * Se basa en el máximo ID existente, no en la fila.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @return {string}
 */
function rpGenerarSiguienteIdOperacion_(sheet) {
  const ultimaFila = sheet.getLastRow();

  if (ultimaFila < 2) {
    return 'OP-001';
  }

  const ids = sheet
    .getRange(
      2,
      1,
      ultimaFila - 1,
      1
    )
    .getDisplayValues()
    .flat();

  let mayor = 0;

  ids.forEach(function (id) {
    const coincidencia = String(id || '')
      .trim()
      .toUpperCase()
      .match(/^OP-(\d+)$/);

    if (!coincidencia) {
      return;
    }

    const numero = Number(coincidencia[1]);

    if (numero > mayor) {
      mayor = numero;
    }
  });

  return (
    'OP-' +
    String(mayor + 1).padStart(3, '0')
  );
}

/* ============================================================
 * TERCEROS
 * ============================================================ */

/**
 * @return {Array}
 */
function rpLeerTerceros_() {
  const sheet = rpAbrirLibro_()
    .getSheetByName(
      RP_CONFIG.HOJA_TERCEROS
    );

  if (!sheet) {
    throw new Error(
      'No existe la hoja ' +
      RP_CONFIG.HOJA_TERCEROS +
      '.'
    );
  }

  const ultimaFila = sheet.getLastRow();

  if (ultimaFila < 2) {
    return [];
  }

  const valores = sheet
    .getRange(
      2,
      1,
      ultimaFila - 1,
      5
    )
    .getValues();

  return valores
    .map(function (fila) {
      return {
        id: rpLimpiarTexto_(fila[0]),
        nombre: rpLimpiarTexto_(fila[1]),
        nit: rpLimpiarTexto_(fila[2]),
        estado: rpNormalizarMayusculas_(fila[3]),
        tipo: rpNormalizarMayusculas_(fila[4])
      };
    })
    .filter(function (tercero) {
      return Boolean(tercero.nombre);
    });
}

/**
 * @return {Object}
 */
function rpObtenerMapaClientesActivos_() {
  const mapa = {};

  rpLeerTerceros_().forEach(function (tercero) {
    if (
      tercero.estado !== RP_CONFIG.ESTADO_TERCERO_ACTIVO ||
      tercero.tipo !== RP_CONFIG.TIPO_CLIENTE
    ) {
      return;
    }

    mapa[rpClaveTexto_(tercero.nombre)] = tercero;
  });

  return mapa;
}

/**
 * @return {Object}
 */
function rpObtenerMapaProveedoresActivos_() {
  const mapa = {};

  rpLeerTerceros_().forEach(function (tercero) {
    if (
      tercero.estado !== RP_CONFIG.ESTADO_TERCERO_ACTIVO ||
      tercero.tipo !== RP_CONFIG.TIPO_PROVEEDOR
    ) {
      return;
    }

    mapa[rpClaveTexto_(tercero.nombre)] = tercero;
  });

  return mapa;
}

/* ============================================================
 * VALIDACIÓN DE FILAS
 * ============================================================ */

/**
 * @param {Object} fila
 * @param {number} numero
 * @param {Object} proveedoresActivos
 * @return {Object}
 */
function rpValidarFilaProvision_(
  fila,
  numero,
  proveedoresActivos
) {
  const origen = fila || {};

  const proveedor = rpLimpiarTexto_(
    origen.proveedor
  );

  if (!proveedor) {
    throw new Error(
      'Fila ' +
      numero +
      ': debe seleccionar un proveedor.'
    );
  }

  const claveProveedor =
    rpClaveTexto_(proveedor);

  const proveedorMaestro =
    proveedoresActivos[claveProveedor];

  if (!proveedorMaestro) {
    throw new Error(
      'Fila ' +
      numero +
      ': el proveedor "' +
      proveedor +
      '" no existe, está inactivo o no está ' +
      'clasificado como PROVEEDOR OPERATIVO.'
    );
  }

  const etaEtd = rpNormalizarFecha_(
    origen.etaEtd
  );

  if (!etaEtd) {
    throw new Error(
      'Fila ' +
      numero +
      ': ETA/ETD es obligatoria.'
    );
  }

  const usd = rpNumero_(origen.usd);
  const eur = rpNumero_(origen.eur);
  const cop = rpNumero_(origen.cop);

  if (
    usd < 0 ||
    eur < 0 ||
    cop < 0
  ) {
    throw new Error(
      'Fila ' +
      numero +
      ': los valores no pueden ser negativos.'
    );
  }

  if (
    usd <= 0 &&
    eur <= 0 &&
    cop <= 0
  ) {
    throw new Error(
      'Fila ' +
      numero +
      ': debe registrar por lo menos un valor ' +
      'mayor que cero en USD, EUR o COP.'
    );
  }

  return {
    proveedor: proveedorMaestro.nombre,
    etaEtd: etaEtd,
    usd: usd,
    eur: eur,
    cop: cop,
    observaciones:
      rpLimpiarTexto_(origen.observaciones)
  };
}

/**
 * Todas las filas de una misma operación deben tener
 * la misma ETA/ETD.
 *
 * @param {Array} filas
 */
function rpValidarMismaEtaEtd_(filas) {
  if (!filas.length) {
    return;
  }

  const primera =
    rpFechaISO_(filas[0].etaEtd);

  const diferente = filas.some(
    function (fila) {
      return rpFechaISO_(fila.etaEtd) !== primera;
    }
  );

  if (diferente) {
    throw new Error(
      'Todas las provisiones de una misma operación ' +
      'deben tener la misma ETA/ETD.'
    );
  }
}

/* ============================================================
 * DUPLICADOS
 * ============================================================ */

/**
 * Un posible duplicado se considera:
 *
 * REFERENCIA +
 * PROVEEDOR +
 * ETA/ETD +
 * USD +
 * EUR +
 * COP
 *
 * Sólo advierte. No bloquea si el frontend reenvía
 * confirmarDuplicados = true.
 *
 * @param {string} referencia
 * @param {Array} filasNuevas
 * @param {Array<number>} filasExcluir
 * @return {Array}
 */
function rpDetectarDuplicados_(
  referencia,
  filasNuevas,
  filasExcluir
) {
  const exclusiones = {};

  (filasExcluir || []).forEach(
    function (fila) {
      exclusiones[Number(fila)] = true;
    }
  );

  const existentes = rpLeerTodasLasProvisiones_()
    .filter(function (registro) {
      return (
        registro.referenciaAg === referencia &&
        registro.estado !== RP_CONFIG.ESTADO_ANULADA &&
        !exclusiones[registro.filaHoja]
      );
    });

  const clavesExistentes = {};

  existentes.forEach(function (registro) {
    clavesExistentes[
      rpClaveDuplicado_({
        proveedor: registro.proveedor,
        etaEtd: registro.etaEtdDate,
        usd: registro.usd,
        eur: registro.eur,
        cop: registro.cop
      })
    ] = registro;
  });

  const vistosEnCarga = {};
  const duplicados = [];

  filasNuevas.forEach(function (fila, indice) {
    const clave = rpClaveDuplicado_(fila);

    if (clavesExistentes[clave]) {
      duplicados.push({
        tipo: 'EXISTENTE',
        filaFormulario: indice + 1,
        proveedor: fila.proveedor,
        etaEtd: rpFechaISO_(fila.etaEtd)
      });
    }

    if (vistosEnCarga[clave]) {
      duplicados.push({
        tipo: 'MISMA_CARGA',
        filaFormulario: indice + 1,
        proveedor: fila.proveedor,
        etaEtd: rpFechaISO_(fila.etaEtd)
      });
    }

    vistosEnCarga[clave] = true;
  });

  return duplicados;
}

/**
 * @param {Object} fila
 * @return {string}
 */
function rpClaveDuplicado_(fila) {
  return [
    rpClaveTexto_(fila.proveedor),
    rpFechaISO_(fila.etaEtd),
    rpNumero_(fila.usd).toFixed(4),
    rpNumero_(fila.eur).toFixed(4),
    rpNumero_(fila.cop).toFixed(4)
  ].join('|');
}

/* ============================================================
 * KPIs Y FILTROS
 * ============================================================ */

/**
 * @param {Array} registros
 * @return {Object}
 */
function rpConstruirKpis_(registros) {
  const hoy = new Date();

  const claveActual =
    rpClaveSemana_(hoy);

  const anterior = new Date(hoy);
  anterior.setDate(anterior.getDate() - 7);

  const claveAnterior =
    rpClaveSemana_(anterior);

  const actual = {
    usd: 0,
    eur: 0,
    cop: 0,
    registros: 0,
    operaciones: {}
  };

  const previa = {
    usd: 0,
    eur: 0,
    cop: 0,
    registros: 0,
    operaciones: {}
  };

  registros.forEach(function (registro) {
    let destino = null;

    if (registro.semanaClave === claveActual) {
      destino = actual;
    } else if (
      registro.semanaClave === claveAnterior
    ) {
      destino = previa;
    }

    if (!destino) {
      return;
    }

    destino.usd += registro.usd;
    destino.eur += registro.eur;
    destino.cop += registro.cop;
    destino.registros += 1;
    destino.operaciones[registro.referenciaAg] = true;
  });

  return {
    semanaActual: {
      clave: claveActual,
      etiqueta: rpEtiquetaSemana_(hoy),
      usd: actual.usd,
      eur: actual.eur,
      cop: actual.cop,
      cantidadRegistros: actual.registros,
      cantidadOperaciones:
        Object.keys(actual.operaciones).length
    },

    semanaAnterior: {
      clave: claveAnterior,
      etiqueta: rpEtiquetaSemana_(anterior),
      usd: previa.usd,
      eur: previa.eur,
      cop: previa.cop,
      cantidadRegistros: previa.registros,
      cantidadOperaciones:
        Object.keys(previa.operaciones).length
    }
  };
}

/**
 * @param {Array} registros
 * @return {Object}
 */
function rpConstruirFiltros_(registros) {
  const clientes = {};
  const referencias = {};
  const semanas = {};

  registros.forEach(function (registro) {
    if (registro.cliente) {
      clientes[registro.cliente] = true;
    }

    if (registro.referenciaAg) {
      referencias[registro.referenciaAg] = true;
    }

    if (registro.semanaClave) {
      semanas[registro.semanaClave] =
        registro.semanaEtiqueta;
    }
  });

  return {
    clientes: Object.keys(clientes).sort(
      function (a, b) {
        return a.localeCompare(
          b,
          'es',
          { sensitivity: 'base' }
        );
      }
    ),

    referencias: Object.keys(referencias).sort(),

    semanas: Object.keys(semanas)
      .sort()
      .map(function (clave) {
        return {
          clave: clave,
          etiqueta: semanas[clave]
        };
      })
  };
}

/* ============================================================
 * FILTROS PARA EXPORTACIÓN
 * ============================================================ */

/**
 * @param {Array} registros
 * @param {Object} filtros
 * @return {Array}
 */
function rpAplicarFiltrosServidor_(
  registros,
  filtros
) {
  const cliente =
    rpClaveTexto_(filtros.cliente);

  const referencia =
    rpNormalizarReferencia_(
      filtros.referenciaAg
    );

  const proveedor =
    rpClaveTexto_(filtros.proveedor);

  const semana =
    rpLimpiarTexto_(filtros.semana);

  const tipo =
    rpNormalizarMayusculas_(
      filtros.tipoOperacion
    );

  const busqueda =
    rpClaveTexto_(filtros.busqueda);

  return registros.filter(function (registro) {
    if (
      cliente &&
      rpClaveTexto_(registro.cliente) !== cliente
    ) {
      return false;
    }

    if (
      referencia &&
      registro.referenciaAg !== referencia
    ) {
      return false;
    }

    if (
      proveedor &&
      rpClaveTexto_(registro.proveedor) !== proveedor
    ) {
      return false;
    }

    if (
      semana &&
      registro.semanaClave !== semana
    ) {
      return false;
    }

    if (
      tipo &&
      registro.tipoOperacion !== tipo
    ) {
      return false;
    }

    if (busqueda) {
      const texto = rpClaveTexto_([
        registro.referenciaAg,
        registro.do,
        registro.cliente,
        registro.proveedor,
        registro.observaciones
      ].join(' '));

      if (texto.indexOf(busqueda) === -1) {
        return false;
      }
    }

    return true;
  });
}

/* ============================================================
 * PERÍODO DE DOS MESES
 * ============================================================ */

/**
 * Por defecto:
 * mes actual + mes anterior.
 *
 * Si recibe año/mes:
 * mes seleccionado + mes inmediatamente anterior.
 *
 * @param {number|string=} anio
 * @param {number|string=} mes
 * @return {Object}
 */
function rpResolverPeriodo_(anio, mes) {
  const hoy = new Date();

  let anioObjetivo = Number(anio);
  let mesObjetivo = Number(mes);

  if (
    !Number.isFinite(anioObjetivo) ||
    !Number.isFinite(mesObjetivo) ||
    mesObjetivo < 1 ||
    mesObjetivo > 12
  ) {
    anioObjetivo = hoy.getFullYear();
    mesObjetivo = hoy.getMonth() + 1;
  }

  /*
   * El mes seleccionado es el MES FINAL visible.
   *
   * Ejemplo:
   * mesObjetivo = septiembre
   *
   * inicio:
   * 1 de agosto
   *
   * finExclusivo:
   * 1 de octubre
   *
   * Resultado:
   * agosto + septiembre
   */
  const inicio = new Date(
    anioObjetivo,
    mesObjetivo - 2,
    1
  );

  const finExclusivo = new Date(
    anioObjetivo,
    mesObjetivo,
    1
  );

  return {
    inicio: inicio,
    finExclusivo: finExclusivo,

    mesInicial:
      inicio.getMonth() + 1,

    anioInicial:
      inicio.getFullYear(),

    mesFinal:
      mesObjetivo,

    anioFinal:
      anioObjetivo
  };
}

/**
 * @param {Object} periodo
 * @return {Object}
 */
function rpSerializarPeriodo_(periodo) {
  return {
    inicio: rpFechaISO_(periodo.inicio),

    fin: rpFechaISO_(
      new Date(
        periodo.finExclusivo.getFullYear(),
        periodo.finExclusivo.getMonth(),
        0
      )
    ),

    mesInicial: periodo.mesInicial,
    anioInicial: periodo.anioInicial,

    mesFinal: periodo.mesFinal,
    anioFinal: periodo.anioFinal
  };
}

/* ============================================================
 * ESTRUCTURA Y VALIDACIÓN DE HOJAS
 * ============================================================ */

/**
 * Valida A:M y crea N:P si están vacíos.
 *
 * No modifica columnas existentes.
 */
function rpPrepararEstructura_() {
  const ss = rpAbrirLibro_();

  const sheet = ss.getSheetByName(
    RP_CONFIG.HOJA_PROVISIONES
  );

  if (!sheet) {
    throw new Error(
      'No existe la hoja ' +
      RP_CONFIG.HOJA_PROVISIONES +
      '.'
    );
  }

  const encabezados = sheet
    .getRange(1, 1, 1, 16)
    .getDisplayValues()[0];

  /*
   * Validar A:M.
   */
  for (let i = 0; i < 13; i++) {
    const actual =
      rpNormalizarMayusculas_(encabezados[i]);

    const esperado =
      rpNormalizarMayusculas_(
        RP_CONFIG.ENCABEZADOS_PROVISIONES[i]
      );

    if (actual !== esperado) {
      throw new Error(
        'La columna ' +
        convertirNumeroColumnaALetra_(i + 1) +
        ' de ' +
        RP_CONFIG.HOJA_PROVISIONES +
        ' debe llamarse "' +
        RP_CONFIG.ENCABEZADOS_PROVISIONES[i] +
        '". Actualmente contiene "' +
        encabezados[i] +
        '".'
      );
    }
  }

  /*
   * Columnas técnicas N:P.
   */
  let actualizar = false;

  for (let i = 13; i < 16; i++) {
    if (
      !rpLimpiarTexto_(encabezados[i])
    ) {
      actualizar = true;
    } else {
      const actual =
        rpNormalizarMayusculas_(encabezados[i]);

      const esperado =
        rpNormalizarMayusculas_(
          RP_CONFIG.ENCABEZADOS_PROVISIONES[i]
        );

      if (actual !== esperado) {
        throw new Error(
          'La columna ' +
          convertirNumeroColumnaALetra_(i + 1) +
          ' ya contiene un encabezado diferente: "' +
          encabezados[i] +
          '".'
        );
      }
    }
  }

  if (actualizar) {
    sheet
      .getRange(1, 14, 1, 3)
      .setValues(rpValoresSeguros_([[
        'ESTADO',
        'FECHA_MODIFICACION',
        'MODIFICADO_POR'
      ]]));

    sheet.setFrozenRows(1);
  }

  rpPrepararHistorialReprogramaciones_();
}

function rpPrepararHistorialReprogramaciones_() {
  const ss =
    rpAbrirLibro_();

  let sheet =
    ss.getSheetByName(
      RP_CONFIG.HOJA_HISTORIAL_REPROGRAMACIONES
    );

  if (!sheet) {
    sheet =
      ss.insertSheet(
        RP_CONFIG.HOJA_HISTORIAL_REPROGRAMACIONES
      );
  }

  const encabezadosEsperados =
    RP_CONFIG
      .ENCABEZADOS_HISTORIAL_REPROGRAMACIONES;

  const cantidadColumnas =
    encabezadosEsperados.length;

  const encabezadosActuales =
    sheet
      .getRange(
        1,
        1,
        1,
        cantidadColumnas
      )
      .getDisplayValues()[0];

  const filaVacia =
    encabezadosActuales.every(
      function (valor) {
        return !rpLimpiarTexto_(valor);
      }
    );

  if (filaVacia) {
    sheet
      .getRange(
        1,
        1,
        1,
        cantidadColumnas
      )
      .setValues(rpValoresSeguros_([
        encabezadosEsperados
      ]));

    sheet.setFrozenRows(1);

    return;
  }

  encabezadosEsperados.forEach(
    function (esperado, indice) {
      const actual =
        rpNormalizarMayusculas_(
          encabezadosActuales[indice]
        );

      const esperadoNormalizado =
        rpNormalizarMayusculas_(
          esperado
        );

      if (
        actual !==
        esperadoNormalizado
      ) {
        throw new Error(
          'La columna ' +
          convertirNumeroColumnaALetra_(
            indice + 1
          ) +
          ' de ' +
          RP_CONFIG
            .HOJA_HISTORIAL_REPROGRAMACIONES +
          ' debe llamarse "' +
          esperado +
          '". Actualmente contiene "' +
          encabezadosActuales[indice] +
          '".'
        );
      }
    }
  );

  sheet.setFrozenRows(1);
}
function rpRegistrarReprogramacion_(datos) {
  const info = datos || {};

  const sheet = rpAbrirLibro_()
    .getSheetByName(
      RP_CONFIG.HOJA_HISTORIAL_REPROGRAMACIONES
    );

  if (!sheet) {
    throw new Error(
      'No existe la hoja ' +
      RP_CONFIG.HOJA_HISTORIAL_REPROGRAMACIONES +
      '.'
    );
  }

  const filaNueva =
    sheet.getLastRow() + 1;

  sheet
    .getRange(
      filaNueva,
      1,
      1,
      RP_CONFIG
        .ENCABEZADOS_HISTORIAL_REPROGRAMACIONES
        .length
    )
    .setValues(rpValoresSeguros_([[
      info.referenciaAg || '',
      info.fechaCambio || new Date(),
      info.etaAnterior || '',
      info.etaNueva || '',
      info.mesAnterior || '',
      info.mesNuevo || '',
      info.semanaAnterior || '',
      info.semanaNueva || '',
      Number(info.totalUsd) || 0,
      Number(info.totalEur) || 0,
      Number(info.totalCop) || 0,
      Number(info.cantidadProveedores) || 0,
      info.usuario || '',
      info.tipoCambio || 'REPROGRAMACION ETA/ETD'
    ]]));

  sheet
    .getRange(
      filaNueva,
      2,
      1,
      1
    )
    .setNumberFormat(
      'dd/mm/yyyy hh:mm'
    );

  sheet
    .getRange(
      filaNueva,
      3,
      1,
      2
    )
    .setNumberFormat(
      'dd/mm/yyyy'
    );

  sheet
    .getRange(
      filaNueva,
      9,
      1,
      3
    )
    .setNumberFormat(
      '#,##0.00'
    );
}

/* ============================================================
 * FORMATO DE FILAS
 * ============================================================ */

/**
 * Aplica únicamente formatos funcionales.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} filaInicial
 * @param {number} cantidad
 */
function rpAplicarFormatosFilas_(
  sheet,
  filaInicial,
  cantidad
) {
  if (!cantidad) {
    return;
  }

  sheet
    .getRange(filaInicial, 1, cantidad, 1)
    .setNumberFormat('dd/mm/yyyy hh:mm');

  sheet
    .getRange(filaInicial, 8, cantidad, 1)
    .setNumberFormat('dd/mm/yyyy');

  sheet
    .getRange(filaInicial, 9, cantidad, 2)
    .setNumberFormat('#,##0.00');

  sheet
    .getRange(filaInicial, 11, cantidad, 1)
    .setNumberFormat('#,##0.00');

  sheet
    .getRange(filaInicial, 15, cantidad, 1)
    .setNumberFormat('dd/mm/yyyy hh:mm');
}

/* ============================================================
 * REFERENCIAS Y D.O.
 * ============================================================ */

/**
 * @param {*} valor
 * @return {string}
 */
function rpNormalizarReferencia_(valor) {
  return rpNormalizarMayusculas_(valor)
    .replace(/\s+/g, '');
}

/**
 * AGM + cuatro números
 * AGX + cuatro números
 *
 * @param {string} referencia
 */
function rpValidarReferencia_(referencia) {
  if (!/^(AGM|AGX)\d{4}$/.test(referencia)) {
    throw new Error(
      'La referencia AG debe tener el formato ' +
      'AGM + 4 números o AGX + 4 números.'
    );
  }
}

/**
 * @param {*} valor
 * @return {string}
 */
function rpNormalizarDo_(valor) {
  if (
    valor === null ||
    valor === undefined ||
    valor === ''
  ) {
    return '';
  }

  return String(valor)
    .trim()
    .replace(/\s+/g, '');
}

/**
 * @param {string} doNumero
 */
function rpValidarDo_(doNumero) {
  if (!/^\d{9}$/.test(doNumero)) {
    throw new Error(
      'El D.O. debe contener exactamente 9 números.'
    );
  }
}

/**
 * @param {string} referencia
 * @return {string}
 */
function rpTipoOperacion_(referencia) {
  if (/^AGM\d{4}$/.test(referencia)) {
    return 'IMPORTACION';
  }

  if (/^AGX\d{4}$/.test(referencia)) {
    return 'EXPORTACION';
  }

  return '';
}

/* ============================================================
 * FECHAS Y SEMANAS
 * ============================================================ */

/**
 * @param {*} valor
 * @return {Date|null}
 */
function rpNormalizarFecha_(valor) {
  if (!valor) {
    return null;
  }

  if (
    Object.prototype.toString.call(valor) ===
      '[object Date]' &&
    !isNaN(valor.getTime())
  ) {
    return new Date(valor.getTime());
  }

  const texto = String(valor).trim();

  const iso = texto.match(
    /^(\d{4})-(\d{2})-(\d{2})/
  );

  if (iso) {
    const fecha = new Date(
      Number(iso[1]),
      Number(iso[2]) - 1,
      Number(iso[3])
    );

    if (!isNaN(fecha.getTime())) {
      return fecha;
    }
  }

  const fecha = new Date(valor);

  if (isNaN(fecha.getTime())) {
    return null;
  }

  return fecha;
}

/**
 * @param {Date} fecha
 * @return {string}
 */
function rpFechaISO_(fecha) {
  if (!fecha || isNaN(fecha.getTime())) {
    return '';
  }

  return Utilities.formatDate(
    fecha,
    RP_CONFIG.ZONA_HORARIA,
    'yyyy-MM-dd'
  );
}

/**
 * @param {Date} fecha
 * @return {string}
 */
function rpFechaHoraISO_(fecha) {
  if (!fecha || isNaN(fecha.getTime())) {
    return '';
  }

  return Utilities.formatDate(
    fecha,
    RP_CONFIG.ZONA_HORARIA,
    "yyyy-MM-dd'T'HH:mm:ss"
  );
}

/**
 * Semana ISO, lunes a domingo.
 *
 * @param {Date} fecha
 * @return {number}
 */
function rpNumeroSemanaISO_(fecha) {
  const fechaUtc = new Date(
    Date.UTC(
      fecha.getFullYear(),
      fecha.getMonth(),
      fecha.getDate()
    )
  );

  const diaSemana =
    fechaUtc.getUTCDay() || 7;

  fechaUtc.setUTCDate(
    fechaUtc.getUTCDate() + 4 - diaSemana
  );

  const inicioAnio = new Date(
    Date.UTC(
      fechaUtc.getUTCFullYear(),
      0,
      1
    )
  );

  return Math.ceil(
    (
      (
        fechaUtc - inicioAnio
      ) / 86400000 + 1
    ) / 7
  );
}

/**
 * @param {Date} fecha
 * @return {number}
 */
function rpAnioSemanaISO_(fecha) {
  const fechaUtc = new Date(
    Date.UTC(
      fecha.getFullYear(),
      fecha.getMonth(),
      fecha.getDate()
    )
  );

  const dia =
    fechaUtc.getUTCDay() || 7;

  fechaUtc.setUTCDate(
    fechaUtc.getUTCDate() + 4 - dia
  );

  return fechaUtc.getUTCFullYear();
}

/**
 * @param {Date} fecha
 * @return {string}
 */
function rpClaveSemana_(fecha) {
  const anio = rpAnioSemanaISO_(fecha);
  const semana = rpNumeroSemanaISO_(fecha);

  return (
    anio +
    '-W' +
    String(semana).padStart(2, '0')
  );
}

/**
 * Ejemplo:
 * Semana 39 · 21 al 27 Sep
 *
 * @param {Date} fecha
 * @return {string}
 */
function rpEtiquetaSemana_(fecha) {
  const copia = new Date(
    fecha.getFullYear(),
    fecha.getMonth(),
    fecha.getDate()
  );

  const diaSemana = copia.getDay() || 7;

  const lunes = new Date(copia);
  lunes.setDate(
    copia.getDate() - diaSemana + 1
  );

  const domingo = new Date(lunes);
  domingo.setDate(
    lunes.getDate() + 6
  );

  const semana =
    rpNumeroSemanaISO_(fecha);

  const diaInicio =
    Utilities.formatDate(
      lunes,
      RP_CONFIG.ZONA_HORARIA,
      'd'
    );

  const diaFin =
    Utilities.formatDate(
      domingo,
      RP_CONFIG.ZONA_HORARIA,
      'd'
    );

  const mesFin =
    rpNombreMesCorto_(domingo);

  return (
    'Semana ' +
    semana +
    ' · ' +
    diaInicio +
    ' al ' +
    diaFin +
    ' ' +
    mesFin
  );
}

/**
 * @param {Date} fecha
 * @return {string}
 */
function rpNombreMes_(fecha) {
  const meses = [
    'ENERO',
    'FEBRERO',
    'MARZO',
    'ABRIL',
    'MAYO',
    'JUNIO',
    'JULIO',
    'AGOSTO',
    'SEPTIEMBRE',
    'OCTUBRE',
    'NOVIEMBRE',
    'DICIEMBRE'
  ];

  return meses[fecha.getMonth()];
}

/**
 * @param {Date} fecha
 * @return {string}
 */
function rpNombreMesCorto_(fecha) {
  const meses = [
    'Ene',
    'Feb',
    'Mar',
    'Abr',
    'May',
    'Jun',
    'Jul',
    'Ago',
    'Sep',
    'Oct',
    'Nov',
    'Dic'
  ];

  return meses[fecha.getMonth()];
}

/* ============================================================
 * NÚMEROS
 * ============================================================ */

/**
 * Convierte valores de frontend o Sheets en Number.
 *
 * El frontend debe enviar números puros siempre que sea posible.
 *
 * También tolera:
 * 1500000
 * "1500000"
 * "1.500.000"
 * "1,500,000"
 * "1500,50"
 * "1500.50"
 *
 * @param {*} valor
 * @return {number}
 */
function rpNumero_(valor) {
  if (
    valor === null ||
    valor === undefined ||
    valor === ''
  ) {
    return 0;
  }

  if (
    typeof valor === 'number' &&
    isFinite(valor)
  ) {
    return valor;
  }

  let texto = String(valor)
    .trim()
    .replace(/\s/g, '');

  if (!texto) {
    return 0;
  }

  /*
   * Sólo coma.
   * Puede ser decimal o separador de miles.
   */
  if (
    texto.indexOf(',') !== -1 &&
    texto.indexOf('.') === -1
  ) {
    const partes = texto.split(',');

    if (
      partes.length === 2 &&
      partes[1].length <= 2
    ) {
      texto =
        partes[0].replace(/\./g, '') +
        '.' +
        partes[1];
    } else {
      texto = texto.replace(/,/g, '');
    }
  }

  /*
   * Sólo punto.
   */
  else if (
    texto.indexOf('.') !== -1 &&
    texto.indexOf(',') === -1
  ) {
    const partes = texto.split('.');

    if (
      partes.length > 2 ||
      (
        partes.length === 2 &&
        partes[1].length === 3 &&
        partes[0].length >= 1
      )
    ) {
      texto = texto.replace(/\./g, '');
    }
  }

  /*
   * Punto + coma.
   * El último separador se interpreta como decimal.
   */
  else if (
    texto.indexOf('.') !== -1 &&
    texto.indexOf(',') !== -1
  ) {
    const ultimoPunto =
      texto.lastIndexOf('.');

    const ultimaComa =
      texto.lastIndexOf(',');

    if (ultimaComa > ultimoPunto) {
      texto = texto
        .replace(/\./g, '')
        .replace(',', '.');
    } else {
      texto = texto.replace(/,/g, '');
    }
  }

  const numero = Number(texto);

  return isFinite(numero)
    ? numero
    : 0;
}

/* ============================================================
 * USUARIO
 * ============================================================ */

/**
 * Usa primero el usuario proporcionado por el frontend.
 * Si no llega, intenta correo de sesión.
 *
 * @param {*} usuarioFrontend
 * @return {string}
 */
/** @param {{nombre:string}} usuario @returns {string} */
function rpResolverUsuario_(usuario) {
  if (!usuario || !usuario.nombre) throw agLoginAuthFault_();
  return usuario.nombre;
}

/* ============================================================
 * TEXTO
 * ============================================================ */

/**
 * @param {*} valor
 * @return {string}
 */
function rpLimpiarTexto_(valor) {
  if (
    valor === null ||
    valor === undefined
  ) {
    return '';
  }

  return String(valor)
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * @param {*} valor
 * @return {string}
 */
function rpNormalizarMayusculas_(valor) {
  return rpLimpiarTexto_(valor)
    .toUpperCase();
}

/**
 * Para comparaciones de nombres.
 *
 * @param {*} valor
 * @return {string}
 */
function rpClaveTexto_(valor) {
  return rpNormalizarMayusculas_(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/* ============================================================
 * ERRORES
 * ============================================================ */

/**
 * Conserva el error real pero agrega contexto.
 *
 * @param {string} contexto
 * @param {*} error
 * @return {Error}
 */
/** @param {string} contexto @param {Error} error @returns {Error} */
function rpError_(contexto, error) {
  if (error instanceof AgLoginFault) return error;
  if (error instanceof RoFault) return new Error(error.message);
  return new Error(contexto + (error && error.message ? ' ' + error.message : ''));
}
function rpPruebaBuscarOperacion_(idToken) {
  const resultado = rpBuscarOperacion(idToken, 'AGM6773');
  Logger.log(JSON.stringify(resultado, null, 2));
}
function rpPruebaOperacionSinDo_(idToken) {
  const resultado = rpBuscarOperacion(idToken, 'AGM6776');
  Logger.log(JSON.stringify(resultado, null, 2));
}
function rpPruebaOperacionInexistente_(idToken) {
  const resultado = rpBuscarOperacion(idToken, 'AGM9999');
  Logger.log(JSON.stringify(resultado, null, 2));
}
function rpPruebaClientesActivos_(idToken) {
  const resultado = rpObtenerClientesActivos(idToken);
  Logger.log(JSON.stringify(resultado, null, 2));
}
function rpPruebaProveedoresActivos_(idToken) {
  const resultado = rpObtenerProveedoresActivos(idToken);
  Logger.log(JSON.stringify(resultado, null, 2));
}
function rpDiagnosticoDashboard_(idToken) {
  agLoginRequerirUsuario_(idToken);
  const ss = rpAbrirLibro_();
  const sheet = ss.getSheetByName('CONTROL_REPORTE_PROVISIONES');

  if (!sheet) {
    throw new Error('No existe CONTROL_REPORTE_PROVISIONES.');
  }

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  Logger.log('===== DIAGNÓSTICO MÓDULO 03 =====');
  Logger.log('Última fila física: ' + lastRow);
  Logger.log('Última columna física: ' + lastColumn);

  if (lastRow >= 1) {
    const headers = sheet
      .getRange(1, 1, 1, lastColumn)
      .getDisplayValues()[0];

    Logger.log(
      'ENCABEZADOS: ' +
      JSON.stringify(headers)
    );
  }

  if (lastRow >= 2) {
    const inicio = Math.max(2, lastRow - 4);

    const ultimasFilas = sheet
      .getRange(
        inicio,
        1,
        lastRow - inicio + 1,
        lastColumn
      )
      .getDisplayValues();

    Logger.log(
      'ÚLTIMAS FILAS DE SHEETS: ' +
      JSON.stringify(
        ultimasFilas,
        null,
        2
      )
    );
  }

  const resultado = rpObtenerDashboard(idToken, {
    anio: 2026,
    mes: 9
  });

  Logger.log(
    'RESPUESTA rpObtenerDashboard: ' +
    JSON.stringify(
      resultado,
      null,
      2
    )
  );

  Logger.log('===== FIN DIAGNÓSTICO =====');
}
function rpMedirTiempo_(etiqueta, inicioMs) {
  const duracionMs =
    Date.now() - inicioMs;

  console.log(
    '[RP PERF] ' +
    etiqueta +
    ': ' +
    duracionMs +
    ' ms'
  );

  return duracionMs;
}

/** @type {GoogleAppsScript.Spreadsheet.Spreadsheet|null} */
let rpLibroCache_ = null;
/** @returns {GoogleAppsScript.Spreadsheet.Spreadsheet} */
function rpAbrirLibro_() {
  if (!rpLibroCache_) rpLibroCache_ = SpreadsheetApp.openById(agLoginConfig_().spreadsheetId);
  return rpLibroCache_;
}
/** @param {Object<string,RoOperacion>} operaciones @param {string} referencia @param {string} version @returns {RoOperacion} */
function rpExigirOperacion_(operaciones, referencia, version) {
  const op = operaciones[referencia];
  if (!op) throw new RoFault('OPERACION_NO_EXISTE','Registre la operación '+referencia+' antes de provisionar.');
  const faltantes = [];
  if (!String(op.cliente || '').trim()) faltantes.push('Cliente');
  if (!String(op.blGuia || '').trim()) faltantes.push('BL / Guía de referencia');
  if (faltantes.length) {
    throw new RoFault(
      'OPERACION_INCOMPLETA',
      'La operación ' + referencia + ' tiene información pendiente: ' +
      faltantes.join(' y ') + '. Selecciona «Completar / corregir operación», ' +
      'guarda los datos y vuelve a guardar la provisión. Los datos pendientes del formulario se conservan.'
    );
  }
  if (op.do && !/^\d{9}$/.test(op.do)) throw new RoFault('DO_INVALIDO','Corrija el D.O. de la operación; debe contener nueve números o quedar pendiente.');
  if (typeof version !== 'string' || version !== op.version) throw new RoFault('DATOS_DESACTUALIZADOS','La operación cambió. Consulte sus datos nuevamente antes de guardar.');
  return op;
}
/** Mantiene texto literal al escribir datos y exportaciones. @param {Array<Array<unknown>>} rows @returns {Array<Array<unknown>>} */
function rpValoresSeguros_(rows) {
  return rows.map(function(row) { return row.map(function(value) { return typeof value === 'string' && /^=/.test(value) ? "'" + value : value; }); });
}
