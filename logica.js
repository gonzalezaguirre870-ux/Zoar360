const API = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
    ? 'http://127.0.0.1:5000'
    : 'https://zoar360.onrender.com';

let rol = null;
let esModoOscuro = false;
let intervaloActual = null;
let mostrarLiderazgo = false;

const $ = id => document.getElementById(id);

function formatoNombreSinCargo(nombre) {
    if (!nombre) return '';
    return nombre.replace(/\s*\([^)]*\)\s*$/g, '').trim();
}

// ==================== NOTIFICACIONES DE FONT AWESOME EXCLUSIVAS ====================
const mostrarNotificacion = (mensaje, tipo = 'error') => {
    const iconoEl = $('iconoNotificacion');
    const textoEl = $('textoNotificacion');
    const modalNoti = $('modalNotificacion');

    if (iconoEl && textoEl && modalNoti) {
        if (tipo === 'exito') {
            iconoEl.className = 'fa-solid fa-circle-check';
            iconoEl.style.color = '#22c55e';
        } else if (tipo === 'info') {
            iconoEl.className = 'fa-solid fa-circle-info';
            iconoEl.style.color = '#3b82f6';
        } else {
            iconoEl.className = 'fa-solid fa-circle-exclamation';
            iconoEl.style.color = '#ef4444';
        }
        textoEl.innerHTML = mensaje;
        modalNoti.classList.add('activo');
        document.body.appendChild(modalNoti); // Previene ocultamiento detrás de modales
    }
};

document.addEventListener('keydown', (e) => {
    const modalNoti = $('modalNotificacion');
    if (e.key === 'Enter' && modalNoti && modalNoti.classList.contains('activo')) {
        modalNoti.classList.remove('activo');
    }
});

const MAPA_ROLES = {
    'Secretaria_Embajadores_de_Cristo': { ministerio: 'Embajadores de Cristo', rol: 'Secretaria' },
    'Secretario_Fraternidad_de_Varones': { ministerio: 'Fraternidad de Varones', rol: 'Secretario' },
    'Secretario_Exploradores_del_Rey': { ministerio: 'Exploradores del Rey', rol: 'Secretario' },
    'Secretario_Misioneritas': { ministerio: 'Misioneritas', rol: 'Secretaria' },
    'Secretaria_Concilio_Misionero_Femenil': { ministerio: 'Concilio Misionero Femenil', rol: 'Secretaria' },
    'Secretario_General': { ministerio: 'Culto General', rol: 'Secretario General' },
    'Pastor': { ministerio: 'pastor', rol: 'pastor' },
    'Administrador': { ministerio: 'Administración', rol: 'Administrador' }
};

document.addEventListener('click', function (e) {
    const sidebar = $('sidebarNav');
    const menuBtn = $('btnMenuMovil');
    if (sidebar && menuBtn && !sidebar.contains(e.target) && !menuBtn.contains(e.target) && document.body.classList.contains('sidebar-abierto')) {
        document.body.classList.remove('sidebar-abierto');
    }
});

document.querySelectorAll('#sidebarNav .tab-btn, #sidebarNav .btn-about').forEach(btn => {
    btn.addEventListener('click', () => {
        if (window.innerWidth <= 768) document.body.classList.remove('sidebar-abierto');
    });
});

document.addEventListener('DOMContentLoaded', () => {
    const sesionGuardada = sessionStorage.getItem('zoar360_user');
    if (sesionGuardada) {
        const datosUser = JSON.parse(sesionGuardada);
        rol = datosUser.rol;
        configurarInterfazPostLogin(datosUser.email);
    }
    document.querySelectorAll('.sidebar .tab-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const targetId = this.dataset.tab;
            if (targetId === 'eventos' || targetId === 'privilegios') {
                mostrarNotificacion('Módulo En Desarrollo (Próximamente Versión 2.0)', 'info');
                return;
            }
            if (targetId === 'finanzas' && rol === 'Secretario_General') {
                $('modalClaveAdmin').classList.add('activo');
                return;
            }
            cambiarPestaña(targetId);
        });
    });
});

