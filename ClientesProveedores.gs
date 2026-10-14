/**
 * ============================================================
 * AG OPERATIONS
 * MÓDULO 02 - CLIENTES Y PROVEEDORES
 * ============================================================
 *
 * Hoja maestra:
 * LISTADO_CLIENTES_PROVEEDORES
 *
 * Estructura esperada:
 * A = ID
 * B = NOMBRE CLIENTE
 * C = NIT
 * D = ESTADO CLIENTE
 * E = TIPO TERCERO
 *
 * Funciones:
 * - Consultar terceros
 * - Crear terceros
 * - Editar terceros
 * - Activar terceros
 * - Inactivar terceros
 * - Validar NIT único
 * - Advertir nombres duplicados
 * - Generar consecutivos TER-XXXX
 * - Protección de concurrencia con LockService
 */


const CP_CONFIG = Object.freeze({
  SHEET_NAME: 'LISTADO_CLIENTES_PROVEEDORES',

  HEADERS: Object.freeze([
    'ID',
    'NOMBRE CLIENTE',
    'NIT',
    'ESTADO CLIENTE',
    'TIPO TERCERO'
  ]),

  STATUS: Object.freeze({
    ACTIVE: 'ACTIVO',
    INACTIVE: 'INACTIVO'
  }),

  TYPES: Object.freeze([
    'PROVEEDOR OPERATIVO',
    'CLIENTE',
    'AGENTE EXTERIOR'
  ]),

  ID_PREFIX: 'TER-',
  ID_DIGITS: 4,

  LOCK_TIMEOUT_MS: 30000
});


/**
 * ============================================================
 * API PÚBLICA DEL MÓDULO
 * ============================================================
 */


/**
 * Obtiene todos los terceros registrados.
 *
 * La paginación, búsqueda y filtros se manejarán en el cliente
 * porque la base actual es pequeña y esto permite una interfaz
 * más rápida después de la carga inicial.
 *
 * @return {Object}
 */
function cpObtenerTerceros() {
  try {
    const sheet = cpObtenerHoja_();
    cpValidarEncabezados_(sheet);

    const lastRow = sheet.getLastRow();

    if (lastRow < 2) {
      return {
        ok: true,
        terceros: [],
        total: 0
      };
    }

    const values = sheet
      .getRange(2, 1, lastRow - 1, CP_CONFIG.HEADERS.length)
      .getDisplayValues();

    const terceros = values
      .map(function(row, index) {
        return cpConstruirTerceroDesdeFila_(
          row,
          index + 2
        );
      })
      .filter(function(tercero) {
        return tercero.id !== '';
      });

    terceros.sort(cpOrdenarPorIdDesc_);

    return {
      ok: true,
      terceros: terceros,
      total: terceros.length
    };

  } catch (error) {
    throw new Error(
      'No fue posible cargar los clientes y proveedores. ' +
      cpMensajeError_(error)
    );
  }
}


/**
 * Devuelve información preliminar para abrir el formulario
 * de creación.
 *
 * El ID devuelto aquí es solamente informativo.
 * El ID definitivo se vuelve a calcular dentro de un bloqueo
 * justo antes de guardar.
 *
 * @return {Object}
 */
function cpObtenerDatosNuevoTercero() {
  try {
    const sheet = cpObtenerHoja_();
    cpValidarEncabezados_(sheet);

    return {
      ok: true,
      siguienteId: cpObtenerSiguienteId_(sheet),
      estado: CP_CONFIG.STATUS.ACTIVE,
      tipos: CP_CONFIG.TYPES.slice()
    };

  } catch (error) {
    throw new Error(
      'No fue posible preparar el nuevo tercero. ' +
      cpMensajeError_(error)
    );
  }
}


/**
 * Valida los datos de un tercero antes de que el usuario
 * confirme definitivamente su creación.
 *
 * Esta función NO guarda información.
 *
 * @param {Object} data
 * @return {Object}
 */
