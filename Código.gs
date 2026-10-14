function doGet(e) {
  const page =
    e &&
    e.parameter &&
    e.parameter.page
      ? String(e.parameter.page).trim()
      : '';

  if (page === 'solicitudPagoPDF') {
    return HtmlService
      .createTemplateFromFile('solicitudPagoPDF')
      .evaluate()
      .setTitle('Solicitud de Pago - PDF')
      .setXFrameOptionsMode(
        HtmlService.XFrameOptionsMode.ALLOWALL
      )
      .addMetaTag(
        'viewport',
        'width=device-width, initial-scale=1'
      );
  }

  return HtmlService
    .createTemplateFromFile('Index')
    .evaluate()
    .setTitle('AG Operations - Control de Operaciones')
    .setXFrameOptionsMode(
      HtmlService.XFrameOptionsMode.ALLOWALL
    )
    .addMetaTag(
      'viewport',
      'width=device-width, initial-scale=1'
    );
}


/**
 * Valida la identidad antes de cargar un módulo HTML.
 *
 * @param {string} idToken Token de identidad de Firebase.
 * @param {string} moduleName Nombre del archivo HTML sin extensión.
 * @return {string} Contenido del módulo evaluado.
 * @throws {Error} Cuando la identidad, el nombre o la carga no son válidos.
 */
function loadModuleHTML(idToken, moduleName) {
  // Debe ejecutarse antes de evaluar cualquier módulo.
  agLoginRequerirUsuario_(idToken);

  if (
    typeof moduleName !== 'string' ||
    !/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(moduleName)
  ) {
    throw new Error('El nombre del módulo no es válido.');
  }

  try {
    return HtmlService
      .createTemplateFromFile(moduleName)
      .evaluate()
      .getContent();

  } catch (error) {
    // No devolver argumentos, tokens ni detalles internos al navegador.
    throw new Error(
      'No fue posible cargar el módulo solicitado. ' +
      'Verifica que el archivo HTML y sus parciales existan.'
    );
  }
}


/**
 * Permite incluir archivos HTML parciales
 * dentro de otros templates.
 */

function include(filename) {
  return HtmlService
    .createTemplateFromFile(filename)
    .getRawContent();
}

/**
 * Inspecciona las hojas y sus encabezados.
 * No modifica información.
 */
function diagnosticarEstructuraSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hojas = ss.getSheets();

  Logger.log(
    '=== INFORME DE HOJAS Y ENCABEZADOS ==='
  );

  hojas.forEach(function (hoja, index) {
    const nombreHoja = hoja.getName();
    const ultimaFila = hoja.getLastRow();
    const ultimaColumna = hoja.getLastColumn();

    const filaEncabezados =
      nombreHoja === 'CONTROL_REPORTE_PROVISIONES'
        ? 2
        : 1;

    Logger.log(
      '\n[Hoja ' +
      (index + 1) +
      ']: "' +
      nombreHoja +
      '"'
    );

    if (
      ultimaFila >= filaEncabezados &&
      ultimaColumna > 0
    ) {
      const encabezados = hoja
        .getRange(
          filaEncabezados,
          1,
          1,
          ultimaColumna
        )
        .getValues()[0];

      Logger.log(
        '  Fila de encabezados: ' +
        filaEncabezados
      );

      Logger.log(
        '  Encabezados (' +
        encabezados.length +
        ' columnas):'
      );

      encabezados.forEach(function (
        encabezado,
        indiceColumna
      ) {
        Logger.log(
          '    Columna ' +
          (indiceColumna + 1) +
          ' (' +
          convertirNumeroColumnaALetra_(
            indiceColumna + 1
          ) +
          '): "' +
          encabezado +
          '"'
        );
      });

    } else {
      Logger.log(
        '  [Aviso]: no existen datos suficientes.'
      );
    }
  });

  Logger.log(
    '\n=== FIN DEL INFORME ==='
  );
}


/**
 * Convierte un número de columna en letras.
 * Ejemplos: 1=A, 26=Z, 27=AA.
 */
function convertirNumeroColumnaALetra_(
  numeroColumna
) {
  let numero = numeroColumna;
  let letras = '';

  while (numero > 0) {
    const residuo = (numero - 1) % 26;

    letras =
      String.fromCharCode(65 + residuo) +
      letras;

    numero = Math.floor(
      (numero - 1) / 26
    );
  }

  return letras;
}
function diagnosticarReporteProvisionesModular() {
  const archivos = [
    'ReporteProvisionesFront',
    'RP_Estilos',
    'RP_Dashboard',
    'RP_Modales',
    'RP_Core',
    'RP_DashboardJS',
    'RP_ProvisionesJS',
    'RP_InteraccionesJS',
    'RP_UtilidadesJS'
  ];

  const resultado = {};

  archivos.forEach(function (nombre) {
    try {
      const contenido =
        HtmlService
          .createTemplateFromFile(nombre)
          .getRawContent();

      resultado[nombre] =
        'OK · ' +
        contenido.length +
        ' caracteres';

    } catch (error) {
      resultado[nombre] =
        'ERROR · ' +
        String(
          error && error.message
            ? error.message
            : error
        );
    }
  });

  try {
    const ensamblado =
      HtmlService
        .createTemplateFromFile(
          'ReporteProvisionesFront'
        )
        .evaluate()
        .getContent();

    resultado.ENSAMBLADO =
      'OK · ' +
      ensamblado.length +
      ' caracteres';

  } catch (error) {
    resultado.ENSAMBLADO =
      'ERROR · ' +
      String(
        error && error.message
          ? error.message
          : error
      );
  }

  Logger.log(
    JSON.stringify(
      resultado,
      null,
      2
    )
  );

  return resultado;
}
