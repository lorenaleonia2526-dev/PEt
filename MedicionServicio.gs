/**
 * ============================================================================
 * MedicionServicio.gs
 * MÓDULO 07 — MEDICIÓN DEL SERVICIO
 * AG LOGISTICS FREIGHT SAS
 *
 * Cliente
 *   ↓
 * Google Forms
 *   ↓
 * Trigger instalable onFormSubmit
 *   ↓
 * BD_ENCUESTAS_SATISFACCION
 *   ↓
 * Dashboard filtrable 1–6 meses
 * ============================================================================
 */

/**
 * @typedef {Object} MSFiltros
 * @property {number} meses
 * @property {string} cliente
 * @property {string} servicio
 */

const MS_CONFIG = Object.freeze({
  TIME_ZONE: 'America/Bogota',

  RESPONSE_SHEET_NAME: 'BD_ENCUESTAS_SATISFACCION',

  FORM_TITLE:
    'Encuesta de Satisfacción del Cliente – AG LOGISTICS FREIGHT SAS',

  FORM_DESCRIPTION:
    'Su opinión nos permite conocer su experiencia con nuestros servicios, ' +
    'identificar los aspectos que más valor aportan a su operación y reconocer ' +
    'oportunidades de mejora. La encuesta requiere aproximadamente 3 minutos.',

  CONFIRMATION_MESSAGE:
    'Gracias por compartir su experiencia con AG LOGISTICS FREIGHT SAS. ' +
    'Su respuesta será utilizada para fortalecer la calidad de nuestro servicio.',

  PROPERTIES: Object.freeze({
    FORM_ID: 'MS_FORM_ID',
    SPREADSHEET_ID: 'MS_SPREADSHEET_ID'
  }),

  TRIGGER_HANDLER: 'msProcesarRespuestaFormulario',

  HEADERS: Object.freeze([
    'ID_RESPUESTA',
    'FECHA_RESPUESTA',
    'EMPRESA',
    'NOMBRE',
    'CARGO',
    'TIPO_OPERACION',
    'SERVICIOS',
    'ATENCION_RECIBIDA',
    'TIEMPO_RESPUESTA',
    'COMUNICACION_SEGUIMIENTO',
    'CUMPLIMIENTO_TIEMPOS',
    'GESTION_DOCUMENTAL',
    'SOLUCION_NOVEDADES',
    'CLARIDAD_INFORMACION',
    'RELACION_CALIDAD_PRECIO',
    'SATISFACCION_GENERAL',
    'NPS',
    'OPORTUNIDAD_MEJORA',
    'ASPECTO_VALORADO',
    'FORM_RESPONSE_ID'
  ]),

  QUESTIONS: Object.freeze({
    COMPANY: 'Empresa',
    NAME: 'Nombre',
    POSITION: 'Cargo',
    OPERATION: 'Tipo de operación',
    SERVICES: 'Servicio(s) utilizado(s)',

    ATTENTION: 'Atención recibida',
    RESPONSE_TIME: 'Tiempo de respuesta',
    COMMUNICATION: 'Comunicación y seguimiento de su operación',
    COMPLIANCE: 'Cumplimiento de los tiempos acordados',
    DOCUMENTATION: 'Exactitud y oportunidad de la documentación',
    INCIDENTS: 'Manejo y solución de novedades',
    INFORMATION: 'Claridad de la información suministrada',
    VALUE: 'Relación entre el servicio recibido y el precio',
    GENERAL: 'Satisfacción general con AG Logistics',

    NPS:
      'De 0 a 10, ¿qué tan probable es que recomiende los servicios de AG Logistics a otra empresa?',

    IMPROVEMENT:
      'Pensando en su experiencia con AG Logistics, ¿qué podríamos mejorar para brindarle un mejor servicio?',

    STRENGTH:
      '¿Qué aspecto de nuestro servicio considera que deberíamos mantener porque aporta mayor valor a su operación?'
  }),

  ASPECTS: Object.freeze([
    { question: 'Atención recibida', header: 'ATENCION_RECIBIDA' },
    { question: 'Tiempo de respuesta', header: 'TIEMPO_RESPUESTA' },
    {
      question: 'Comunicación y seguimiento de su operación',
      header: 'COMUNICACION_SEGUIMIENTO'
    },
    {
      question: 'Cumplimiento de los tiempos acordados',
      header: 'CUMPLIMIENTO_TIEMPOS'
    },
    {
      question: 'Exactitud y oportunidad de la documentación',
      header: 'GESTION_DOCUMENTAL'
    },
    {
      question: 'Manejo y solución de novedades',
      header: 'SOLUCION_NOVEDADES'
    },
    {
      question: 'Claridad de la información suministrada',
      header: 'CLARIDAD_INFORMACION'
    },
    {
      question: 'Relación entre el servicio recibido y el precio',
      header: 'RELACION_CALIDAD_PRECIO'
    },
    {
      question: 'Satisfacción general con AG Logistics',
      header: 'SATISFACCION_GENERAL'
    }
  ]),

  SCALE_CHOICES: Object.freeze([
    '1 - Muy insatisfecho',
    '2 - Insatisfecho',
    '3 - Neutral',
    '4 - Satisfecho',
    '5 - Muy satisfecho',
    'No aplica'
  ])
});


/**
 * ============================================================================
 * API PÚBLICA
 * ============================================================================
 */

function msConfigurarEncuesta() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

    if (!spreadsheet) {
      throw new Error(
        'No fue posible identificar el archivo Control_Operaciones.'
      );
    }

    const sheet = msObtenerYValidarBase_(spreadsheet);
    const properties = PropertiesService.getScriptProperties();

    properties.setProperty(
      MS_CONFIG.PROPERTIES.SPREADSHEET_ID,
      spreadsheet.getId()
    );

    const existingFormId = properties.getProperty(
      MS_CONFIG.PROPERTIES.FORM_ID
    );

    if (existingFormId) {
      try {
        const existingForm = FormApp.openById(existingFormId);

        msGarantizarTrigger_(existingForm);

        return msConstruirInfoFormulario_(
          existingForm,
          sheet
        );

      } catch (error) {
        properties.deleteProperty(
          MS_CONFIG.PROPERTIES.FORM_ID
        );
      }
    }

    const form = msCrearFormulario_();

    properties.setProperty(
      MS_CONFIG.PROPERTIES.FORM_ID,
      form.getId()
    );

    msGarantizarTrigger_(form);

    return msConstruirInfoFormulario_(
      form,
      sheet
    );

  } finally {
    lock.releaseLock();
  }
}


/**
 * NO ejecutar manualmente.
 *
 * @param {GoogleAppsScript.Events.FormsOnFormSubmit} e
 */