function cpValidarNuevoTercero(data) {
  try {
    const datos = cpPrepararDatosEntrada_(data);
    const sheet = cpObtenerHoja_();

    cpValidarEncabezados_(sheet);
    cpValidarCamposTercero_(datos);

    const registros = cpLeerRegistros_(sheet);

    const duplicadoNit = cpBuscarDuplicadoNit_(
      registros,
      datos.nit,
      ''
    );

    if (duplicadoNit) {
      return {
        ok: false,
        tipo: 'NIT_DUPLICADO',
        mensaje:
          'El NIT ' +
          datos.nit +
          ' ya está registrado como ' +
          duplicadoNit.id +
          ' · ' +
          duplicadoNit.nombre +
          '.',
        terceroExistente: duplicadoNit
      };
    }

    const duplicadoNombre = cpBuscarDuplicadoNombre_(
      registros,
      datos.nombre,
      ''
    );

    if (duplicadoNombre) {
      return {
        ok: true,
        requiereConfirmacion: true,
        tipo: 'NOMBRE_DUPLICADO',
        mensaje:
          'Ya existe un tercero con el nombre "' +
          duplicadoNombre.nombre +
          '" registrado como ' +
          duplicadoNombre.id +
          '. El NIT es diferente.',
        terceroExistente: duplicadoNombre,
        datosNormalizados: datos
      };
    }

    return {
      ok: true,
      requiereConfirmacion: false,
      datosNormalizados: datos
    };

  } catch (error) {
    throw new Error(
      'No fue posible validar el tercero. ' +
      cpMensajeError_(error)
    );
  }
}


/**
 * Crea un tercero nuevo.
 *
 * El servidor:
 * 1. Obtiene bloqueo.
 * 2. Vuelve a validar los datos.
 * 3. Vuelve a comprobar el NIT.
 * 4. Calcula el ID definitivo.
 * 5. Inserta la fila.
 *
 * @param {Object} data
 * @return {Object}
 */
function cpCrearTercero(data) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(CP_CONFIG.LOCK_TIMEOUT_MS);

    const datos = cpPrepararDatosEntrada_(data);
    const sheet = cpObtenerHoja_();

    cpValidarEncabezados_(sheet);
    cpValidarCamposTercero_(datos);

    const registros = cpLeerRegistros_(sheet);

    const duplicadoNit = cpBuscarDuplicadoNit_(
      registros,
      datos.nit,
      ''
    );

    if (duplicadoNit) {
      throw new Error(
        'El NIT ' +
        datos.nit +
        ' ya está registrado como ' +
        duplicadoNit.id +
        ' · ' +
        duplicadoNit.nombre +
        '.'
      );
    }

    const duplicadoNombre = cpBuscarDuplicadoNombre_(
      registros,
      datos.nombre,
      ''
    );

    if (
      duplicadoNombre &&
      data &&
      data.confirmarNombreDuplicado !== true
    ) {
      return {
        ok: false,
        requiereConfirmacion: true,
        tipo: 'NOMBRE_DUPLICADO',
        mensaje:
          'Ya existe un tercero con el nombre "' +
          duplicadoNombre.nombre +
          '" registrado como ' +
          duplicadoNombre.id +
          '. El NIT es diferente.',
        terceroExistente: duplicadoNombre
      };
    }

    const nuevoId = cpObtenerSiguienteId_(sheet);

    const nuevaFila = [
      nuevoId,
      datos.nombre,
      datos.nit,
      CP_CONFIG.STATUS.ACTIVE,
      datos.tipo
    ];

    sheet.appendRow(nuevaFila);

    SpreadsheetApp.flush();

    return {
      ok: true,
      mensaje: 'Tercero creado correctamente.',
      tercero: {
        id: nuevoId,
        nombre: datos.nombre,
        nit: datos.nit,
        estado: CP_CONFIG.STATUS.ACTIVE,
        tipo: datos.tipo
      }
    };

  } catch (error) {
    throw new Error(
      'No fue posible crear el tercero. ' +
      cpMensajeError_(error)
    );

  } finally {
    try {
      lock.releaseLock();
    } catch (ignored) {
      // El bloqueo puede no haberse adquirido si ocurrió
      // una excepción antes de waitLock().
    }
  }
}


/**
 * Obtiene un tercero concreto por ID.
 *
 * Se utilizará para cargar el modal de edición con información
 * actualizada directamente desde la hoja.
 *
 * @param {string} id
 * @return {Object}
 */