const cambiarPestaña = id => {
    document.querySelectorAll('.tab-content, .sidebar .tab-btn').forEach(el => el.classList.remove('active'));
    if ($(id)) $(id).classList.add('active');
    const btn = document.querySelector(`.tab-btn[data-tab="${id}"]`);
    if (btn) btn.classList.add('active');

    if (id === 'membresia') cargarMiembros();
    if (id === 'asistencia') cargarAsistencia();
    if (id === 'santacena') iniciarCronometroSantaCena();
    if (id === 'solicitudes') cargarSolicitudes();
    if (id === 'auditoria') cargarAuditoria();
};

let temporizadorLogin = null;

async function iniciarSesion(e) {
    if (e) e.preventDefault();
    const emailInp = $('l_email');
    const passInp = $('l_pass');
    if (temporizadorLogin) return;

    try {
        const res = await fetch(`${API}/api/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailInp.value, password: passInp.value }), credentials: 'include'
        });
        const data = await res.json();

        if (!res.ok) {
            if (res.status === 429) {
                mostrarNotificacion(data.error, 'error');
                const segundos = parseInt(data.error.match(/\d+/));
                if (segundos) iniciarTemporizadorLogin(segundos);
                return;
            }
            mostrarNotificacion('Error: Credenciales Inválidas', 'error');
            emailInp.value = ''; passInp.value = '';
            return;
        }

        rol = data.rol;
        sessionStorage.setItem('zoar360_user', JSON.stringify({ rol: data.rol, email: data.email }));
        configurarInterfazPostLogin(data.email);
    } catch (err) {
        mostrarNotificacion('Error de red: El servidor Flask de desarrollo está apagado.', 'error');
    }
}

function configurarInterfazPostLogin(emailUsuario) {
    $('pantallaLogin').style.display = 'none';
    $('appPrincipal').style.display = 'block';

    const fecha = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    $('fechaHeader').textContent = fecha;

    const info = MAPA_ROLES[rol] || { ministerio: 'General', rol: rol };
    // Eliminación estricta de guiones bajos en nombres de roles traídos de la base de datos
    const rolFormateado = info.rol.replace(/_/g, ' ');
    const ministerioFormateado = info.ministerio.replace(/_/g, ' ');

    $('nombreUsuarioHeader').textContent = rolFormateado;
    $('rolUsuarioDropdown').textContent = rolFormateado;
    $('ministerioUsuarioDropdown').textContent = ministerioFormateado;
    $('correoUsuarioDropdown').textContent = emailUsuario;

    const esAdminPastor = (rol === 'Administrador' || rol === 'Pastor');
    const esSecretarioGeneral = (rol === 'Secretario_General');
    const esSecretarioGrupo = (rol.startsWith('Secretario_') || rol.startsWith('Secretaria_')) && rol !== 'Secretario_General';

    document.querySelectorAll('.sidebar .tab-btn').forEach(b => b.style.display = 'flex');
    $('btnSolicitudes').style.display = esAdminPastor ? 'flex' : 'none';
    $('btnFinanzas').style.display = (esAdminPastor || esSecretarioGeneral) ? 'flex' : 'none';
    $('btnAuditoria').style.display = esAdminPastor ? 'flex' : 'none';
    $('btnSantaCena').style.display = (esAdminPastor || esSecretarioGeneral) ? 'flex' : 'none';

    if (esSecretarioGrupo) {
        $('btnMembresia').style.display = 'none';
        $('btnSantaCena').style.display = 'none';
        $('btnEliminarAdmin').style.display = 'none';
        $('btnActualizarAdmin').style.display = 'none';
        $('btnAuditoria').style.display = 'none';
        $('btnSolicitudes').style.display = 'none';
        $('btnFinanzas').style.display = 'none';
        $('btnEventos').style.display = 'none';
        $('btnPrivilegios').style.display = 'none';
        cambiarPestaña('asistencia');
    } else {
        $('btnEliminarAdmin').style.display = 'inline-flex';
        $('btnActualizarAdmin').style.display = 'inline-flex';
        cambiarPestaña('membresia');
    }
    // Crear botón para mostrar/ocultar liderazgo solo para Pastor y Administrador
    const existing = $('btnToggleLiderazgo');
    if (esAdminPastor) {
        if (!existing) {
            const btn = document.createElement('button');
            btn.id = 'btnToggleLiderazgo';
            btn.className = 'tab-btn';
            btn.style.marginLeft = '8px';
            btn.textContent = 'Mostrar Liderazgo';
            btn.addEventListener('click', () => {
                mostrarLiderazgo = !mostrarLiderazgo;
                btn.textContent = mostrarLiderazgo ? 'Ocultar Liderazgo' : 'Mostrar Liderazgo';
                // Refrescar vistas donde aparece liderazgo
                if (document.querySelector('#membresia').classList.contains('active')) cargarMiembros();
                if (document.querySelector('#asistencia').classList.contains('active')) cargarAsistencia();
                if (document.querySelector('#santacena').classList.contains('active')) cargarSantaCena();
            });
            const target = $('grupoActual');
            if (target && target.parentNode) target.parentNode.insertBefore(btn, target.nextSibling);
        } else {
            existing.style.display = 'inline-flex';
        }
    } else if (existing) {
        existing.style.display = 'none';
    }
}

function iniciarTemporizadorLogin(segundos) {
    const btnLogin = document.querySelector('#formLogin .btn-submit');
    btnLogin.disabled = true;
    let tiempoRestante = segundos;
    temporizadorLogin = setInterval(() => {
        tiempoRestante--;
        btnLogin.textContent = `Espera ${tiempoRestante}s`;
        if (tiempoRestante <= 0) {
            clearInterval(temporizadorLogin);
            temporizadorLogin = null;
            btnLogin.disabled = false;
            btnLogin.textContent = 'Iniciar Sesión';
        }
    }, 1000);
}

// ==================== SEGURIDAD POR DESENFOQUE RE-ACTIVADA (EXCEPTO ADMIN) ====================
window.addEventListener('beforeunload', () => {
    if (rol && rol !== 'Administrador') sessionStorage.removeItem('zoar360_user');
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden && rol && rol !== 'Administrador') {
        sessionStorage.removeItem('zoar360_user');
        window.location.reload();
    }
});

function cerrarSesion() { sessionStorage.clear(); localStorage.clear(); window.location.reload(); }

function toggleLiderazgoPorTipo() {
    const tipo = $('m_tipo').value;
    if (tipo === 'Propiedad') {
        $('div_liderazgo_pregunta').style.display = 'block';
        $('m_liderazgo_si').value = 'No';
    } else {
        $('div_liderazgo_pregunta').style.display = 'none';
        $('div_liderazgo_texto').style.display = 'none';
    }
}

function toggleLiderazgoSiNo() {
    $('div_liderazgo_texto').style.display = $('m_liderazgo_si').value === 'Si' ? 'block' : 'none';
}

async function guardarMiembro(e) {
    if (e) e.preventDefault();
    const nombre = $('m_nombre').value.trim();
    const tipo = $('m_tipo').value;
    if (!nombre) return mostrarNotificacion('El nombre no puede ir vacío.', 'error');
    if (!tipo) return mostrarNotificacion('Debes seleccionar un tipo.', 'error');
    let liderazgoTexto = null;
    if (tipo === 'Propiedad') {
        liderazgoTexto = ($('m_liderazgo_si').value === 'Si') ? $('m_liderazgo_texto').value.trim() : null;
    }
    let grupos = [];
    if ($('g_femenil') && $('g_femenil').checked) grupos.push('Concilio Misionero Femenil');
    if ($('g_misioneritas') && $('g_misioneritas').checked) grupos.push('Misioneritas');
    if ($('g_varones') && $('g_varones').checked) grupos.push('Fraternidad de Varones');
    if ($('g_exploradores') && $('g_exploradores').checked) grupos.push('Exploradores del Rey');
    if ($('g_embajadores') && $('g_embajadores').checked) grupos.push('Embajadores de Cristo');
    const grupo = grupos.length > 0 ? grupos.join(', ') : 'Culto General';
    const datos = { nombre, telefono: $('m_telefono').value.trim() || null, tipo, grupo, liderazgo: liderazgoTexto };
    const esAdminPastor = (rol === 'Administrador' || rol === 'Pastor');
    try {
        const url = esAdminPastor ? `${API}/api/miembros` : `${API}/api/solicitudes`;
        console.log('Enviando solicitud a:', url, datos);
        const res = await fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos), credentials: 'include'
        });
        if (res.ok) {
            mostrarNotificacion(esAdminPastor ? 'Miembro registrado con éxito.' : 'Solicitud de nuevo hermano enviada al Pastor.', 'exito');
            cerrarModalYLimpiar('modalMiembro');
            if (esAdminPastor) cargarMiembros();
        } else {
            let msg = 'Error al registrar.';
            try {
                const ct = res.headers.get('content-type') || '';
                if (ct.includes('application/json')) {
                    const j = await res.json();
                    msg = j.message || j.error || JSON.stringify(j);
                } else {
                    msg = await res.text();
                }
            } catch (e) { console.error('Error leyendo respuesta del servidor', e); }
            console.error('Registrar miembro falló:', res.status, msg);
            mostrarNotificacion(msg || 'Error de servidor.', 'error');
        }
    } catch (err) { console.error('Error en guardarMiembro:', err, 'API=', API); mostrarNotificacion('Error de red local o CORS. Verifica que: 1) El servidor esté ejecutándose, 2) La URL del API sea correcta (' + API + '), 3) El servidor permita CORS.', 'error'); }
}

async function cargarMiembros() {
    const res = await fetch(`${API}/api/miembros`, { credentials: 'include' });
    const lista = await res.json();
    $('tablaMiembros').innerHTML = lista.map(m => {
        const nombreLimpio = formatoNombreSinCargo(m.nombre);
        const lider = m.liderazgo || '';
        const liderTd = mostrarLiderazgo ? `<td>${lider}</td>` : '';
        return `<tr><td><strong>${m.codigo}</strong></td><td>${nombreLimpio}</td><td>${m.telefono || '---'}</td><td><span class="badge badge-propiedad">${m.tipo}</span></td><td>${m.grupo}</td>${liderTd}</tr>`;
    }).join('');
}

async function cargarSolicitudes() {
    const res = await fetch(`${API}/api/solicitudes`, { credentials: 'include' });
    const lista = await res.json();
    $('tablaSolicitudes').innerHTML = lista.map(s => `<tr><td>${s.nombre}</td><td><span class="badge badge-pendiente" style="background:#fef3c7; color:#b45309; padding:4px 8px; border-radius:4px;">${s.estado}</span></td><td><button class="tab-btn" style="background:#22c55e; color:white; padding:4px 8px; border-radius:4px;" onclick="procesarSolicitud(${s.id}, 'Aprobada')">Aprobar</button></td></tr>`).join('');
}

async function procesarSolicitud(id, estado) {
    await fetch(`${API}/api/solicitudes/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado }), credentials: 'include' });
    mostrarNotificacion('Solicitud aprobada.', 'exito');
    cargarSolicitudes(); cargarMiembros();
}