function msProcesarRespuestaFormulario(e) {
  if (!e || !e.response) {
    throw new Error(
      'msProcesarRespuestaFormulario requiere un evento válido de Google Forms.'
    );
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const response = e.response;

    const spreadsheetId =
      PropertiesService
        .getScriptProperties()
        .getProperty(
          MS_CONFIG.PROPERTIES.SPREADSHEET_ID
        );

    if (!spreadsheetId) {
      throw new Error(
        'No existe MS_SPREADSHEET_ID. Ejecute msConfigurarEncuesta().'
      );
    }

    const spreadsheet =
      SpreadsheetApp.openById(
        spreadsheetId
      );

    const sheet =
      msObtenerYValidarBase_(
        spreadsheet
      );

    const answerMap =
      msCrearMapaRespuestas_(
        response
      );

    const timestamp =
      response.getTimestamp() ||
      new Date();

    const formResponseId =
      msObtenerIdentificadorRespuesta_(
        response
      );

    if (
      msExisteRespuesta_(
        sheet,
        formResponseId
      )
    ) {
      return;
    }

    const idRespuesta =
      msGenerarIdRespuesta_(
        timestamp,
        formResponseId
      );

    const row = [
      idRespuesta,
      timestamp,

      msTextoParaCelda_(
        msRespuestaTexto_(
          answerMap,
          MS_CONFIG.QUESTIONS.COMPANY
        )
      ),

      msTextoParaCelda_(
        msRespuestaTexto_(
          answerMap,
          MS_CONFIG.QUESTIONS.NAME
        )
      ),

      msTextoParaCelda_(
        msRespuestaTexto_(
          answerMap,
          MS_CONFIG.QUESTIONS.POSITION
        )
      ),

      msTextoParaCelda_(
        msRespuestaTexto_(
          answerMap,
          MS_CONFIG.QUESTIONS.OPERATION
        )
      ),

      msTextoParaCelda_(
        msRespuestaTexto_(
          answerMap,
          MS_CONFIG.QUESTIONS.SERVICES
        )
      ),

      msRespuestaEscala_(
        answerMap,
        MS_CONFIG.QUESTIONS.ATTENTION
      ),

      msRespuestaEscala_(
        answerMap,
        MS_CONFIG.QUESTIONS.RESPONSE_TIME
      ),

      msRespuestaEscala_(
        answerMap,
        MS_CONFIG.QUESTIONS.COMMUNICATION
      ),

      msRespuestaEscala_(
        answerMap,
        MS_CONFIG.QUESTIONS.COMPLIANCE
      ),

      msRespuestaEscala_(
        answerMap,
        MS_CONFIG.QUESTIONS.DOCUMENTATION
      ),

      msRespuestaEscala_(
        answerMap,
        MS_CONFIG.QUESTIONS.INCIDENTS
      ),

      msRespuestaEscala_(
        answerMap,
        MS_CONFIG.QUESTIONS.INFORMATION
      ),

      msRespuestaEscala_(
        answerMap,
        MS_CONFIG.QUESTIONS.VALUE
      ),

      msRespuestaEscala_(
        answerMap,
        MS_CONFIG.QUESTIONS.GENERAL
      ),

      msRespuestaNps_(
        answerMap,
        MS_CONFIG.QUESTIONS.NPS
      ),

      msTextoParaCelda_(
        msRespuestaTexto_(
          answerMap,
          MS_CONFIG.QUESTIONS.IMPROVEMENT
        )
      ),

      msTextoParaCelda_(
        msRespuestaTexto_(
          answerMap,
          MS_CONFIG.QUESTIONS.STRENGTH
        )
      ),

      formResponseId
    ];

    const targetRow =
      sheet.getLastRow() + 1;

    sheet
      .getRange(
        targetRow,
        1,
        1,
        MS_CONFIG.HEADERS.length
      )
      .setValues([row]);

    sheet
      .getRange(targetRow, 2)
      .setNumberFormat(
        'dd/MM/yyyy HH:mm:ss'
      );

    SpreadsheetApp.flush();

  } finally {
    lock.releaseLock();
  }
}


/**
 * Compatible con el frontend actual:
 * msObtenerDashboard() sigue funcionando sin parámetros.
 *
 * @param {MSFiltros=} filtros
 * @return {Object}
 */
function msObtenerDashboard(filtros) {
  try {
    const filtrosValidos =
      msNormalizarFiltros_(filtros);

    const period =
      msObtenerPeriodoAnalitico_(
        filtrosValidos.meses
      );

    const formInfo =
      msObtenerInfoFormulario_();

    const responses =
      msLeerRespuestasBD_()
        .filter(function(response) {
          return (
            response.timestamp >= period.start &&
            response.timestamp <= period.end
          );
        });

    const filtradas =
      msFiltrarRespuestas_(
        responses,
        filtrosValidos
      );

    return {
      ok: true,

      form: formInfo,

      filtros: filtrosValidos,

      filterOptions:
        msConstruirOpcionesFiltros_(
          responses
        ),

      period:
        msSerializarPeriodo_(
          period
        ),

      kpis:
        msCalcularKpis_(
          filtradas
        ),

      clients:
        msAgruparPorCliente_(
          filtradas
        ),

      aspects:
        msCalcularAspectos_(
          filtradas
        ),

      months:
        msCalcularMeses_(
          filtradas,
          period
        ),

      alerts:
        msCalcularAlertas_(
          filtradas
        ),

      comments:
        msObtenerComentarios_(
          filtradas
        ),

      generatedAt:
        msFormatearFechaHora_(
          new Date()
        )
    };

  } catch (error) {
    console.error(error);

    throw new Error(
      'No fue posible cargar Medición del servicio. ' +
      error.message
    );
  }
}


/**
 * @return {Object}
 */
function msObtenerOpcionesFiltros() {
  const period =
    msObtenerPeriodoAnalitico_(6);

  const responses =
    msLeerRespuestasBD_()
      .filter(function(response) {
        return (
          response.timestamp >= period.start &&
          response.timestamp <= period.end
        );
      });

  return msConstruirOpcionesFiltros_(
    responses
  );
}


/**
 * @return {Object}
 */
function msObtenerInfoEncuesta() {
  return msObtenerInfoFormulario_();
}


/**
 * @return {Object}
 */
function msDiagnosticarModulo() {
  const spreadsheet =
    msObtenerSpreadsheetBase_();

  const sheet =
    msObtenerYValidarBase_(
      spreadsheet
    );

  const formInfo =
    msObtenerInfoFormulario_();

  const triggerCount =
    ScriptApp
      .getProjectTriggers()
      .filter(function(trigger) {
        return (
          trigger.getHandlerFunction() ===
          MS_CONFIG.TRIGGER_HANDLER
        );
      })
      .length;

  const resultado = {
    spreadsheet:
      spreadsheet.getName(),

    databaseSheet:
      sheet.getName(),

    headersOk: true,

    formConfigured:
      formInfo.configured,

    triggerCount:
      triggerCount,

    rows:
      Math.max(
        0,
        sheet.getLastRow() - 1
      ),

    dashboardDefaultMonths: 2,

    maxFilterMonths: 6
  };

  console.log(
    JSON.stringify(
      resultado,
      null,
      2
    )
  );

  return resultado;
}


/**
 * ============================================================================
 * GOOGLE FORM
 * ============================================================================
 */

function msCrearFormulario_() {
  const form =
    FormApp.create(
      MS_CONFIG.FORM_TITLE
    );

  form
    .setDescription(
      MS_CONFIG.FORM_DESCRIPTION
    )
    .setConfirmationMessage(
      MS_CONFIG.CONFIRMATION_MESSAGE
    )
    .setCollectEmail(false)
    .setAllowResponseEdits(false)
    .setProgressBar(true)
    .setShuffleQuestions(false);

  if (
    typeof form.setPublished ===
    'function'
  ) {
    form.setPublished(true);
  }

  msAgregarSeccionInformacionGeneral_(form);
  msAgregarSeccionSatisfaccion_(form);
  msAgregarSeccionNps_(form);
  msAgregarSeccionComentarios_(form);

  return form;
}