function cpObtenerTerceroPorId(id) {
  try {
    const idNormalizado = cpNormalizarId_(id);

    if (!idNormalizado) {
      throw new Error('El ID del tercero es obligatorio.');
    }

    const sheet = cpObtenerHoja_();
    cpValidarEncabezados_(sheet);

    const registros = cpLeerRegistros_(sheet);

    const tercero = registros.find(function(item) {
      return item.id === idNormalizado;
    });

    if (!tercero) {
      throw new Error(
        'No existe el tercero ' + idNormalizado + '.'
      );
    }

    return {
      ok: true,
      tercero: tercero,
      tipos: CP_CONFIG.TYPES.slice()
    };

  } catch (error) {
    throw new Error(
      'No fue posible consultar el tercero. ' +
      cpMensajeError_(error)
    );
  }
}


/**
 * Valida una edición antes de guardar.
 *
 * No modifica la hoja.
 *
 * @param {Object} data
 * @return {Object}
 */
function cpValidarEdicionTercero(data) {
  try {
    const datos = cpPrepararDatosEntrada_(data);
    const id = cpNormalizarId_(
      data && data.id
    );

    if (!id) {
      throw new Error('El ID del tercero es obligatorio.');
    }

    const sheet = cpObtenerHoja_();

    cpValidarEncabezados_(sheet);
    cpValidarCamposTercero_(datos);

    const registros = cpLeerRegistros_(sheet);

    const actual = registros.find(function(item) {
      return item.id === id;
    });

    if (!actual) {
      throw new Error(
        'No existe el tercero ' + id + '.'
      );
    }

    const duplicadoNit = cpBuscarDuplicadoNit_(
      registros,
      datos.nit,
      id
    );

    if (duplicadoNit) {
      return {
        ok: false,
        tipo: 'NIT_DUPLICADO',
        mensaje:
          'El NIT ' +
          datos.nit +
          ' ya está registrado como ' +
          duplicadoNit.id +
          ' · ' +
          duplicadoNit.nombre +
          '.',
        terceroExistente: duplicadoNit
      };
    }

    const duplicadoNombre = cpBuscarDuplicadoNombre_(
      registros,
      datos.nombre,
      id
    );

    if (duplicadoNombre) {
      return {
        ok: true,
        requiereConfirmacion: true,
        tipo: 'NOMBRE_DUPLICADO',
        mensaje:
          'Ya existe otro tercero con el nombre "' +
          duplicadoNombre.nombre +
          '" registrado como ' +
          duplicadoNombre.id +
          '. El NIT es diferente.',
        terceroExistente: duplicadoNombre,
        datosNormalizados: {
          id: id,
          nombre: datos.nombre,
          nit: datos.nit,
          tipo: datos.tipo
        }
      };
    }

    return {
      ok: true,
      requiereConfirmacion: false,
      datosNormalizados: {
        id: id,
        nombre: datos.nombre,
        nit: datos.nit,
        tipo: datos.tipo
      }
    };

  } catch (error) {
    throw new Error(
      'No fue posible validar la edición. ' +
      cpMensajeError_(error)
    );
  }
}


/**
 * Edita un tercero existente.
 *
 * Solo modifica:
 * B = NOMBRE CLIENTE
 * C = NIT
 * E = TIPO TERCERO
 *
 * Nunca modifica:
 * A = ID
 * D = ESTADO CLIENTE
 *
 * @param {Object} data
 * @return {Object}
 */