async function cargarAsistencia() {
    const ahora = new Date();
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const dia = dias[ahora.getDay()];
    const mapa = { 'Martes': 'Concilio Misionero Femenil', 'Miércoles': 'Misioneritas', 'Jueves': 'Fraternidad de Varones', 'Viernes': 'Exploradores del Rey', 'Sábado': 'Embajadores de Cristo', 'Domingo': 'Culto General' };
    let grupo = mapa[dia] || '';
    const btnRecargar = $('btnRecargarListaAsistencia');
    if (!grupo) {
        $('diaActual').textContent = dia; $('grupoActual').textContent = 'Sin culto hoy';
        $('tablaAsistencia').innerHTML = " Hoy lunes no se encuentra programado ningún culto.";
        if (btnRecargar) btnRecargar.disabled = true;
        return;
    }
    if (btnRecargar) btnRecargar.disabled = false;
    $('diaActual').textContent = dia;
    // Si es Administrador, Pastor o Secretario General mostramos todos los miembros
    const esAdminPastor = (rol === 'Administrador' || rol === 'Pastor');
    const esSecretarioGeneral = (rol === 'Secretario_General');
    let miembros = [];
    if (esAdminPastor || esSecretarioGeneral) {
        const res = await fetch(`${API}/api/miembros`, { credentials: 'include' });
        miembros = await res.json();
        $('grupoActual').textContent = grupo;
    } else {
        // Usuarios de ministerio obtienen únicamente los miembros de su ministerio
        const res = await fetch(`${API}/api/miembros/ministerio`, { credentials: 'include' });
        const data = await res.json();
        miembros = data.miembros || [];
        $('grupoActual').textContent = data.grupo || grupo;
    }
    $('tablaAsistencia').innerHTML = miembros.map((m, i) => {
        const nombreLimpio = formatoNombreSinCargo(m.nombre);
        const lider = m.liderazgo || '';
        const liderTd = mostrarLiderazgo ? `<td>${lider}</td>` : '';
        // Mostrar sólo el correlativo en la primera columna; el código original se mantiene solo en data-codigo
        return `<tr><td>${i + 1}</td><td>${nombreLimpio}</td><td>${m.grupo}</td><td><input type="checkbox" class="asistencia-check" data-codigo="${m.codigo}" style="width:20px; height:20px;" /></td><td><strong>${m.total_asistencias || 0}</strong></td>${liderTd}</tr>`;
    }).join('');
}