function msAgregarSeccionInformacionGeneral_(form) {
  form
    .addSectionHeaderItem()
    .setTitle(
      '1. Información general'
    )
    .setHelpText(
      'Estos datos nos permiten analizar la experiencia de cada cliente.'
    );

  form
    .addTextItem()
    .setTitle(
      MS_CONFIG.QUESTIONS.COMPANY
    )
    .setRequired(true);

  form
    .addTextItem()
    .setTitle(
      MS_CONFIG.QUESTIONS.NAME
    )
    .setRequired(false);

  form
    .addTextItem()
    .setTitle(
      MS_CONFIG.QUESTIONS.POSITION
    )
    .setRequired(false);

  form
    .addMultipleChoiceItem()
    .setTitle(
      MS_CONFIG.QUESTIONS.OPERATION
    )
    .setChoiceValues([
      'Importación',
      'Exportación',
      'Importación y exportación'
    ])
    .setRequired(true);

  form
    .addCheckboxItem()
    .setTitle(
      MS_CONFIG.QUESTIONS.SERVICES
    )
    .setChoiceValues([
      'Transporte marítimo',
      'Transporte aéreo',
      'Transporte terrestre',
      'Agencia de aduanas',
      'Coordinación internacional'
    ])
    .showOtherOption(true)
    .setRequired(true);
}


function msAgregarSeccionSatisfaccion_(form) {
  form
    .addPageBreakItem()
    .setTitle(
      '2. Experiencia con nuestro servicio'
    )
    .setHelpText(
      'Califique cada aspecto de 1 a 5. ' +
      'Seleccione "No aplica" cuando el aspecto no corresponda a su operación.'
    );

  MS_CONFIG.ASPECTS
    .forEach(function(aspect) {
      form
        .addMultipleChoiceItem()
        .setTitle(
          aspect.question
        )
        .setChoiceValues(
          MS_CONFIG.SCALE_CHOICES.slice()
        )
        .setRequired(true);
    });
}


function msAgregarSeccionNps_(form) {
  form
    .addPageBreakItem()
    .setTitle(
      '3. Recomendación'
    )
    .setHelpText(
      '0 = Nada probable · 10 = Muy probable'
    );

  form
    .addScaleItem()
    .setTitle(
      MS_CONFIG.QUESTIONS.NPS
    )
    .setBounds(0, 10)
    .setLabels(
      'Nada probable',
      'Muy probable'
    )
    .setRequired(true);
}


function msAgregarSeccionComentarios_(form) {
  form
    .addPageBreakItem()
    .setTitle(
      '4. Su experiencia'
    )
    .setHelpText(
      'Sus comentarios nos ayudan a identificar acciones concretas de mejora.'
    );

  form
    .addParagraphTextItem()
    .setTitle(
      MS_CONFIG.QUESTIONS.IMPROVEMENT
    )
    .setRequired(false);

  form
    .addParagraphTextItem()
    .setTitle(
      MS_CONFIG.QUESTIONS.STRENGTH
    )
    .setRequired(false);
}


/**
 * ============================================================================
 * TRIGGER
 * ============================================================================
 */

function msGarantizarTrigger_(form) {
  ScriptApp
    .getProjectTriggers()
    .forEach(function(trigger) {
      if (
        trigger.getHandlerFunction() ===
        MS_CONFIG.TRIGGER_HANDLER
      ) {
        ScriptApp.deleteTrigger(
          trigger
        );
      }
    });

  ScriptApp
    .newTrigger(
      MS_CONFIG.TRIGGER_HANDLER
    )
    .forForm(form)
    .onFormSubmit()
    .create();
}


/**
 * ============================================================================
 * BASE
 * ============================================================================
 */

function msObtenerYValidarBase_(spreadsheet) {
  const sheet =
    spreadsheet.getSheetByName(
      MS_CONFIG.RESPONSE_SHEET_NAME
    );

  if (!sheet) {
    throw new Error(
      'No existe la hoja "' +
      MS_CONFIG.RESPONSE_SHEET_NAME +
      '".'
    );
  }

  const actual =
    sheet
      .getRange(
        1,
        1,
        1,
        MS_CONFIG.HEADERS.length
      )
      .getDisplayValues()[0]
      .map(function(value) {
        return String(value || '')
          .trim();
      });

  const errors = [];

  MS_CONFIG.HEADERS
    .forEach(
      function(header, index) {
        if (
          actual[index] !== header
        ) {
          errors.push(
            msColumnaA1_(index + 1) +
            '1 debe ser "' +
            header +
            '"'
          );
        }
      }
    );

  if (errors.length) {
    throw new Error(
      'La estructura de ' +
      MS_CONFIG.RESPONSE_SHEET_NAME +
      ' no coincide. ' +
      errors.join('; ')
    );
  }

  if (
    sheet.getFrozenRows() !== 1
  ) {
    sheet.setFrozenRows(1);
  }

  return sheet;
}


function msObtenerSpreadsheetBase_() {
  const properties =
    PropertiesService
      .getScriptProperties();

  const spreadsheetId =
    properties.getProperty(
      MS_CONFIG.PROPERTIES.SPREADSHEET_ID
    );

  if (spreadsheetId) {
    return SpreadsheetApp.openById(
      spreadsheetId
    );
  }

  const active =
    SpreadsheetApp
      .getActiveSpreadsheet();

  if (!active) {
    throw new Error(
      'No fue posible identificar Control_Operaciones.'
    );
  }

  return active;
}


function msExisteRespuesta_(
  sheet,
  responseId
) {
  if (
    !responseId ||
    sheet.getLastRow() < 2
  ) {
    return false;
  }

  return Boolean(
    sheet
      .getRange(
        2,
        20,
        sheet.getLastRow() - 1,
        1
      )
      .createTextFinder(
        responseId
      )
      .matchEntireCell(true)
      .findNext()
  );
}


/**
 * ============================================================================
 * RESPUESTAS GOOGLE FORM
 * ============================================================================
 */

function msCrearMapaRespuestas_(formResponse) {
  const map = new Map();

  formResponse
    .getItemResponses()
    .forEach(function(itemResponse) {
      map.set(
        String(
          itemResponse
            .getItem()
            .getTitle() || ''
        ).trim(),

        itemResponse.getResponse()
      );
    });

  return map;
}


function msRespuestaTexto_(
  answerMap,
  question
) {
  if (!answerMap.has(question)) {
    return '';
  }

  const value =
    answerMap.get(question);

  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  if (Array.isArray(value)) {
    return value
      .map(function(item) {
        return String(item || '')
          .trim();
      })
      .filter(Boolean)
      .join(', ');
  }

  return String(value).trim();
}


function msRespuestaEscala_(
  answerMap,
  question
) {
  const text =
    msRespuestaTexto_(
      answerMap,
      question
    );

  if (
    !text ||
    /^no aplica$/i.test(text)
  ) {
    return '';
  }

  const match =
    text.match(/^([1-5])/);

  return match
    ? Number(match[1])
    : '';
}


function msRespuestaNps_(
  answerMap,
  question
) {
  const value =
    answerMap.get(question);

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return '';
  }

  const number =
    Number(value);

  return (
    Number.isFinite(number) &&
    number >= 0 &&
    number <= 10
  )
    ? number
    : '';
}