function cpEditarTercero(data) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(CP_CONFIG.LOCK_TIMEOUT_MS);

    const id = cpNormalizarId_(
      data && data.id
    );

    if (!id) {
      throw new Error('El ID del tercero es obligatorio.');
    }

    const datos = cpPrepararDatosEntrada_(data);

    const estado = String(
      (data && data.estado) || ''
    )
      .trim()
      .toUpperCase();

    if (
      estado !== CP_CONFIG.STATUS.ACTIVE &&
      estado !== CP_CONFIG.STATUS.INACTIVE
    ) {
      throw new Error(
        'El estado debe ser ACTIVO o INACTIVO.'
      );
    }

    const sheet = cpObtenerHoja_();

    cpValidarEncabezados_(sheet);
    cpValidarCamposTercero_(datos);

    const registros = cpLeerRegistros_(sheet);

    const actual = registros.find(function(item) {
      return item.id === id;
    });

    if (!actual) {
      throw new Error(
        'No existe el tercero ' + id + '.'
      );
    }

    const duplicadoNit = cpBuscarDuplicadoNit_(
      registros,
      datos.nit,
      id
    );

    if (duplicadoNit) {
      throw new Error(
        'El NIT ' +
        datos.nit +
        ' ya está registrado como ' +
        duplicadoNit.id +
        ' · ' +
        duplicadoNit.nombre +
        '.'
      );
    }

    const duplicadoNombre = cpBuscarDuplicadoNombre_(
      registros,
      datos.nombre,
      id
    );

    if (
      duplicadoNombre &&
      data &&
      data.confirmarNombreDuplicado !== true
    ) {
      return {
        ok: false,
        requiereConfirmacion: true,
        tipo: 'NOMBRE_DUPLICADO',
        mensaje:
          'Ya existe otro tercero con el nombre "' +
          duplicadoNombre.nombre +
          '" registrado como ' +
          duplicadoNombre.id +
          '. El NIT es diferente.',
        terceroExistente: duplicadoNombre
      };
    }

    const row = actual.fila;

    // B = NOMBRE CLIENTE
    sheet
      .getRange(row, 2)
      .setValue(datos.nombre);

    // C = NIT
    sheet
      .getRange(row, 3)
      .setValue(datos.nit);

    // D = ESTADO CLIENTE
    sheet
      .getRange(row, 4)
      .setValue(estado);

    // E = TIPO TERCERO
    sheet
      .getRange(row, 5)
      .setValue(datos.tipo);

    SpreadsheetApp.flush();

    return {
      ok: true,
      mensaje: 'Tercero actualizado correctamente.',
      tercero: {
        id: id,
        nombre: datos.nombre,
        nit: datos.nit,
        estado: estado,
        tipo: datos.tipo
      }
    };

  } catch (error) {
    throw new Error(
      'No fue posible actualizar el tercero. ' +
      cpMensajeError_(error)
    );

  } finally {
    try {
      lock.releaseLock();
    } catch (ignored) {
      // Sin acción.
    }
  }
}


/**
 * Activa un tercero.
 *
 * Solo modifica la columna D: ESTADO CLIENTE.
 *
 * @param {string} id
 * @return {Object}
 */
function cpActivarTercero(id) {
  return cpCambiarEstadoTercero_(
    id,
    CP_CONFIG.STATUS.ACTIVE
  );
}


/**
 * Inactiva un tercero.
 *
 * Solo modifica la columna D: ESTADO CLIENTE.
 *
 * @param {string} id
 * @return {Object}
 */
function cpInactivarTercero(id) {
  return cpCambiarEstadoTercero_(
    id,
    CP_CONFIG.STATUS.INACTIVE
  );
}


/**
 * ============================================================
 * FUNCIONES INTERNAS
 * ============================================================
 */


/**
 * Obtiene la hoja maestra.
 *
 * @return {GoogleAppsScript.Spreadsheet.Sheet}
 */
function cpObtenerHoja_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss) {
    throw new Error(
      'No fue posible obtener el Google Sheet activo.'
    );
  }

  const sheet = ss.getSheetByName(
    CP_CONFIG.SHEET_NAME
  );

  if (!sheet) {
    throw new Error(
      'No existe la hoja "' +
      CP_CONFIG.SHEET_NAME +
      '".'
    );
  }

  return sheet;
}


/**
 * Verifica que la estructura A:E sea exactamente la esperada.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 */
function cpValidarEncabezados_(sheet) {
  const lastColumn = sheet.getLastColumn();

  if (lastColumn < CP_CONFIG.HEADERS.length) {
    throw new Error(
      'La hoja "' +
      CP_CONFIG.SHEET_NAME +
      '" no contiene las cinco columnas requeridas.'
    );
  }

  const headers = sheet
    .getRange(
      1,
      1,
      1,
      CP_CONFIG.HEADERS.length
    )
    .getDisplayValues()[0]
    .map(function(value) {
      return String(value || '').trim();
    });

  CP_CONFIG.HEADERS.forEach(function(expected, index) {
    if (headers[index] !== expected) {
      throw new Error(
        'Encabezado incorrecto en la columna ' +
        (index + 1) +
        '. Se esperaba "' +
        expected +
        '" y se encontró "' +
        headers[index] +
        '".'
      );
    }
  });
}


/**
 * Lee todos los registros existentes.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @return {Array<Object>}
 */