async function guardarAsistencia() {
    const checks = document.querySelectorAll('.asistencia-check:checked');
    if (!checks.length) return mostrarNotificacion('Advertencia: Selecciona al menos un miembro para guardar la lista.', 'error');
    const listaCodigos = Array.from(checks).map(c => c.dataset.codigo);
    try {
        const res = await fetch(`${API}/api/marcar-asistencia`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigos: listaCodigos }), credentials: 'include' });
        const data = await res.json();
        if (!res.ok) {
            mostrarNotificacion(data.error, 'error');
            // DESSELECCIÓN AUTOMÁTICA OBLIGATORIA SI EL HORARIO/DÍA RECHAZA EL ENVÍO
            document.querySelectorAll('.asistencia-check').forEach(c => c.checked = false);
            return;
        }
        mostrarNotificacion('Asistencias guardadas exitosamente.', 'exito');
        cargarAsistencia();
    } catch (e) {
        mostrarNotificacion('Error de red local al guardar asistencia.', 'error');
        document.querySelectorAll('.asistencia-check').forEach(c => c.checked = false);
    }
}

function iniciarCronometroSantaCena() {
    if (intervaloActual) clearInterval(intervaloActual);
    cargarSantaCena();
    intervaloActual = setInterval(() => {
        const hoy = new Date();
        let año = hoy.getFullYear(), mes = hoy.getMonth();
        let primerDiaMes = new Date(año, mes, 1);
        let primerDomingo = 1 + ((7 - primerDiaMes.getDay()) % 7);
        let fechaSantaCena = new Date(año, mes, primerDomingo);
        if (hoy > fechaSantaCena.setHours(23, 59, 59, 999)) { mes++; if (mes > 11) { mes = 0; año++; } primerDiaMes = new Date(año, mes, 1); primerDomingo = 1 + ((7 - primerDiaMes.getDay()) % 7); fechaSantaCena = new Date(año, mes, primerDomingo); }
        const diferencia = fechaSantaCena - hoy;
        if (diferencia <= 0) { $('cronometroSantaCena').innerHTML = " ¡Hoy es el día de la Santa Cena!"; return; }
        const d = Math.floor(diferencia / 86400000), h = Math.floor((diferencia % 86400000) / 3600000), m = Math.floor((diferencia % 3600000) / 60000), s = Math.floor((diferencia % 60000) / 1000);
        $('cronometroSantaCena').innerHTML = `<i class="fa-solid fa-hourglass-half"></i> ${d} días, ${h} h, ${m} m, ${s} s`;
    }, 1000);
}