function msObtenerIdentificadorRespuesta_(response) {
  try {
    const id =
      response.getId();

    if (id) {
      return String(id);
    }
  } catch (error) {
    console.warn(error);
  }

  const payload =
    response
      .getItemResponses()
      .map(function(itemResponse) {
        return [
          itemResponse
            .getItem()
            .getTitle(),

          String(
            itemResponse
              .getResponse()
          )
        ].join('=');
      })
      .join('|');

  const timestamp =
    response.getTimestamp();

  const source =
    String(
      timestamp
        ? timestamp.getTime()
        : Date.now()
    ) +
    '|' +
    payload;

  const digest =
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      source,
      Utilities.Charset.UTF_8
    );

  return digest
    .map(function(byte) {
      return (
        byte < 0
          ? byte + 256
          : byte
      )
        .toString(16)
        .padStart(2, '0');
    })
    .join('');
}


function msGenerarIdRespuesta_(
  timestamp,
  formResponseId
) {
  const datePart =
    Utilities.formatDate(
      timestamp,
      MS_CONFIG.TIME_ZONE,
      'yyyyMMdd-HHmmss'
    );

  const cleanId =
    String(
      formResponseId ||
      Utilities.getUuid()
    )
      .replace(
        /[^a-zA-Z0-9]/g,
        ''
      )
      .slice(-8)
      .toUpperCase();

  return (
    'ENC-' +
    datePart +
    '-' +
    cleanId
  );
}


function msTextoParaCelda_(value) {
  const text =
    value === null ||
    value === undefined
      ? ''
      : String(value).trim();

  if (!text) {
    return '';
  }

  if (/^[=+\-@]/.test(text)) {
    return "'" + text;
  }

  return text;
}


/**
 * ============================================================================
 * LECTURA / FILTROS
 * ============================================================================
 */

function msLeerRespuestasBD_() {
  const spreadsheet =
    msObtenerSpreadsheetBase_();

  const sheet =
    msObtenerYValidarBase_(
      spreadsheet
    );

  if (sheet.getLastRow() < 2) {
    return [];
  }

  const values =
    sheet
      .getRange(
        1,
        1,
        sheet.getLastRow(),
        MS_CONFIG.HEADERS.length
      )
      .getValues();

  const headers =
    values[0].map(
      function(value) {
        return String(
          value || ''
        ).trim();
      }
    );

  const indexes =
    msResolverColumnas_(
      headers
    );

  return values
    .slice(1)
    .map(function(row) {
      return msTransformarFilaBD_(
        row,
        indexes
      );
    })
    .filter(function(response) {
      return (
        response.timestamp instanceof Date &&
        !isNaN(
          response.timestamp.getTime()
        )
      );
    });
}


function msNormalizarFiltros_(filtros) {
  const source =
    filtros &&
    typeof filtros === 'object'
      ? filtros
      : {};

  let meses =
    Number(source.meses || 2);

  if (
    !Number.isInteger(meses) ||
    meses < 1 ||
    meses > 6
  ) {
    meses = 2;
  }

  return {
    meses: meses,

    cliente:
      msTextoSeguro_(
        source.cliente
      ),

    servicio:
      msTextoSeguro_(
        source.servicio
      )
  };
}


function msFiltrarRespuestas_(
  responses,
  filtros
) {
  const clienteKey =
    msClaveCliente_(
      filtros.cliente
    );

  const servicioKey =
    msNormalizarTexto_(
      filtros.servicio
    );

  return responses.filter(
    function(response) {
      if (
        clienteKey &&
        msClaveCliente_(
          response.company
        ) !== clienteKey
      ) {
        return false;
      }

      if (
        servicioKey &&
        !msRespuestaContieneServicio_(
          response.services,
          servicioKey
        )
      ) {
        return false;
      }

      return true;
    }
  );
}


function msRespuestaContieneServicio_(
  services,
  servicioKey
) {
  if (!servicioKey) {
    return true;
  }

  return String(services || '')
    .split(',')
    .map(function(item) {
      return msNormalizarTexto_(
        item
      );
    })
    .filter(Boolean)
    .some(function(item) {
      return item === servicioKey;
    });
}


function msConstruirOpcionesFiltros_(
  responses
) {
  const clients = new Map();
  const services = new Map();

  responses.forEach(
    function(response) {
      const clientKey =
        msClaveCliente_(
          response.company
        );

      if (
        clientKey &&
        !clients.has(clientKey)
      ) {
        clients.set(
          clientKey,
          response.company
        );
      }

      String(
        response.services || ''
      )
        .split(',')
        .map(function(item) {
          return item.trim();
        })
        .filter(Boolean)
        .forEach(function(service) {
          const key =
            msNormalizarTexto_(
              service
            );

          if (
            key &&
            !services.has(key)
          ) {
            services.set(
              key,
              service
            );
          }
        });
    }
  );

  return {
    clients:
      Array
        .from(
          clients.values()
        )
        .sort(function(a, b) {
          return a.localeCompare(
            b,
            'es',
            {
              sensitivity: 'base'
            }
          );
        }),

    services:
      Array
        .from(
          services.values()
        )
        .sort(function(a, b) {
          return a.localeCompare(
            b,
            'es',
            {
              sensitivity: 'base'
            }
          );
        })
  };
}


function msResolverColumnas_(headers) {
  const indexes = {};

  MS_CONFIG.HEADERS
    .forEach(function(header) {
      const index =
        headers.indexOf(
          header
        );

      if (index === -1) {
        throw new Error(
          'No existe la columna requerida "' +
          header +
          '".'
        );
      }

      indexes[header] =
        index;
    });

  return indexes;
}


function msTransformarFilaBD_(
  row,
  indexes
) {
  const scores = {};

  MS_CONFIG.ASPECTS
    .forEach(function(aspect) {
      scores[aspect.question] =
        msNumeroNullable_(
          row[
            indexes[
              aspect.header
            ]
          ]
        );
    });

  return {
    id:
      msTextoSeguro_(
        row[
          indexes.ID_RESPUESTA
        ]
      ),

    timestamp:
      row[
        indexes.FECHA_RESPUESTA
      ],

    company:
      msTextoSeguro_(
        row[indexes.EMPRESA]
      ) ||
      'Cliente sin identificar',

    name:
      msTextoSeguro_(
        row[indexes.NOMBRE]
      ),

    position:
      msTextoSeguro_(
        row[indexes.CARGO]
      ),

    operation:
      msTextoSeguro_(
        row[
          indexes.TIPO_OPERACION
        ]
      ),

    services:
      msTextoSeguro_(
        row[indexes.SERVICIOS]
      ),

    scores: scores,

    nps:
      msNumeroNullable_(
        row[indexes.NPS]
      ),

    improvement:
      msTextoSeguro_(
        row[
          indexes.OPORTUNIDAD_MEJORA
        ]
      ),

    strength:
      msTextoSeguro_(
        row[
          indexes.ASPECTO_VALORADO
        ]
      ),

    formResponseId:
      msTextoSeguro_(
        row[
          indexes.FORM_RESPONSE_ID
        ]
      )
  };
}


/**
 * ============================================================================
 * ANALÍTICA
 * ============================================================================
 */