function cpLeerRegistros_(sheet) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  const values = sheet
    .getRange(
      2,
      1,
      lastRow - 1,
      CP_CONFIG.HEADERS.length
    )
    .getDisplayValues();

  return values
    .map(function(row, index) {
      return cpConstruirTerceroDesdeFila_(
        row,
        index + 2
      );
    })
    .filter(function(item) {
      return item.id !== '';
    });
}


/**
 * Convierte una fila de Sheets en un objeto del módulo.
 *
 * @param {Array} row
 * @param {number} sheetRow
 * @return {Object}
 */
function cpConstruirTerceroDesdeFila_(
  row,
  sheetRow
) {
  return {
    id: cpNormalizarId_(row[0]),
    nombre: String(row[1] || '').trim(),
    nit: String(row[2] || '').trim(),
    estado: String(row[3] || '').trim().toUpperCase(),
    tipo: String(row[4] || '').trim().toUpperCase(),
    fila: sheetRow
  };
}


/**
 * Prepara datos enviados por el navegador.
 *
 * @param {Object} data
 * @return {Object}
 */
function cpPrepararDatosEntrada_(data) {
  const source = data || {};

  return {
    nombre: cpNormalizarNombre_(
      source.nombre
    ),
    nit: cpNormalizarNit_(
      source.nit
    ),
    tipo: cpNormalizarTipo_(
      source.tipo
    )
  };
}


/**
 * Valida los campos obligatorios y valores permitidos.
 *
 * @param {Object} datos
 */
function cpValidarCamposTercero_(datos) {
  if (!datos.nombre) {
    throw new Error(
      'El nombre del tercero es obligatorio.'
    );
  }

  if (!datos.nit) {
    throw new Error(
      'El NIT es obligatorio y debe contener números.'
    );
  }

  if (!/^\d+$/.test(datos.nit)) {
    throw new Error(
      'El NIT solo puede contener números.'
    );
  }

  if (!datos.tipo) {
    throw new Error(
      'El tipo de tercero es obligatorio.'
    );
  }

  if (
    CP_CONFIG.TYPES.indexOf(datos.tipo) === -1
  ) {
    throw new Error(
      'El tipo de tercero "' +
      datos.tipo +
      '" no es válido.'
    );
  }
}


/**
 * Normaliza el nombre:
 * - elimina espacios externos;
 * - reduce espacios múltiples;
 * - convierte a mayúsculas.
 *
 * @param {*} value
 * @return {string}
 */
function cpNormalizarNombre_(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}


/**
 * Normaliza el NIT dejando exclusivamente dígitos.
 *
 * Ejemplo:
 * 900.395.756-9 -> 9003957569
 *
 * @param {*} value
 * @return {string}
 */
function cpNormalizarNit_(value) {
  return String(value || '')
    .replace(/\D/g, '');
}


/**
 * Normaliza el tipo de tercero.
 *
 * @param {*} value
 * @return {string}
 */
function cpNormalizarTipo_(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}


/**
 * Normaliza un ID TER.
 *
 * @param {*} value
 * @return {string}
 */
function cpNormalizarId_(value) {
  return String(value || '')
    .trim()
    .toUpperCase();
}


/**
 * Busca un NIT duplicado.
 *
 * Los NIT históricos también se normalizan en memoria.
 * No se modifica la hoja.
 *
 * @param {Array<Object>} registros
 * @param {string} nit
 * @param {string} excluirId
 * @return {Object|null}
 */
function cpBuscarDuplicadoNit_(
  registros,
  nit,
  excluirId
) {
  const nitNormalizado = cpNormalizarNit_(nit);
  const idExcluido = cpNormalizarId_(excluirId);

  return registros.find(function(item) {
    if (
      idExcluido &&
      item.id === idExcluido
    ) {
      return false;
    }

    return (
      cpNormalizarNit_(item.nit) ===
      nitNormalizado
    );
  }) || null;
}


/**
 * Busca un nombre duplicado.
 *
 * @param {Array<Object>} registros
 * @param {string} nombre
 * @param {string} excluirId
 * @return {Object|null}
 */
function cpBuscarDuplicadoNombre_(
  registros,
  nombre,
  excluirId
) {
  const nombreNormalizado =
    cpNormalizarNombre_(nombre);

  const idExcluido =
    cpNormalizarId_(excluirId);

  return registros.find(function(item) {
    if (
      idExcluido &&
      item.id === idExcluido
    ) {
      return false;
    }

    return (
      cpNormalizarNombre_(item.nombre) ===
      nombreNormalizado
    );
  }) || null;
}