async function cargarSantaCena() {
    const res = await fetch(`${API}/api/miembros`, { credentials: 'include' });
    const lista = await res.json();
    $('tablaSantaCena').innerHTML = lista.filter(m => m.tipo === 'Propiedad').map(m => {
        const nombreLimpio = formatoNombreSinCargo(m.nombre);
        const liderTd = mostrarLiderazgo ? `<td>${m.liderazgo || ''}</td>` : '';
        return `<tr><td><strong>${m.codigo}</strong></td><td>${nombreLimpio}</td><td><input type="checkbox" class="sc-check" data-id="${m.id}" /></td>${liderTd}</tr>`;
    }).join('');
}

async function guardarSantaCena() {
    const ahora = new Date();
    if (ahora.getDay() !== 0) return mostrarNotificacion('La Santa Cena solo se registra los Domingos.', 'error');
    const checks = document.querySelectorAll('.sc-check:checked');
    for (const check of checks) {
        await fetch(`${API}/api/santacena`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ miembro_id: parseInt(check.dataset.id), fecha: ahora.toISOString().split('T')[0], asistio: true }), credentials: 'include' });
    }
    mostrarNotificacion('Registro de Santa Cena guardado.', 'exito');
}

async function buscarYEliminar() {
    const codigo = $('inputEliminarCodigo').value.trim();
    const res = await fetch(`${API}/api/miembros/${codigo}`, { credentials: 'include' });
    if (res.status === 404) return mostrarNotificacion('El código ingresado no pertenece a ningún miembro.', 'error');
    const data = await res.json();
    if (!confirm(`¿Eliminar al hermano ${data.nombre}?`)) return;
    const delRes = await fetch(`${API}/api/miembros/${codigo}`, { method: 'DELETE', credentials: 'include' });
    if (delRes.ok) { mostrarNotificacion('Miembro eliminado y códigos reordenados.', 'exito'); cerrarModalYLimpiar('modalEliminar'); cargarMiembros(); }
}