function msObtenerPeriodoAnalitico_(meses) {
  const count =
    Math.max(
      1,
      Math.min(
        6,
        Number(meses) || 2
      )
    );

  const now =
    new Date();

  const currentMonth =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
      0
    );

  const start =
    new Date(
      now.getFullYear(),
      now.getMonth() -
        (count - 1),
      1,
      0,
      0,
      0,
      0
    );

  return {
    start: start,
    end: now,
    months: count,
    currentMonth:
      currentMonth
  };
}


function msCalcularKpis_(responses) {
  const allScores = [];
  const npsScores = [];

  responses.forEach(
    function(response) {
      MS_CONFIG.ASPECTS
        .forEach(function(aspect) {
          const value =
            response.scores[
              aspect.question
            ];

          if (value !== null) {
            allScores.push(value);
          }
        });

      if (
        response.nps !== null
      ) {
        npsScores.push(
          response.nps
        );
      }
    }
  );

  const satisfaction =
    msPromedio_(allScores);

  const clients =
    new Set(
      responses.map(
        function(response) {
          return msClaveCliente_(
            response.company
          );
        }
      )
    );

  const alerts =
    msCalcularAlertas_(
      responses
    );

  return {
    responses:
      responses.length,

    clients:
      clients.size,

    satisfaction:
      msRedondear_(
        satisfaction,
        2
      ),

    satisfactionLevel:
      msClasificarSatisfaccion_(
        satisfaction
      ).label,

    satisfactionStatus:
      msClasificarSatisfaccion_(
        satisfaction
      ).severity,

    nps:
      msCalcularNps_(
        npsScores
      ),

    promoters:
      npsScores.filter(
        function(value) {
          return value >= 9;
        }
      ).length,

    passives:
      npsScores.filter(
        function(value) {
          return (
            value >= 7 &&
            value <= 8
          );
        }
      ).length,

    detractors:
      npsScores.filter(
        function(value) {
          return value <= 6;
        }
      ).length,

    alerts:
      alerts.length
  };
}


function msAgruparPorCliente_(responses) {
  const groups =
    new Map();

  responses.forEach(
    function(response) {
      const key =
        msClaveCliente_(
          response.company
        );

      if (!groups.has(key)) {
        groups.set(
          key,
          {
            company:
              response.company,

            responses: [],

            scores: [],

            npsScores: []
          }
        );
      }

      const group =
        groups.get(key);

      group.responses.push(
        response
      );

      MS_CONFIG.ASPECTS
        .forEach(function(aspect) {
          const value =
            response.scores[
              aspect.question
            ];

          if (value !== null) {
            group.scores.push(
              value
            );
          }
        });

      if (
        response.nps !== null
      ) {
        group.npsScores.push(
          response.nps
        );
      }
    }
  );

  return Array
    .from(
      groups.values()
    )
    .map(function(group) {
      const ordered =
        group.responses
          .slice()
          .sort(function(a, b) {
            return (
              a.timestamp.getTime() -
              b.timestamp.getTime()
            );
          });

      const last =
        ordered[
          ordered.length - 1
        ];

      const previous =
        ordered.length >= 2
          ? ordered[
              ordered.length - 2
            ]
          : null;

      const satisfaction =
        msPromedio_(
          group.scores
        );

      const lastSatisfaction =
        msCalcularSatisfaccionRespuesta_(
          last
        );

      const previousSatisfaction =
        previous
          ? msCalcularSatisfaccionRespuesta_(
              previous
            )
          : null;

      const trend =
        lastSatisfaction !== null &&
        previousSatisfaction !== null
          ? msRedondear_(
              lastSatisfaction -
              previousSatisfaction,
              2
            )
          : null;

      const classification =
        msClasificarSatisfaccion_(
          satisfaction
        );

      return {
        company:
          group.company,

        responses:
          ordered.length,

        satisfaction:
          msRedondear_(
            satisfaction,
            2
          ),

        level:
          classification.label,

        severity:
          classification.severity,

        npsAverage:
          msRedondear_(
            msPromedio_(
              group.npsScores
            ),
            1
          ),

        lastResponse:
          msFormatearFecha_(
            last.timestamp
          ),

        lastSatisfaction:
          msRedondear_(
            lastSatisfaction,
            2
          ),

        previousSatisfaction:
          msRedondear_(
            previousSatisfaction,
            2
          ),

        trend:
          trend
      };
    })
    .sort(function(a, b) {
      return a.company.localeCompare(
        b.company,
        'es',
        {
          sensitivity: 'base'
        }
      );
    });
}


function msCalcularSatisfaccionRespuesta_(
  response
) {
  if (!response) {
    return null;
  }

  const scores =
    MS_CONFIG.ASPECTS
      .map(function(aspect) {
        return response.scores[
          aspect.question
        ];
      })
      .filter(function(value) {
        return value !== null;
      });

  return msPromedio_(
    scores
  );
}


function msCalcularAspectos_(responses) {
  return MS_CONFIG.ASPECTS
    .map(function(aspect) {
      const scores =
        responses
          .map(function(response) {
            return response.scores[
              aspect.question
            ];
          })
          .filter(function(value) {
            return value !== null;
          });

      const average =
        msPromedio_(scores);

      const classification =
        msClasificarSatisfaccion_(
          average
        );

      return {
        aspect:
          aspect.question,

        average:
          msRedondear_(
            average,
            2
          ),

        answers:
          scores.length,

        level:
          classification.label,

        severity:
          classification.severity
      };
    });
}


function msCalcularMeses_(
  responses,
  period
) {
  const months = [];

  for (
    let offset =
      period.months - 1;
    offset >= 0;
    offset--
  ) {
    const date =
      new Date(
        period.currentMonth
          .getFullYear(),
        period.currentMonth
          .getMonth() - offset,
        1
      );

    months.push({
      key:
        Utilities.formatDate(
          date,
          MS_CONFIG.TIME_ZONE,
          'yyyy-MM'
        ),

      label:
        msNombreMes_(date),

      scores: [],

      responses: 0
    });
  }

  const map =
    new Map(
      months.map(
        function(month) {
          return [
            month.key,
            month
          ];
        }
      )
    );

  responses.forEach(
    function(response) {
      const key =
        Utilities.formatDate(
          response.timestamp,
          MS_CONFIG.TIME_ZONE,
          'yyyy-MM'
        );

      const month =
        map.get(key);

      if (!month) {
        return;
      }

      month.responses++;

      MS_CONFIG.ASPECTS
        .forEach(function(aspect) {
          const value =
            response.scores[
              aspect.question
            ];

          if (value !== null) {
            month.scores.push(
              value
            );
          }
        });
    }
  );

  return months.map(
    function(month) {
      return {
        key:
          month.key,

        label:
          month.label,

        responses:
          month.responses,

        satisfaction:
          msRedondear_(
            msPromedio_(
              month.scores
            ),
            2
          )
      };
    }
  );
}


