/**
 * @fileoverview INSTALACIÓN COORDINADA · AG OPERATIONS · 2026-10-06.
 * Entrega de 19 archivos completos. Instrucciones: INSTALACION.md, entregado por separado.
 * 1. Habilitar Google Sheets API en el proyecto asociado al script.
 * 2. Reemplazar RegistroOperacionesBackend.gs, ReporteProvisiones.gs y SolicitudesPago.gs.
 * 3. Instalar los HTML del mismo paquete; conservar sus nombres y el include existente.
 * 4. Guardar el conjunto, recargar /dev y comprobar los flujos antes de publicar.
 * Se reutilizan la configuración Firebase, el Login, Código.gs, Index.html y el PDF existentes.
 * La operación puede crearse/provisionarse sin D.O.; el pago exige nueve dígitos.
 * Validación local: 47 pruebas aprobadas con dobles de GAS y DOM; /dev queda pendiente.
 */
/**
 * @fileoverview Módulo 08. Repositorio maestro autenticado de operaciones.
 * Integración: Código.gs e Index existentes; no agrega doGet ni include globales.
 * Atomicidad: Sheets v4 batchUpdate, incluyendo maestro, relaciones e historial.
 */
/** @typedef {{id:string,referenciaAg:string,cliente:string,blGuia:string,do:string,tieneDo:boolean,tipoOperacion:string,version:string}} RoOperacion */
/** @typedef {{referenciaAg:string,cliente?:string,clienteId?:string,blGuia:string,do:string}} RoDatos */
/** @typedef {{id:string,version:string,datos:RoDatos,confirmacion?:string}} RoEdicion */
/** @typedef {{nombre:string,email:string,uid:string,expiresAt:number}} RoUsuario */
/** @typedef {{sheet:GoogleAppsScript.Spreadsheet.Sheet,row:number,col:number,before:string,after:string}} RoCambio */
/** @typedef {{ok:boolean,codigo?:string,mensaje?:string,operacion?:RoOperacion}} RoResultado */
const RO_CONFIG = Object.freeze({
  operaciones: 'OPERACIONES_REGISTRADAS', terceros: 'LISTADO_CLIENTES_PROVEEDORES',
  historial: 'HISTORIAL_OPERACIONES',
  encabezados: ['ID', 'REFERENCIA_AG', 'NOMBRE CLIENTE', 'BL_DE_REFERENCIA', 'D.O'],
  audit: ['FECHA_UTC','ACCION','ID_OPERACION','REFERENCIA_ANTERIOR','REFERENCIA_NUEVA','UID','USUARIO','ANTES_JSON','DESPUES_JSON','RELACIONES_JSON'],
  maxCeldas: 300000, maxRequests: 5000, maxBytes: 1800000
});
/** @extends Error */
class RoFault extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) { super(message); this.name = 'RoFault'; this.code = code; }
}
/** @param {string} idToken @returns {Object} */
function roObtenerInicio(idToken) {
  agLoginRequerirUsuario_(idToken);
  return roResultado_(function () {
    const ss = roAbrirLibro_();
    const records = roLeerOperaciones_(ss);
    return {ok:true, clientes:roClientes_(ss), listado:roPagina_(records, {})};
  });
}
/** @param {string} idToken @param {{busqueda?:string,page?:number,pageSize?:number,pendientes?:boolean}} filtros @returns {Object} */
function roListarOperaciones(idToken, filtros) {
  agLoginRequerirUsuario_(idToken);
  return roResultado_(function () { return roPagina_(roLeerOperaciones_(roAbrirLibro_()), filtros || {}); });
}
/** @param {string} idToken @returns {Object} */
function roObtenerClientesActivos(idToken) {
  agLoginRequerirUsuario_(idToken);
  return roResultado_(function () { return {ok:true,clientes:roClientes_(roAbrirLibro_())}; });
}
/** @param {string} idToken @param {string} referenciaAg @returns {Object} */
function roConsultarOperacion(idToken, referenciaAg) {
  agLoginRequerirUsuario_(idToken);
  return roResultado_(function () {
    const referencia = roReferencia_(referenciaAg);
    const operacion = roLeerOperaciones_(roAbrirLibro_()).find(function (op) { return op.referenciaAg === referencia; });
    return {ok:true,existe:!!operacion,referenciaAg:referencia,operacion:operacion || null};
  });
}
/** @param {string} idToken @param {RoDatos} datos @returns {RoResultado} */
function roCrearOperacion(idToken, datos) {
  const usuario = agLoginRequerirUsuario_(idToken);
  return roResultado_(function () {
    return roConLock_(function () {
      const ss = roAbrirLibro_();
      const records = roLeerOperaciones_(ss);
      const data = roDatos_(ss, datos, null);
      const existente = records.find(function (op) { return op.referenciaAg === data.referenciaAg; });
      if (existente) return {ok:false,codigo:'OPERACION_YA_EXISTE',mensaje:'La operación '+data.referenciaAg+' ya se encuentra registrada.',operacion:existente};
      const sheet = roHoja_(ss, RO_CONFIG.operaciones, RO_CONFIG.encabezados);
      const id = roSiguienteId_(records);
      const op = roOperacion_([id,data.referenciaAg,data.cliente,data.blGuia,data.do]);
      const row = sheet.getLastRow();
      const requests = roEspacio_(sheet, row + 1);
      requests.push(roRequest_(sheet.getSheetId(),row,0,roFila_(op)));
      roAudit_(ss, requests, usuario, 'CREAR', null, op, []);
      roVigencia_(usuario);
      roBatch_(ss, requests);
      return {ok:true,operacion:op,advertenciaDo:!op.do};
    });
  });
}
/** @param {string} idToken @param {RoEdicion} edicion @returns {Object} */
function roPrevisualizarEdicion(idToken, edicion) {
  agLoginRequerirUsuario_(idToken);
  return roResultado_(function () {
    const plan = roPlan_(roAbrirLibro_(), edicion);
    return {ok:true,operacion:plan.after,anterior:plan.before,impacto:plan.impacto,confirmacion:plan.confirmacion,sinCambios:plan.changes.length === 0};
  });
}
/** @param {string} idToken @param {RoEdicion} edicion @returns {Object} */
function roActualizarOperacion(idToken, edicion) {
  const usuario = agLoginRequerirUsuario_(idToken);
  return roResultado_(function () {
    return roConLock_(function () {
      const ss = roAbrirLibro_();
      const plan = roPlan_(ss, edicion);
      if (!edicion || edicion.confirmacion !== plan.confirmacion) throw new RoFault('CONFLICTO','Los datos relacionados cambiaron. Consulte y confirme nuevamente.');
      if (!plan.changes.length) return {ok:true,operacion:plan.after,impacto:[],sinCambios:true};
      const requests = plan.changes.map(function (c) { return roRequest_(c.sheet.getSheetId(),c.row,c.col,[c.after]); });
      roAudit_(ss, requests, usuario, 'EDITAR', plan.before, plan.after, plan.impacto);
      roVigencia_(usuario);
      roBatch_(ss, requests);
      return {ok:true,operacion:plan.after,impacto:plan.impacto,advertenciaDo:!plan.after.do};
    });
  });
}
/** @param {function():Object} work @returns {Object} */
function roResultado_(work) {
  try { return work(); } catch (error) {
    if (error instanceof AgLoginFault) throw error;
    if (error instanceof RoFault) return {ok:false,codigo:error.code,mensaje:error.message};
    console.error('RO_INTERNAL_ERROR');
    return {ok:false,codigo:'ERROR_INTERNO',mensaje:'No fue posible completar la operación. Consulte al administrador.'};
  }
}
/** @template T @param {function():T} work @returns {T} */
function roConLock_(work) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new RoFault('OCUPADO','Hay otro proceso guardando datos. Intente nuevamente.');
  try { return work(); } finally { lock.releaseLock(); }
}
/** @returns {GoogleAppsScript.Spreadsheet.Spreadsheet} */
function roAbrirLibro_() { return SpreadsheetApp.openById(agLoginConfig_().spreadsheetId); }
/** @param {RoUsuario} usuario @returns {void} */
function roVigencia_(usuario) { if (!usuario || !Number.isFinite(usuario.expiresAt) || usuario.expiresAt <= Date.now()) throw agLoginAuthFault_(); }
/** @param {*} v @returns {string} */
function roTexto_(v) { return v == null ? '' : String(v).trim().replace(/\s+/g,' '); }
/** @param {*} v @returns {string} */
function roClave_(v) { return roTexto_(v).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
/** @param {*} v @returns {string} */
function roHeader_(v) { return roClave_(v).replace(/[^A-Z0-9]/g,''); }
/** @param {*} v @returns {string} */
function roReferencia_(v) {
  if (typeof v !== 'string') throw new RoFault('VALIDACION','La referencia AG debe ser texto.');
  const ref = v.trim().toUpperCase().replace(/\s+/g,'');
  if (!/^(AGM|AGX)\d{4}$/.test(ref)) throw new RoFault('VALIDACION','Use AGM o AGX seguido de cuatro números.');
  return ref;
}
/** @param {*} v @returns {string} */
function roDo_(v) {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v !== 'string') throw new RoFault('VALIDACION','El D.O. debe enviarse como texto para conservar sus ceros iniciales.');
  const value = v.trim();
  if (!/^\d{9}$/.test(value)) throw new RoFault('VALIDACION','El D.O. debe contener exactamente nueve números.');
  return value;
}
/** @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss @param {string} name @param {string[]} headers @returns {GoogleAppsScript.Spreadsheet.Sheet} */
function roHoja_(ss, name, headers) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new RoFault('ESTRUCTURA','No existe la hoja '+name+'.');
  const actual = sheet.getRange(1,1,1,headers.length).getDisplayValues()[0];
  if (actual.some(function (v,i) { return roTexto_(v) !== headers[i]; })) throw new RoFault('ESTRUCTURA','Revise los encabezados y su orden en '+name+'.');
  return sheet;
}
/** @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss @returns {{id:string,nombre:string,nit:string}[]} */
function roClientes_(ss) {
  const sheet = roHoja_(ss,RO_CONFIG.terceros,['ID','NOMBRE CLIENTE','NIT','ESTADO CLIENTE','TIPO TERCERO']);
  if (sheet.getLastRow()<2) return [];
  const records = sheet.getRange(2,1,sheet.getLastRow()-1,5).getDisplayValues();
  const ids = new Set();
  return records.filter(function (r) { return roClave_(r[3])==='ACTIVO' && roClave_(r[4])==='CLIENTE'; }).map(function (r) {
    const id=roTexto_(r[0]),nombre=roTexto_(r[1]);
    if (!id || !nombre || ids.has(id)) throw new RoFault('ESTRUCTURA','El catálogo contiene clientes con ID vacío o duplicado.');
    ids.add(id); return {id:id,nombre:nombre,nit:roTexto_(r[2])};
  }).sort(function (a,b) { return a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base'}); });
}
/** @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss @param {RoDatos} datos @param {RoOperacion|null} original @returns {RoDatos} */
function roDatos_(ss, datos, original) {
  if (!datos || typeof datos!=='object' || Array.isArray(datos)) throw new RoFault('VALIDACION','Datos de operación inválidos.');
  const referencia = roReferencia_(datos.referenciaAg);
  if (typeof datos.blGuia !== 'string') throw new RoFault('VALIDACION','El BL o Guía debe ser texto.');
  const bl = roTexto_(datos.blGuia);
  if (!bl || bl.length>200 || /[\u0000-\u001f\u007f]/.test(datos.blGuia)) throw new RoFault('VALIDACION','El BL o Guía es obligatorio y admite hasta 200 caracteres sin controles.');
  const clientes = roClientes_(ss);
  const matches = clientes.filter(function (c) { return datos.clienteId ? c.id===datos.clienteId : roClave_(c.nombre)===roClave_(datos.cliente); });
  let nombre='';
  if (matches.length===1) nombre=matches[0].nombre;
  else if (!datos.clienteId && original && roTexto_(datos.cliente)===original.cliente && matches.length===0) nombre=original.cliente;
  else throw new RoFault('VALIDACION',matches.length>1?'Hay clientes con el mismo nombre. Seleccione por ID en el Módulo 08.':'Seleccione un cliente activo registrado como CLIENTE.');
  return {referenciaAg:referencia,cliente:nombre,blGuia:bl,do:roDo_(datos.do)};
}
/** @param {string[]} fila @returns {RoOperacion} */
function roOperacion_(fila) {
  const base = {id:roTexto_(fila[0]),referenciaAg:roTexto_(fila[1]).toUpperCase().replace(/\s+/g,''),cliente:roTexto_(fila[2]),blGuia:roTexto_(fila[3]),do:roTexto_(fila[4])};
  return Object.assign(base,{tieneDo:!!base.do,tipoOperacion:base.referenciaAg.startsWith('AGM')?'IMPORTACION':'EXPORTACION',version:roHash_(fila)});
}
/** @param {RoOperacion} op @returns {string[]} */
function roFila_(op) { return [op.id,op.referenciaAg,op.cliente,op.blGuia,op.do]; }
/** @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss @returns {RoOperacion[]} */
function roLeerOperaciones_(ss) {
  const sheet=roHoja_(ss,RO_CONFIG.operaciones,RO_CONFIG.encabezados);
  if (sheet.getLastRow()<2) return [];
  const data=sheet.getRange(2,1,sheet.getLastRow()-1,5).getDisplayValues();
  const ids=new Set(), refs=new Set();
  return data.filter(function (r) { return r.some(function (c) {return !!roTexto_(c);}); }).map(function (r) {
    const op=roOperacion_(r);
    if (!/^OP-\d+$/.test(op.id) || !/^(AGM|AGX)\d{4}$/.test(op.referenciaAg)) throw new RoFault('ESTRUCTURA','Hay una operación con ID o referencia inválidos: '+(op.id||'sin ID')+'. Corrija la fila en el origen.');
    if (ids.has(op.id)||refs.has(op.referenciaAg)) throw new RoFault('ESTRUCTURA','Existen IDs o referencias duplicadas en el maestro.');
    ids.add(op.id);refs.add(op.referenciaAg);return op;
  });
}
/** @param {RoOperacion[]} records @returns {string} */
function roSiguienteId_(records) {
  const max=records.reduce(function (n,op) { return Math.max(n,Number(op.id.slice(3))); },0);
  if (!Number.isSafeInteger(max+1)) throw new RoFault('ESTRUCTURA','Consecutivo fuera del rango permitido.');
  return 'OP-'+String(max+1).padStart(3,'0');
}
/** @param {RoOperacion[]} records @param {Object} f @returns {Object} */
function roPagina_(records,f) {
  const q=roClave_(roTexto_(f.busqueda).slice(0,200));
  const selected=records.filter(function (op) { return (!f.pendientes||!op.cliente||!op.blGuia||!/^\d{9}$/.test(op.do)) && (!q||roClave_(roFila_(op).join(' ')).includes(q)); }).sort(function (a,b) { return Number(b.id.slice(3))-Number(a.id.slice(3)); });
  const size=Math.min(100,Math.max(1,Number.isInteger(f.pageSize)?f.pageSize:25));
  const pages=Math.max(1,Math.ceil(selected.length/size));
  const page=Math.min(pages,Math.max(1,Number.isInteger(f.page)?f.page:1));
  return {ok:true,registros:selected.slice((page-1)*size,page*size),total:selected.length,page:page,pageSize:size,pages:pages,kpis:{total:records.length,pendientes:records.filter(function (op) {return !op.cliente||!op.blGuia||!/^\d{9}$/.test(op.do);}).length,importaciones:records.filter(function (op) {return op.tipoOperacion==='IMPORTACION';}).length,exportaciones:records.filter(function (op) {return op.tipoOperacion==='EXPORTACION';}).length}};
}
/** @param {*} value @returns {string} */
function roHash_(value) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(value),Utilities.Charset.UTF_8).map(function (b) {return (b&255).toString(16).padStart(2,'0');}).join(''); }
/** @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss @param {RoEdicion} e @returns {Object} */
function roPlan_(ss,e) {
  if (!e||typeof e.id!=='string'||typeof e.version!=='string') throw new RoFault('VALIDACION','Identificación de edición inválida.');
  const records=roLeerOperaciones_(ss);
  const before=records.find(function (op) {return op.id===e.id;});
  if (!before) throw new RoFault('NO_EXISTE','La operación ya no existe.');
  if (before.version!==e.version) throw new RoFault('CONFLICTO','Otro usuario modificó la operación. Consulte nuevamente.');
  const data=roDatos_(ss,e.datos,before);
  if (records.some(function (op) {return op.id!==e.id&&op.referenciaAg===data.referenciaAg;})) throw new RoFault('OPERACION_YA_EXISTE','La nueva referencia pertenece a otra operación.');
  const after=roOperacion_([before.id,data.referenciaAg,data.cliente,data.blGuia,data.do]);
  if (roHash_(roFila_(before))===roHash_(roFila_(after))) return {before:before,after:before,changes:[],impacto:[],confirmacion:roHash_([before,before,[]])};
  /** @type {RoCambio[]} */ const changes=[];
  /** @type {{hoja:string,filas:number,celdas:number}[]} */ const impacto=[];
  let totalCells=0;
  ss.getSheets().forEach(function (sheet) {
    if (sheet.getName()===RO_CONFIG.historial || sheet.getName()===RO_CONFIG.terceros || sheet.getName()==='USERS') return;
    const rows=sheet.getLastRow(),cols=sheet.getLastColumn();
    if (!rows||!cols) return;
    totalCells+=rows*cols;
    if (totalCells>RO_CONFIG.maxCeldas) throw new RoFault('LIMITE','El libro supera el límite de revisión. Ajuste RO_CONFIG.maxCeldas con base en su tamaño.');
    const values=sheet.getRange(1,1,rows,cols).getDisplayValues();
    let header=-1, mapping=null;
    for (let r=0;r<Math.min(5,rows);r++) {
      const m=roMapaHeaders_(values[r]);
      if (m.ref!==undefined) {header=r;mapping=m;break;}
    }
    if (!mapping) {
      if (values.some(function (row) {return row.some(function (v) {return roTexto_(v).toUpperCase()===before.referenciaAg;});})) throw new RoFault('RELACION_NO_MAPEADA','La hoja '+sheet.getName()+' contiene la referencia sin un encabezado reconocido. Defina su relación antes de editar.');
      return;
    }
    if (sheet.getName()==='CUADRO_CONTROL_SOLICITUDES_DE_P') {
      if (header!==0 || cols<20 || mapping.ref!==4) throw new RoFault('ESTRUCTURA','La estructura de solicitudes de pago no coincide con su contrato de 20 columnas.');
      mapping={ref:4,cliente:5,bl:15,do:18};
      if (!after.do && values.slice(1).some(function(row){return roTexto_(row[4]).toUpperCase()===before.referenciaAg;})) throw new RoFault('DO_REQUERIDO','La operación tiene solicitudes de pago. Debe conservar un D.O. asignado.');
    }
    const formulas=sheet.getRange(1,1,rows,cols).getFormulas();
    let count=0,cells=0;
    for (let r=header+1;r<rows;r++) {
      if (roTexto_(values[r][mapping.ref]).toUpperCase().replace(/\s+/g,'')!==before.referenciaAg) continue;
      const beforeCount=changes.length;
      if (sheet.getName()===RO_CONFIG.operaciones && roTexto_(values[r][0])!==before.id) throw new RoFault('ESTRUCTURA','El maestro cambió durante la revisión.');
      ['ref','cliente','bl','do','tipo'].forEach(function (key) {
        const c=mapping[key]; if (c===undefined) return;
        if (key==='tipo' && before.tipoOperacion===after.tipoOperacion) return;
        if (key==='tipo' && roClave_(values[r][c])!==before.tipoOperacion) throw new RoFault('RELACION_NO_MAPEADA','El tipo de operación en '+sheet.getName()+' utiliza un catálogo distinto. Defina su conversión antes de cambiar AGM/AGX.');
        const replacement={ref:after.referenciaAg,cliente:after.cliente,bl:after.blGuia,do:after.do,tipo:after.tipoOperacion}[key];
        if (values[r][c]===replacement) return;
        if (formulas[r][c]) throw new RoFault('RELACION_CALCULADA','La hoja '+sheet.getName()+' tiene una fórmula en una celda relacionada. Corrija la fuente de esa fórmula antes de editar.');
        changes.push({sheet:sheet,row:r,col:c,before:values[r][c],after:replacement});
      });
      if (changes.length>beforeCount) { count++;cells+=changes.length-beforeCount; }
    }
    if (count) impacto.push({hoja:sheet.getName(),filas:count,celdas:cells});
  });
  if (!changes.some(function (c) {return c.sheet.getName()===RO_CONFIG.operaciones;})) throw new RoFault('ESTRUCTURA','No se identificó la fila del maestro para actualizar.');
  const fingerprint=changes.map(function (c) {return [c.sheet.getSheetId(),c.row,c.col,c.before,c.after];});
  return {before:before,after:after,changes:changes,impacto:impacto,confirmacion:roHash_([before,after,fingerprint])};
}
/** @param {string[]} row @returns {Object<string,number>} */
function roMapaHeaders_(row) {
  const aliases={ref:['REFERENCIAAG','CONSECUTIVOAG'],cliente:['CLIENTE','NOMBRECLIENTE'],bl:['BLDEREFERENCIA','DOCUMENTOTRANSPORTE','DOCUMENTODETRANSPORTE','BLGUIA','BLGUIADEREFERENCIA'],do:['DO','DONUMBER'],tipo:['TIPOOPERACION']};
  const result={};
  if (!row.some(function(v){return ['REFERENCIAAG','CONSECUTIVOAG'].includes(roHeader_(v));})) return result;
  row.forEach(function (v,c) { Object.keys(aliases).forEach(function (key) {
    if (aliases[key].includes(roHeader_(v))) { if (result[key]!==undefined) throw new RoFault('ESTRUCTURA','Hay encabezados relacionados duplicados.');result[key]=c; }
  }); });
  return result;
}
/** @param {number} sheetId @param {number} row @param {number} col @param {string[]} values @returns {Object} */
function roRequest_(sheetId,row,col,values) { return {updateCells:{start:{sheetId:sheetId,rowIndex:row,columnIndex:col},rows:[{values:values.map(function (v) {return {userEnteredValue:{stringValue:String(v)}};})}],fields:'userEnteredValue'}}; }
/** @param {GoogleAppsScript.Spreadsheet.Sheet} sheet @param {number} required @returns {Object[]} */
function roEspacio_(sheet,required) { return required>sheet.getMaxRows()?[{appendDimension:{sheetId:sheet.getSheetId(),dimension:'ROWS',length:required-sheet.getMaxRows()}}]:[]; }
/** @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss @param {Object[]} req @param {RoUsuario} user @param {string} action @param {RoOperacion|null} before @param {RoOperacion} after @param {Object[]} impacto @returns {void} */
function roAudit_(ss,req,user,action,before,after,impacto) {
  const sheet=ss.getSheetByName(RO_CONFIG.historial);
  let id,row;
  if (sheet) { roHoja_(ss,RO_CONFIG.historial,RO_CONFIG.audit); id=sheet.getSheetId();row=sheet.getLastRow();req.push.apply(req,roEspacio_(sheet,row+1)); }
  else {
    const ids=new Set(ss.getSheets().map(function (s) {return s.getSheetId();}));id=1;while(ids.has(id)) id++;
    req.push({addSheet:{properties:{sheetId:id,title:RO_CONFIG.historial,gridProperties:{rowCount:1000,columnCount:RO_CONFIG.audit.length,frozenRowCount:1}}}});
    req.push(roRequest_(id,0,0,RO_CONFIG.audit));row=1;
  }
  req.push(roRequest_(id,row,0,[new Date().toISOString(),action,after.id,before?before.referenciaAg:'',after.referenciaAg,user.uid,user.nombre,JSON.stringify(before?roFila_(before):null),JSON.stringify(roFila_(after)),JSON.stringify(impacto)]));
}
/** @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss @param {Object[]} requests @returns {void} */
function roBatch_(ss,requests) {
  const payload=JSON.stringify({requests:requests});
  if (requests.length>RO_CONFIG.maxRequests || Utilities.newBlob(payload).getBytes().length>RO_CONFIG.maxBytes) throw new RoFault('LIMITE','La edición excede el tamaño de una transacción. No se guardaron cambios.');
  let response;
  try {
    response=UrlFetchApp.fetch('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(ss.getId())+':batchUpdate',{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},payload:payload,muteHttpExceptions:true,followRedirects:false});
  } catch (error) { throw new RoFault('RESULTADO_DESCONOCIDO','No fue posible confirmar el resultado. Consulte la operación antes de reintentar.'); }
  const code=response.getResponseCode();
  if (code!==200) throw new RoFault(code===403?'API_NO_DISPONIBLE':'ERROR_ESCRITURA',code===403?'Habilite Google Sheets API y revise los permisos de escritura del proyecto.':'La transacción no pudo completarse. Consulte la operación antes de reintentar.');
}
/**
 * Verifica el maestro antes de emitir un pago. Se llama bajo el script lock
 * que ya posee guardarSolicitudPago_SP; no adquiere un segundo bloqueo.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss @param {Object} datos @returns {RoOperacion}
 */
function roValidarPago_(ss,datos) {
  const referencia=roReferencia_(datos.referenciaAg);
  const op=roLeerOperaciones_(ss).find(function (r) {return r.referenciaAg===referencia;});
  if (!op) throw new RoFault('OPERACION_NO_EXISTE','Registre la operación '+referencia+' antes de solicitar el pago.');
  if (!op.cliente || !op.blGuia) throw new RoFault('OPERACION_INCOMPLETA','Complete cliente y BL/Guía de '+referencia+' antes de solicitar el pago.');
  if (!/^\d{9}$/.test(op.do)) throw new RoFault('DO_PENDIENTE','Asigne un D.O. de nueve números a '+referencia+' antes de solicitar el pago.');
  if (datos.operationVersion !== op.version) throw new RoFault('DATOS_DESACTUALIZADOS','La operación cambió. Consulte la referencia nuevamente antes de guardar.');
  if (roClave_(datos.cliente)!==roClave_(op.cliente) || roTexto_(datos.docTransporte)!==op.blGuia || roTexto_(datos.doNumber)!==op.do) throw new RoFault('DATOS_DESACTUALIZADOS','Cliente, BL/Guía o D.O. no coinciden con la operación. Consulte la referencia nuevamente.');
  return op;
}
/**
 * Escribe una solicitud con valores tipados; el texto nunca se interpreta como fórmula.
 * Conserva los valores Date en la zona horaria del libro y los importes numéricos.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} fila Número de fila, base 1.
 * @param {(string|number|boolean|Date)[]} values
 * @returns {void}
 */
function roEscribirSolicitud_(ss,sheet,fila,values) {
  const cells=values.map(function(value){
    let typed;
    if (value instanceof Date) {
      const local=Utilities.formatDate(value,ss.getSpreadsheetTimeZone(),"yyyy-MM-dd'T'HH:mm:ss.SSS");
      typed={numberValue:Date.parse(local+'Z')/86400000+25569};
    } else if (typeof value==='number') {
      if(!Number.isFinite(value)) throw new RoFault('VALIDACION','Un importe de la solicitud no es válido.');
      typed={numberValue:value};
    } else if (typeof value==='boolean') typed={boolValue:value};
    else typed={stringValue:value==null?'':String(value)};
    return {userEnteredValue:typed};
  });
  const requests=roEspacio_(sheet,fila);
  requests.push({updateCells:{start:{sheetId:sheet.getSheetId(),rowIndex:fila-1,columnIndex:0},rows:[{values:cells}],fields:'userEnteredValue'}});
  roBatch_(ss,requests);
}