async function abrirModalActualizar() {
    // Reset visual y valores del modal de actualización para evitar estados residuales
    $('inputActualizarCodigo').value = '';
    $('m_actualizar_nombre').value = '';
    $('m_actualizar_telefono').value = '';
    $('m_actualizar_tipo').value = '';
    $('m_actualizar_grupo').value = '';
    if ($('m_actualizar_liderazgo_si')) $('m_actualizar_liderazgo_si').value = 'No';
    if ($('m_actualizar_liderazgo_texto')) $('m_actualizar_liderazgo_texto').value = '';
    // Ocultar form y mostrar el input de búsqueda por código
    $('formActualizarModal').style.display = 'none';
    $('inputActualizarCodigo').style.display = 'block';
    $('btnBuscarActualizar').style.display = 'inline-block';
    $('btnGuardarActualizar').style.display = 'none';
    $('div_actualizar_liderazgo_pregunta').style.display = 'none';
    $('div_actualizar_liderazgo_texto').style.display = 'none';
    $('modalActualizar').classList.add('activo');
}

async function buscarParaActualizar() {
    const codigo = $('inputActualizarCodigo').value.trim();
    const res = await fetch(`${API}/api/miembros/${codigo}`, { credentials: 'include' });
    if (res.status === 404) return mostrarNotificacion('El código ingresado no pertenece a ningún miembro.', 'error');
    const data = await res.json();
    $('inputActualizarCodigo').style.display = 'none'; $('btnBuscarActualizar').style.display = 'none'; $('btnGuardarActualizar').style.display = 'inline-block'; $('formActualizarModal').style.display = 'block';
    $('m_actualizar_nombre').value = data.nombre.replace(/ \(.*\)/, ''); $('m_actualizar_telefono').value = data.telefono || ''; $('m_actualizar_tipo').value = data.tipo; $('m_actualizar_grupo').value = data.grupo;
    if (data.tipo === 'Propiedad') {
        $('div_actualizar_liderazgo_pregunta').style.display = 'block';
        const match = data.nombre.match(/\((.*)\)/);
        if (match) { $('m_actualizar_liderazgo_si').value = 'Si'; $('m_actualizar_liderazgo_texto').value = match[1]; $('div_actualizar_liderazgo_texto').style.display = 'block'; }
    } else { $('div_actualizar_liderazgo_pregunta').style.display = 'none'; $('div_actualizar_liderazgo_texto').style.display = 'none'; }
}