function msCalcularAlertas_(responses) {
  return responses
    .map(function(response) {
      const reasons = [];

      const general =
        response.scores[
          MS_CONFIG.QUESTIONS.GENERAL
        ];

      if (
        general !== null &&
        general <= 2
      ) {
        reasons.push(
          'Satisfacción general: ' +
          general
        );
      }

      MS_CONFIG.ASPECTS
        .filter(function(aspect) {
          return (
            aspect.question !==
            MS_CONFIG.QUESTIONS.GENERAL
          );
        })
        .forEach(function(aspect) {
          const value =
            response.scores[
              aspect.question
            ];

          if (
            value !== null &&
            value <= 2
          ) {
            reasons.push(
              aspect.question +
              ': ' +
              value
            );
          }
        });

      if (
        response.nps !== null &&
        response.nps <= 6
      ) {
        reasons.push(
          'Recomendación NPS: ' +
          response.nps
        );
      }

      if (!reasons.length) {
        return null;
      }

      return {
        company:
          response.company,

        date:
          msFormatearFecha_(
            response.timestamp
          ),

        reasons:
          reasons,

        severity:
          'risk'
      };
    })
    .filter(Boolean)
    .sort(function(a, b) {
      return a.company.localeCompare(
        b.company,
        'es',
        {
          sensitivity: 'base'
        }
      );
    });
}


function msClasificarSatisfaccion_(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return {
      label: 'Sin datos',
      severity: 'none'
    };
  }

  if (value >= 4.5) {
    return {
      label: 'Excelente',
      severity: 'excellent'
    };
  }

  if (value >= 4) {
    return {
      label: 'Satisfactorio',
      severity: 'good'
    };
  }

  if (value >= 3) {
    return {
      label: 'Atención',
      severity: 'attention'
    };
  }

  if (value >= 2) {
    return {
      label: 'Riesgo',
      severity: 'risk'
    };
  }

  return {
    label: 'Crítico',
    severity: 'critical'
  };
}


function msObtenerComentarios_(responses) {
  return responses
    .filter(function(response) {
      return (
        response.improvement ||
        response.strength
      );
    })
    .sort(function(a, b) {
      return (
        b.timestamp.getTime() -
        a.timestamp.getTime()
      );
    })
    .slice(0, 50)
    .map(function(response) {
      return {
        company:
          response.company,

        date:
          msFormatearFecha_(
            response.timestamp
          ),

        improvement:
          response.improvement,

        strength:
          response.strength
      };
    });
}


/**
 * ============================================================================
 * FORM INFO
 * ============================================================================
 */

function msObtenerInfoFormulario_() {
  const formId =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        MS_CONFIG.PROPERTIES.FORM_ID
      );

  if (!formId) {
    return msFormularioNoConfigurado_();
  }

  try {
    const form =
      FormApp.openById(
        formId
      );

    const sheet =
      msObtenerYValidarBase_(
        msObtenerSpreadsheetBase_()
      );

    return msConstruirInfoFormulario_(
      form,
      sheet
    );

  } catch (error) {
    return msFormularioNoConfigurado_();
  }
}


function msConstruirInfoFormulario_(
  form,
  sheet
) {
  return {
    configured: true,
    formId: form.getId(),
    formUrl: form.getPublishedUrl(),
    editUrl: form.getEditUrl(),
    title: form.getTitle(),
    responseSheetName:
      sheet.getName()
  };
}


function msFormularioNoConfigurado_() {
  return {
    configured: false,
    formId: '',
    formUrl: '',
    editUrl: '',
    title:
      MS_CONFIG.FORM_TITLE,
    responseSheetName:
      MS_CONFIG.RESPONSE_SHEET_NAME
  };
}


/**
 * ============================================================================
 * UTILIDADES
 * ============================================================================
 */

function msTextoSeguro_(value) {
  return (
    value === null ||
    value === undefined
  )
    ? ''
    : String(value).trim();
}


function msNumeroNullable_(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}


function msPromedio_(values) {
  if (!values.length) {
    return null;
  }

  return (
    values.reduce(
      function(sum, value) {
        return sum + value;
      },
      0
    ) /
    values.length
  );
}


function msCalcularNps_(scores) {
  if (!scores.length) {
    return null;
  }

  const promoters =
    scores.filter(
      function(score) {
        return score >= 9;
      }
    ).length;

  const detractors =
    scores.filter(
      function(score) {
        return score <= 6;
      }
    ).length;

  return Math.round(
    (
      (
        promoters -
        detractors
      ) /
      scores.length
    ) *
    100
  );
}


function msClaveCliente_(company) {
  return msNormalizarTexto_(
    company
  );
}


function msNormalizarTexto_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .trim()
    .toLowerCase();
}


function msRedondear_(
  value,
  decimals
) {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return null;
  }

  const factor =
    Math.pow(
      10,
      decimals
    );

  return (
    Math.round(
      value *
      factor
    ) /
    factor
  );
}


function msFormatearFecha_(date) {
  return Utilities.formatDate(
    date,
    MS_CONFIG.TIME_ZONE,
    'dd/MM/yyyy'
  );
}


function msFormatearFechaHora_(date) {
  return Utilities.formatDate(
    date,
    MS_CONFIG.TIME_ZONE,
    'dd/MM/yyyy HH:mm'
  );
}


function msNombreMes_(date) {
  const months = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre'
  ];

  return (
    months[
      date.getMonth()
    ] +
    ' ' +
    date.getFullYear()
  );
}


function msSerializarPeriodo_(period) {
  return {
    start:
      msFormatearFecha_(
        period.start
      ),

    end:
      msFormatearFecha_(
        period.end
      ),

    months:
      period.months,

    label:
      msNombreMes_(
        period.start
      ) +
      ' — ' +
      msNombreMes_(
        period.currentMonth
      )
  };
}


function msColumnaA1_(column) {
  let result = '';
  let value = column;

  while (value > 0) {
    const remainder =
      (value - 1) % 26;

    result =
      String.fromCharCode(
        65 + remainder
      ) +
      result;

    value =
      Math.floor(
        (value - 1) / 26
      );
  }

  return result;
}

/**
 * ============================================================================
 * EXPORTACIÓN EXCEL .XLSX
 * ============================================================================
 *
 * IMPORTANTE:
 * - NO modifica BD_ENCUESTAS_SATISFACCION.
 * - NO modifica el Google Form.
 * - NO modifica triggers.
 * - Crea un Spreadsheet temporal.
 * - Lo convierte a XLSX.
 * - Elimina el temporal enviándolo a la papelera.
 * - Respeta exactamente los filtros actuales del dashboard.
 */


/**
 * Genera un archivo XLSX con la información filtrada.
 *
 * @param {MSFiltros=} filtros
 * @return {Object}
 */