/**
 * Calcula el siguiente TER-XXXX.
 *
 * No depende de la última fila física.
 * Busca el número mayor entre todos los IDs válidos.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @return {string}
 */
function cpObtenerSiguienteId_(sheet) {
  const lastRow = sheet.getLastRow();
  let maxNumber = 0;

  if (lastRow >= 2) {
    const ids = sheet
      .getRange(2, 1, lastRow - 1, 1)
      .getDisplayValues();

    ids.forEach(function(row) {
      const id = cpNormalizarId_(row[0]);

      const match = id.match(
        /^TER-(\d+)$/
      );

      if (!match) {
        return;
      }

      const number = Number(match[1]);

      if (
        Number.isFinite(number) &&
        number > maxNumber
      ) {
        maxNumber = number;
      }
    });
  }

  return (
    CP_CONFIG.ID_PREFIX +
    String(maxNumber + 1).padStart(
      CP_CONFIG.ID_DIGITS,
      '0'
    )
  );
}


/**
 * Ordena TER-XXXX del mayor al menor.
 *
 * @param {Object} a
 * @param {Object} b
 * @return {number}
 */
function cpOrdenarPorIdDesc_(a, b) {
  const aNumber = cpExtraerNumeroId_(a.id);
  const bNumber = cpExtraerNumeroId_(b.id);

  if (aNumber !== bNumber) {
    return bNumber - aNumber;
  }

  return String(b.id).localeCompare(
    String(a.id)
  );
}


/**
 * Extrae el componente numérico del ID.
 *
 * @param {string} id
 * @return {number}
 */
function cpExtraerNumeroId_(id) {
  const match = cpNormalizarId_(id).match(
    /^TER-(\d+)$/
  );

  return match
    ? Number(match[1])
    : -1;
}


/**
 * Cambia exclusivamente ESTADO CLIENTE.
 *
 * @param {string} id
 * @param {string} nuevoEstado
 * @return {Object}
 */
function cpCambiarEstadoTercero_(
  id,
  nuevoEstado
) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(CP_CONFIG.LOCK_TIMEOUT_MS);

    const idNormalizado =
      cpNormalizarId_(id);

    if (!idNormalizado) {
      throw new Error(
        'El ID del tercero es obligatorio.'
      );
    }

    if (
      nuevoEstado !== CP_CONFIG.STATUS.ACTIVE &&
      nuevoEstado !== CP_CONFIG.STATUS.INACTIVE
    ) {
      throw new Error(
        'El estado solicitado no es válido.'
      );
    }

    const sheet = cpObtenerHoja_();

    cpValidarEncabezados_(sheet);

    const registros =
      cpLeerRegistros_(sheet);

    const tercero = registros.find(function(item) {
      return item.id === idNormalizado;
    });

    if (!tercero) {
      throw new Error(
        'No existe el tercero ' +
        idNormalizado +
        '.'
      );
    }

    if (tercero.estado === nuevoEstado) {
      return {
        ok: true,
        sinCambios: true,
        mensaje:
          'El tercero ya se encuentra ' +
          nuevoEstado.toLowerCase() +
          '.',
        tercero: tercero
      };
    }

    sheet
      .getRange(tercero.fila, 4)
      .setValue(nuevoEstado);

    SpreadsheetApp.flush();

    tercero.estado = nuevoEstado;

    return {
      ok: true,
      sinCambios: false,
      mensaje:
        nuevoEstado === CP_CONFIG.STATUS.ACTIVE
          ? 'Tercero activado correctamente.'
          : 'Tercero inactivado correctamente.',
      tercero: tercero
    };

  } catch (error) {
    throw new Error(
      'No fue posible cambiar el estado del tercero. ' +
      cpMensajeError_(error)
    );

  } finally {
    try {
      lock.releaseLock();
    } catch (ignored) {
      // Sin acción.
    }
  }
}


/**
 * Convierte cualquier error en un mensaje legible.
 *
 * @param {*} error
 * @return {string}
 */
function cpMensajeError_(error) {
  if (!error) {
    return 'Error desconocido.';
  }

  if (error.message) {
    return String(error.message);
  }

  return String(error);
}
function rpPruebaBuscarOperacion() {
  const resultado = rpBuscarOperacion('AGM6773');
  Logger.log(JSON.stringify(resultado, null, 2));
}