function handleActualizarTipoCambio() {
    if ($('m_actualizar_tipo').value === 'Propiedad') { $('div_actualizar_liderazgo_pregunta').style.display = 'block'; }
    else { $('div_actualizar_liderazgo_pregunta').style.display = 'none'; $('div_actualizar_liderazgo_texto').style.display = 'none'; }
}

function toggleActualizarLiderazgo() { $('div_actualizar_liderazgo_texto').style.display = $('m_actualizar_liderazgo_si').value === 'Si' ? 'block' : 'none'; }

async function guardarActualizacion() {
    const codigo = $('inputActualizarCodigo').value.trim();
    const datos = { nombre: $('m_actualizar_nombre').value.trim(), telefono: $('m_actualizar_telefono').value.trim() || null, tipo: $('m_actualizar_tipo').value, grupo: $('m_actualizar_grupo').value, liderazgo: ($('m_actualizar_liderazgo_si').value === 'Si') ? $('m_actualizar_liderazgo_texto').value.trim() : null };
    await fetch(`${API}/api/miembros/${codigo}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos), credentials: 'include' });
    mostrarNotificacion('Información actualizada.', 'exito'); cerrarModalYLimpiar('modalActualizar'); cargarMiembros();
}

async function cargarAuditoria() {
    const res = await fetch(`${API}/api/auditoria`, { credentials: 'include' });
    const lista = await res.json();
    $('tablaAuditoria').innerHTML = lista.map(n => `<tr onclick="mostrarDetalleAuditoria('${n.accion}', '${n.detalles}', '${n.usuario_correo}', '${n.fecha_hora}')" style="cursor:pointer;"><td>${n.fecha_hora}</td><td>${n.usuario_correo}</td><td><span style='color:#0c4d8e;'>${n.accion}</span></td></tr>`).join('');
}

function mostrarDetalleAuditoria(accion, detalles, usuario, fecha) {
    mostrarNotificacion(`<div style='text-align:left;'><p><strong><i class="fa-solid fa-calendar"></i> Fecha:</strong> ${fecha}</p><p><strong><i class="fa-solid fa-envelope"></i> Operador:</strong> ${usuario}</p><p><strong><i class="fa-solid fa-bolt"></i> Acción:</strong> ${accion}</p><hr/><p><strong>Detalles:</strong></p><pre style='background:#f1f5f9; padding:8px; border-radius:4px;'>${detalles}</pre></div>`, 'info');
}

async function verificarClaveAdmin() {
    const res = await fetch(`${API}/api/verificar-admin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('inputContraAdmin').value }), credentials: 'include' });
    if (res.ok) { mostrarNotificacion('Acceso concedido.', 'exito'); $('inputContraAdmin').value = ''; $('modalClaveAdmin').classList.remove('activo'); cambiarPestaña('finanzas'); }
    else { mostrarNotificacion('Clave incorrecta.', 'error'); }
}

function cerrarModalYLimpiar(modalId) {
    const modal = $(modalId); if (!modal) return;
    modal.classList.remove('activo');
    modal.querySelectorAll('input, select, textarea').forEach(i => { if (i.type === 'checkbox') i.checked = false; else i.value = ''; });
    if (modalId === 'modalMiembro') { $('div_liderazgo_pregunta').style.display = 'none'; $('div_liderazgo_texto').style.display = 'none'; }
}

function abrirModal(id) { if ($(id)) $(id).classList.add('activo'); }
function cerrarModal(id) { cerrarModalYLimpiar(id); }

function toggleDropdown() { $('headerUser').classList.toggle('abierto'); }

function cambiarTema() { esModoOscuro = !esModoOscuro; document.body.classList.toggle('modo-oscuro', esModoOscuro); $('btnTema').innerHTML = esModoOscuro ? '' : ''; }