function msExportarExcel(filtros) {
  const filtrosValidos =
    msNormalizarFiltros_(filtros);

  const period =
    msObtenerPeriodoAnalitico_(
      filtrosValidos.meses
    );

  const responses =
    msLeerRespuestasBD_()
      .filter(function(response) {
        return (
          response.timestamp >= period.start &&
          response.timestamp <= period.end
        );
      });

  const filtradas =
    msFiltrarRespuestas_(
      responses,
      filtrosValidos
    );

  const kpis =
    msCalcularKpis_(
      filtradas
    );

  const clients =
    msAgruparPorCliente_(
      filtradas
    );

  const aspects =
    msCalcularAspectos_(
      filtradas
    );

  const alerts =
    msCalcularAlertas_(
      filtradas
    );

  const nombreArchivo =
    msConstruirNombreExportacion_(
      period,
      filtrosValidos
    );

  let temporal = null;

  try {
    temporal =
      SpreadsheetApp.create(
        nombreArchivo.replace(
          /\.xlsx$/i,
          ''
        )
      );

    const resumen =
      temporal.getSheets()[0];

    resumen.setName(
      'RESUMEN'
    );

    const respuestas =
      temporal.insertSheet(
        'RESPUESTAS'
      );

    const porCliente =
      temporal.insertSheet(
        'POR_CLIENTE'
      );

    const porAspecto =
      temporal.insertSheet(
        'POR_ASPECTO'
      );

    const alertasSheet =
      temporal.insertSheet(
        'ALERTAS'
      );


    msConstruirHojaResumenExportacion_(
      resumen,
      period,
      filtrosValidos,
      kpis
    );

    msConstruirHojaRespuestasExportacion_(
      respuestas,
      filtradas
    );

    msConstruirHojaClientesExportacion_(
      porCliente,
      clients
    );

    msConstruirHojaAspectosExportacion_(
      porAspecto,
      aspects
    );

    msConstruirHojaAlertasExportacion_(
      alertasSheet,
      alerts
    );


    SpreadsheetApp.flush();

    Utilities.sleep(800);


    const blob =
      msConvertirSpreadsheetAXlsx_(
        temporal.getId(),
        nombreArchivo
      );

    const bytes =
      blob.getBytes();

    return {
      ok: true,

      fileName:
        nombreArchivo,

      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

      sizeBytes:
        bytes.length,

      base64:
        Utilities.base64Encode(
          bytes
        ),

      filtros:
        filtrosValidos,

      period:
        msSerializarPeriodo_(
          period
        ),

      rows:
        filtradas.length
    };

  } finally {
    if (temporal) {
      try {
        DriveApp
          .getFileById(
            temporal.getId()
          )
          .setTrashed(true);

      } catch (error) {
        console.warn(
          'No fue posible eliminar el archivo temporal de exportación:',
          error
        );
      }
    }
  }
}


/**
 * Diagnóstico manual.
 * Ejecutar desde Apps Script.
 *
 * No conserva ningún archivo temporal.
 *
 * @return {Object}
 */
function msDiagnosticarExportacion() {
  const resultado =
    msExportarExcel({
      meses: 2,
      cliente: '',
      servicio: ''
    });

  const diagnostico = {
    ok:
      resultado.ok,

    fileName:
      resultado.fileName,

    mimeType:
      resultado.mimeType,

    sizeBytes:
      resultado.sizeBytes,

    rows:
      resultado.rows,

    period:
      resultado.period,

    filtros:
      resultado.filtros
  };

  console.log(
    JSON.stringify(
      diagnostico,
      null,
      2
    )
  );

  return diagnostico;
}


/**
 * ============================================================================
 * CONSTRUCCIÓN DEL XLSX
 * ============================================================================
 */

function msConstruirHojaResumenExportacion_(
  sheet,
  period,
  filtros,
  kpis
) {
  const rows = [
    [
      'MEDICIÓN DEL SERVICIO',
      'AG LOGISTICS FREIGHT SAS'
    ],
    [
      'Fecha de generación',
      msFormatearFechaHora_(
        new Date()
      )
    ],
    [
      'Período',
      msSerializarPeriodo_(
        period
      ).label
    ],
    [
      'Desde',
      msFormatearFecha_(
        period.start
      )
    ],
    [
      'Hasta',
      msFormatearFecha_(
        period.end
      )
    ],
    [
      'Cliente',
      filtros.cliente ||
      'Todos los clientes'
    ],
    [
      'Servicio',
      filtros.servicio ||
      'Todos los servicios'
    ],
    [
      '',
      ''
    ],
    [
      'INDICADOR',
      'RESULTADO'
    ],
    [
      'Satisfacción general',
      kpis.satisfaction === null
        ? ''
        : kpis.satisfaction
    ],
    [
      'Estado satisfacción',
      kpis.satisfactionLevel ||
      'Sin datos'
    ],
    [
      'NPS',
      kpis.nps === null
        ? ''
        : kpis.nps
    ],
    [
      'Respuestas',
      kpis.responses || 0
    ],
    [
      'Clientes evaluados',
      kpis.clients || 0
    ],
    [
      'Promotores',
      kpis.promoters || 0
    ],
    [
      'Pasivos',
      kpis.passives || 0
    ],
    [
      'Detractores',
      kpis.detractors || 0
    ],
    [
      'Alertas',
      kpis.alerts || 0
    ]
  ];

  sheet
    .getRange(
      1,
      1,
      rows.length,
      2
    )
    .setValues(rows);

  sheet
    .getRange('A1:B1')
    .merge();

  sheet
    .getRange('A1')
    .setValue(
      'MEDICIÓN DEL SERVICIO — AG LOGISTICS FREIGHT SAS'
    );

  msAplicarTituloExportacion_(
    sheet.getRange(
      'A1:B1'
    )
  );

  msAplicarEncabezadoExportacion_(
    sheet.getRange(
      'A9:B9'
    )
  );

  sheet
    .getRange('B10')
    .setNumberFormat(
      '0.00'
    );

  sheet
    .getRange(
      'A1:B18'
    )
    .setVerticalAlignment(
      'middle'
    );

  sheet.setColumnWidth(
    1,
    210
  );

  sheet.setColumnWidth(
    2,
    320
  );

  sheet.setFrozenRows(1);
}


/**
 * Hoja RESPUESTAS.
 */
function msConstruirHojaRespuestasExportacion_(
  sheet,
  responses
) {
  const headers =
    MS_CONFIG.HEADERS.slice();

  const rows =
    responses.map(
      function(response) {
        return [
          response.id,
          response.timestamp,
          response.company,
          response.name,
          response.position,
          response.operation,
          response.services,

          response.scores[
            MS_CONFIG.QUESTIONS.ATTENTION
          ],

          response.scores[
            MS_CONFIG.QUESTIONS.RESPONSE_TIME
          ],

          response.scores[
            MS_CONFIG.QUESTIONS.COMMUNICATION
          ],

          response.scores[
            MS_CONFIG.QUESTIONS.COMPLIANCE
          ],

          response.scores[
            MS_CONFIG.QUESTIONS.DOCUMENTATION
          ],

          response.scores[
            MS_CONFIG.QUESTIONS.INCIDENTS
          ],

          response.scores[
            MS_CONFIG.QUESTIONS.INFORMATION
          ],

          response.scores[
            MS_CONFIG.QUESTIONS.VALUE
          ],

          response.scores[
            MS_CONFIG.QUESTIONS.GENERAL
          ],

          response.nps,
          response.improvement,
          response.strength,
          response.formResponseId
        ].map(function(value) {
          return value === null
            ? ''
            : value;
        });
      }
    );

  msEscribirTablaExportacion_(
    sheet,
    headers,
    rows
  );

  if (rows.length) {
    sheet
      .getRange(
        2,
        2,
        rows.length,
        1
      )
      .setNumberFormat(
        'dd/MM/yyyy HH:mm:ss'
      );
  }

  sheet.setColumnWidth(
    1,
    210
  );

  sheet.setColumnWidth(
    2,
    155
  );

  sheet.setColumnWidth(
    3,
    220
  );

  sheet.setColumnWidth(
    4,
    180
  );

  sheet.setColumnWidth(
    5,
    150
  );

  sheet.setColumnWidth(
    6,
    165
  );

  sheet.setColumnWidth(
    7,
    260
  );

  for (
    let column = 8;
    column <= 17;
    column++
  ) {
    sheet.setColumnWidth(
      column,
      145
    );
  }

  sheet.setColumnWidth(
    18,
    320
  );

  sheet.setColumnWidth(
    19,
    320
  );

  sheet.setColumnWidth(
    20,
    260
  );
}


/**
 * Hoja POR_CLIENTE.
 */
function msConstruirHojaClientesExportacion_(
  sheet,
  clients
) {
  const headers = [
    'EMPRESA',
    'RESPUESTAS',
    'SATISFACCION_PROMEDIO',
    'ESTADO',
    'NPS_PROMEDIO',
    'ULTIMA_RESPUESTA',
    'SATISFACCION_ULTIMA',
    'SATISFACCION_ANTERIOR',
    'TENDENCIA'
  ];

  const rows =
    clients.map(
      function(client) {
        return [
          client.company,
          client.responses,
          client.satisfaction,
          client.level,
          client.npsAverage,
          client.lastResponse,
          client.lastSatisfaction,
          client.previousSatisfaction,
          client.trend
        ].map(function(value) {
          return (
            value === null ||
            value === undefined
          )
            ? ''
            : value;
        });
      }
    );

  msEscribirTablaExportacion_(
    sheet,
    headers,
    rows
  );

  if (rows.length) {
    sheet
      .getRange(
        2,
        3,
        rows.length,
        1
      )
      .setNumberFormat(
        '0.00'
      );

    sheet
      .getRange(
        2,
        5,
        rows.length,
        1
      )
      .setNumberFormat(
        '0.0'
      );

    sheet
      .getRange(
        2,
        7,
        rows.length,
        3
      )
      .setNumberFormat(
        '0.00'
      );
  }

  sheet.setColumnWidth(
    1,
    250
  );

  sheet.setColumnWidth(
    4,
    140
  );

  sheet.setColumnWidth(
    6,
    130
  );
}


/**
 * Hoja POR_ASPECTO.
 */
function msConstruirHojaAspectosExportacion_(
  sheet,
  aspects
) {
  const headers = [
    'ASPECTO',
    'PROMEDIO',
    'RESPUESTAS_VALIDAS',
    'ESTADO'
  ];

  const rows =
    aspects.map(
      function(aspect) {
        return [
          aspect.aspect,

          aspect.average === null
            ? ''
            : aspect.average,

          aspect.answers || 0,

          aspect.level ||
          'Sin datos'
        ];
      }
    );

  msEscribirTablaExportacion_(
    sheet,
    headers,
    rows
  );

  if (rows.length) {
    sheet
      .getRange(
        2,
        2,
        rows.length,
        1
      )
      .setNumberFormat(
        '0.00'
      );
  }

  sheet.setColumnWidth(
    1,
    360
  );

  sheet.setColumnWidth(
    4,
    140
  );
}


/**
 * Hoja ALERTAS.
 */
function msConstruirHojaAlertasExportacion_(
  sheet,
  alerts
) {
  const headers = [
    'EMPRESA',
    'FECHA',
    'MOTIVOS'
  ];

  const rows =
    alerts.map(
      function(alert) {
        return [
          alert.company,
          alert.date,
          (
            Array.isArray(
              alert.reasons
            )
              ? alert.reasons.join(
                  ' | '
                )
              : ''
          )
        ];
      }
    );

  msEscribirTablaExportacion_(
    sheet,
    headers,
    rows
  );

  sheet.setColumnWidth(
    1,
    250
  );

  sheet.setColumnWidth(
    2,
    120
  );

  sheet.setColumnWidth(
    3,
    500
  );

  if (rows.length) {
    sheet
      .getRange(
        2,
        3,
        rows.length,
        1
      )
      .setWrap(true);
  }
}


/**
 * Escribe una tabla estándar.
 */
function msEscribirTablaExportacion_(
  sheet,
  headers,
  rows
) {
  sheet
    .getRange(
      1,
      1,
      1,
      headers.length
    )
    .setValues([
      headers
    ]);

  msAplicarEncabezadoExportacion_(
    sheet.getRange(
      1,
      1,
      1,
      headers.length
    )
  );

  if (rows.length) {
    sheet
      .getRange(
        2,
        1,
        rows.length,
        headers.length
      )
      .setValues(
        rows
      );

    sheet
      .getRange(
        2,
        1,
        rows.length,
        headers.length
      )
      .setVerticalAlignment(
        'top'
      );
  }

  sheet.setFrozenRows(1);

  sheet
    .getDataRange()
    .setFontFamily(
      'Arial'
    )
    .setFontSize(
      10
    );
}


/**
 * Estilo corporativo encabezados.
 */
function msAplicarEncabezadoExportacion_(
  range
) {
  range
    .setBackground(
      '#231E54'
    )
    .setFontColor(
      '#FFFFFF'
    )
    .setFontWeight(
      'bold'
    )
    .setHorizontalAlignment(
      'center'
    )
    .setVerticalAlignment(
      'middle'
    );
}


/**
 * Estilo título.
 */
function msAplicarTituloExportacion_(
  range
) {
  range
    .setBackground(
      '#231E54'
    )
    .setFontColor(
      '#FFFFFF'
    )
    .setFontWeight(
      'bold'
    )
    .setFontSize(
      14
    )
    .setHorizontalAlignment(
      'left'
    )
    .setVerticalAlignment(
      'middle'
    );
}


/**
 * Convierte Spreadsheet temporal a XLSX.
 */
function msConvertirSpreadsheetAXlsx_(
  spreadsheetId,
  fileName
) {
  const url =
    'https://docs.google.com/spreadsheets/d/' +
    encodeURIComponent(
      spreadsheetId
    ) +
    '/export?format=xlsx';

  const response =
    UrlFetchApp.fetch(
      url,
      {
        method: 'get',

        headers: {
          Authorization:
            'Bearer ' +
            ScriptApp.getOAuthToken()
        },

        muteHttpExceptions:
          true
      }
    );

  const status =
    response.getResponseCode();

  if (status !== 200) {
    throw new Error(
      'No fue posible convertir el reporte a Excel. HTTP ' +
      status +
      '.'
    );
  }

  return response
    .getBlob()
    .setName(
      fileName
    )
    .setContentType(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
}


/**
 * Nombre final del XLSX.
 */
function msConstruirNombreExportacion_(
  period,
  filtros
) {
  const desde =
    Utilities.formatDate(
      period.start,
      MS_CONFIG.TIME_ZONE,
      'yyyy-MM'
    );

  const hasta =
    Utilities.formatDate(
      period.currentMonth,
      MS_CONFIG.TIME_ZONE,
      'yyyy-MM'
    );

  let nombre =
    'Medicion_Servicio_' +
    desde +
    '_' +
    hasta;

  if (filtros.cliente) {
    nombre +=
      '_' +
      msLimpiarNombreArchivo_(
        filtros.cliente
      );
  }

  if (filtros.servicio) {
    nombre +=
      '_' +
      msLimpiarNombreArchivo_(
        filtros.servicio
      );
  }

  return (
    nombre
      .substring(
        0,
        180
      ) +
    '.xlsx'
  );
}


/**
 * Limpia textos para nombres de archivo.
 */
function msLimpiarNombreArchivo_(
  value
) {
  return String(
    value || ''
  )
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .replace(
      /[^a-zA-Z0-9]+/g,
      '_'
    )
    .replace(
      /^_+|_+$/g,
      ''
    )
    .substring(
      0,
      45
    );
}
