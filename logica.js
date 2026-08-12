const API = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost' ? 'http://127.0.0.1:5000' : 'https://zoar360.onrender.com';
let rol = null;
let esModoOscuro = false;
let intentosFallidos = 0;

const $ = id => document.getElementById(id);

// ==================== NOTIFICACIONES PERSONALIZADAS ====================
const mostrarNotificacion = (mensaje, tipo = 'error') => {
    const icono = tipo === 'exito' ? '✅' : tipo === 'info' ? 'ℹ️' : '⚠️';
    document.getElementById('iconoNotificacion').textContent = icono;
    document.getElementById('textoNotificacion').textContent = mensaje;
    document.getElementById('modalNotificacion').classList.add('activo');
};

// Cerrar notificación con tecla Enter
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.getElementById('modalNotificacion').classList.contains('activo')) {
        document.getElementById('modalNotificacion').classList.remove('activo');
    }
});

// ==================== MAPEO DE ROLES ====================
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

// ==================== CIERRE DE MENÚ MÓVIL ====================
document.addEventListener('click', function (e) {
    const sidebar = document.getElementById('sidebarNav');
    const menuBtn = document.getElementById('btnMenuMovil');
    if (!sidebar.contains(e.target) && !menuBtn.contains(e.target) && document.body.classList.contains('sidebar-abierto')) {
        document.body.classList.remove('sidebar-abierto');
    }
});

document.querySelectorAll('#sidebarNav .tab-btn, #sidebarNav .btn-about').forEach(btn => {
    btn.addEventListener('click', () => {
        if (window.innerWidth <= 768) document.body.classList.remove('sidebar-abierto');
    });
});

// ==================== NAVEGACIÓN ====================
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.sidebar .tab-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const targetId = this.dataset.tab;
            if (targetId === 'eventos' || targetId === 'privilegios') {
                mostrarNotificacion('Módulo En Desarrollo (Versión 2.0)', 'info');
                return;
            }
            if (targetId === 'finanzas' && rol === 'Secretario_General') {
                document.getElementById('modalClaveAdmin').classList.add('activo');
                return;
            }
            cambiarPestaña(targetId);
        });
    });
});

const cambiarPestaña = id => {
    document.querySelectorAll('.tab-content, .sidebar .tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelector(`.tab-btn[data-tab="${id}"]`).classList.add('active');
    if (id === 'membresia') cargarMiembros();
    if (id === 'asistencia') cargarAsistencia();
    if (id === 'santacena') iniciarCronometroSantaCena();
    if (id === 'solicitudes') cargarSolicitudes();
    if (id === 'auditoria') cargarAuditoria();
};

// ==================== LOGIN CON BLOQUEO ====================
let temporizadorLogin = null;

async function iniciarSesion(e) {
    e.preventDefault();
    const emailInp = document.getElementById('l_email');
    const passInp = document.getElementById('l_pass');

    if (temporizadorLogin) {
        mostrarNotificacion('Espera a que termine el bloqueo.', 'error');
        return;
    }

    try {
        const res = await fetch(`${API}/api/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailInp.value, password: passInp.value }),
            credentials: 'include'
        });
        const data = await res.json();

        if (!res.ok) {
            if (res.status === 429) {
                // Bloqueo activo
                mostrarNotificacion(data.error, 'error');
                const segundos = parseInt(data.error.match(/\d+/));
                if (segundos) iniciarTemporizadorLogin(segundos);
                return;
            }
            // Fallo normal
            mostrarNotificacion('Error: Credenciales Inválidas', 'error');
            emailInp.value = '';
            passInp.value = '';
            return;
        }

        // Éxito
        rol = data.rol;
        sessionStorage.setItem('zoar360_user', JSON.stringify({ rol: data.rol, email: data.email }));
        if (rol === 'Administrador') localStorage.setItem('zoar360_admin', 'true');

        document.getElementById('pantallaLogin').style.display = 'none';
        document.getElementById('appPrincipal').style.display = 'block';

        const fecha = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        document.getElementById('fechaHeader').textContent = fecha;

        const info = MAPA_ROLES[rol] || { ministerio: 'General', rol: rol };
        document.getElementById('nombreUsuarioHeader').textContent = info.rol;
        document.getElementById('rolUsuarioDropdown').textContent = info.rol;
        document.getElementById('ministerioUsuarioDropdown').textContent = info.ministerio;
        document.getElementById('correoUsuarioDropdown').textContent = data.email;

        const esAdminPastor = (rol === 'Administrador' || rol === 'Pastor');
        const esSecretarioGeneral = (rol === 'Secretario_General');
        const esSecretarioGrupo = rol.startsWith('Secretario_') && rol !== 'Secretario_General';

        document.querySelectorAll('.sidebar .tab-btn').forEach(b => b.style.display = 'flex');
        document.getElementById('btnSolicitudes').style.display = esAdminPastor ? 'flex' : 'none';
        document.getElementById('btnFinanzas').style.display = (esAdminPastor || esSecretarioGeneral) ? 'flex' : 'none';
        document.getElementById('btnEventos').style.display = esAdminPastor ? 'flex' : 'none';
        document.getElementById('btnPrivilegios').style.display = esAdminPastor ? 'flex' : 'none';
        document.getElementById('btnAuditoria').style.display = esAdminPastor ? 'flex' : 'none';
        document.getElementById('btnSantaCena').style.display = (esAdminPastor || esSecretarioGeneral) ? 'flex' : 'none';

        if (esSecretarioGrupo) {
            document.getElementById('btnMembresia').style.display = 'none';
            document.getElementById('btnSantaCena').style.display = 'none';
            document.getElementById('btnEliminarAdmin').style.display = 'none';
            document.getElementById('btnActualizarAdmin').style.display = 'none';
            document.getElementById('btnAuditoria').style.display = 'none';
            document.getElementById('btnSolicitudes').style.display = 'none';
            document.getElementById('btnFinanzas').style.display = 'none';
            document.getElementById('btnEventos').style.display = 'none';
            document.getElementById('btnPrivilegios').style.display = 'none';
            cambiarPestaña('asistencia');
        } else {
            document.getElementById('btnEliminarAdmin').style.display = 'inline-flex';
            document.getElementById('btnActualizarAdmin').style.display = 'inline-flex';
            cambiarPestaña('membresia');
        }
        document.body.classList.remove('sidebar-abierto');
    } catch (e) {
        mostrarNotificacion('Error de conexión con el servidor.', 'error');
    }
}

function iniciarTemporizadorLogin(segundos) {
    const btnLogin = document.querySelector('#formLogin .btn-submit');
    btnLogin.disabled = true;
    btnLogin.textContent = `Espera ${segundos}s`;

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

// ==================== SEGURIDAD Y CIERRE DE SESIÓN ====================
window.addEventListener('beforeunload', () => {
    if (rol !== 'Administrador') sessionStorage.removeItem('zoar360_user');
});
document.addEventListener('visibilitychange', () => {
    if (document.hidden && rol !== 'Administrador') {
        sessionStorage.removeItem('zoar360_user');
        window.location.href = window.location.href;
    }
});
function cerrarSesion() { sessionStorage.clear(); if (rol !== 'Administrador') localStorage.clear(); window.location.href = window.location.href; }

// ==================== FORMULARIO DINÁMICO (Liderazgo) ====================
function toggleLiderazgoPorTipo() {
    const tipo = document.getElementById('m_tipo').value;
    const divLiderazgoPregunta = document.getElementById('div_liderazgo_pregunta');
    const divLiderazgoTexto = document.getElementById('div_liderazgo_texto');

    if (tipo === 'Propiedad') {
        divLiderazgoPregunta.style.display = 'block';
        document.getElementById('m_liderazgo_si').value = 'No';
        divLiderazgoTexto.style.display = 'none';
    } else {
        divLiderazgoPregunta.style.display = 'none';
        divLiderazgoTexto.style.display = 'none';
    }
}

function toggleLiderazgoSiNo() {
    const val = document.getElementById('m_liderazgo_si').value;
    document.getElementById('div_liderazgo_texto').style.display = val === 'Si' ? 'block' : 'none';
}

// ==================== GUARDAR MIEMBRO / SOLICITUD (BOTONES REALES) ====================
async function guardarMiembro(e) {
    e.preventDefault();
    const nombre = document.getElementById('m_nombre').value.trim();
    const tipo = document.getElementById('m_tipo').value;
    if (!nombre) return mostrarNotificacion('El nombre no puede estar vacío.', 'error');

    let liderazgoTexto = null;
    if (tipo === 'Propiedad') {
        const esLiderazgo = document.getElementById('m_liderazgo_si').value === 'Si';
        liderazgoTexto = esLiderazgo ? document.getElementById('m_liderazgo_texto').value.trim() : null;
        if (esLiderazgo && !liderazgoTexto) return mostrarNotificacion('Si marca Sí, debe especificar el liderazgo.', 'error');
    }

    let grupos = [];
    if (document.getElementById('g_femenil').checked) grupos.push('Concilio Misionero Femenil');
    if (document.getElementById('g_misioneritas').checked) grupos.push('Misioneritas');
    if (document.getElementById('g_varones').checked) grupos.push('Fraternidad de Varones');
    if (document.getElementById('g_exploradores').checked) grupos.push('Exploradores del Rey');
    if (document.getElementById('g_embajadores').checked) grupos.push('Embajadores de Cristo');

    const datos = {
        nombre: nombre,
        telefono: document.getElementById('m_telefono').value.trim() || null,
        tipo: tipo,
        grupo: grupos.join(', ') || 'General',
        liderazgo: liderazgoTexto
    };

    const esAdminPastor = (rol === 'Administrador' || rol === 'Pastor');
    const url = esAdminPastor ? `${API}/api/miembros` : `${API}/api/solicitudes`;

    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos), credentials: 'include' });
    if (res.ok) {
        mostrarNotificacion(esAdminPastor ? 'Miembro registrado con éxito.' : 'Solicitud enviada.', 'exito');
        cerrarModalYLimpiar('modalMiembro');
        cargarMiembros();
    } else {
        const err = await res.json();
        mostrarNotificacion(err.error || 'Error al guardar.', 'error');
    }
}

// ==================== CARGAR MIEMBROS (LISTA) ====================
async function cargarMiembros() {
    const res = await fetch(`${API}/api/miembros`, { credentials: 'include' });
    const lista = await res.json();
    document.getElementById('tablaMiembros').innerHTML = lista.map(m =>
        `<tr>
            <td><strong>${m.codigo}</strong></td>
            <td>${m.nombre}</td>
            <td>${m.telefono || '---'}</td>
            <td><span class="badge badge-propiedad">${m.tipo}</span></td>
            <td>${m.grupo}</td>
        </tr>`
    ).join('');
}

// ==================== CARGAR SOLICITUDES (PASTOR/ADMIN) ====================
async function cargarSolicitudes() {
    const res = await fetch(`${API}/api/solicitudes`, { credentials: 'include' });
    const lista = await res.json();
    document.getElementById('tablaSolicitudes').innerHTML = lista.map(s => `<tr><td>${s.nombre}</td><td><span class="badge badge-pendiente" style="background:#fef3c7;">${s.estado}</span></td><td><button class="btn-submit" style="width:auto; padding:5px 10px; font-size:0.8rem;" onclick="procesarSolicitud(${s.id}, 'Aprobada')">Aprobar</button></td></tr>`).join('');
}

async function procesarSolicitud(id, estado) {
    await fetch(`${API}/api/solicitudes/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado: estado }), credentials: 'include' });
    mostrarNotificacion('Solicitud procesada.', 'exito');
    cargarSolicitudes();
    cargarMiembros();
}

// ==================== ASISTENCIA (CON FILTRO) ====================
async function cargarAsistencia() {
    const ahora = new Date();
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const dia = dias[ahora.getDay()];
    const mapa = { 'Martes': 'Concilio Misionero Femenil', 'Miércoles': 'Misioneritas', 'Jueves': 'Fraternidad de Varones', 'Viernes': 'Exploradores del Rey', 'Sábado': 'Embajadores de Cristo', 'Domingo': 'Culto General' };
    let grupo = mapa[dia] || '';

    const btnRecargar = document.querySelector('.btn-submit[onclick="cargarAsistencia()"]');
    if (!grupo) {
        document.getElementById('diaActual').textContent = dia;
        document.getElementById('grupoActual').textContent = 'Sin culto hoy';
        document.getElementById('tablaAsistencia').innerHTML = "<tr><td colspan='5'>Hoy no hay culto.</td></tr>";
        if (btnRecargar) { btnRecargar.disabled = true; btnRecargar.style.opacity = '0.5'; }
        return;
    } else {
        if (btnRecargar) { btnRecargar.disabled = false; btnRecargar.style.opacity = '1'; }
    }

    document.getElementById('diaActual').textContent = dia;
    document.getElementById('grupoActual').textContent = grupo;

    let endpoint = (rol.startsWith('Secretario_') && rol !== 'Secretario_General') ? `${API}/api/asistencia/grupo/${grupo}` : `${API}/api/miembros`;
    const res = await fetch(endpoint, { credentials: 'include' });
    const lista = await res.json();
    document.getElementById('tablaAsistencia').innerHTML = lista.map(m =>
        `<tr><td>${m.codigo}</td><td>${m.nombre}</td><td>${m.grupo}</td><td><input type="checkbox" class="asistencia-check" data-id="${m.id}" /></td><td><strong>${m.total_asistencias || 0}</strong></td></tr>`
    ).join('');
}

async function guardarAsistencia() {
    const checks = document.querySelectorAll('.asistencia-check:checked');
    if (!checks.length) return mostrarNotificacion('Selecciona al menos un miembro.', 'error');
    for (const check of checks) {
        const codigo = check.closest('tr').querySelector('td:first-child').innerText.trim();
        const res = await fetch(`${API}/api/marcar-asistencia`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo }), credentials: 'include' });
        if (!res.ok) {
            const data = await res.json();
            return mostrarNotificacion(data.error || 'Error al guardar.', 'error');
        }
    }
    mostrarNotificacion('✅ Asistencias guardadas.', 'exito');
    cargarAsistencia();
}

// ==================== SANTA CENA (CRONÓMETRO) ====================
let intervaloActual = null;

function iniciarCronometroSantaCena() {
    if (intervaloActual) clearInterval(intervaloActual);
    cargarSantaCena();
    intervaloActual = setInterval(() => {
        const hoy = new Date();
        let año = hoy.getFullYear(); let mes = hoy.getMonth();
        let primerDiaMes = new Date(año, mes, 1);
        let primerDomingo = 1 + ((7 - primerDiaMes.getDay()) % 7);
        let fechaSantaCena = new Date(año, mes, primerDomingo);
        if (hoy > fechaSantaCena) { mes++; if (mes > 11) { mes = 0; año++; } primerDiaMes = new Date(año, mes, 1); primerDomingo = 1 + ((7 - primerDiaMes.getDay()) % 7); fechaSantaCena = new Date(año, mes, primerDomingo); }
        const diferencia = fechaSantaCena - hoy;
        if (diferencia <= 0) { document.getElementById('cronometroSantaCena').innerHTML = `<span style="color:#22c55e;">¡Hoy es el día!</span>`; return; }
        const dias = Math.floor(diferencia / (1000 * 60 * 60 * 24));
        const horas = Math.floor((diferencia % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutos = Math.floor((diferencia % (1000 * 60 * 60)) / (1000 * 60));
        const segundos = Math.floor((diferencia % (1000 * 60)) / 1000);
        document.getElementById('cronometroSantaCena').textContent = `${dias} días, ${horas} h, ${minutos} m, ${segundos} s`;
    }, 1000);
}

async function cargarSantaCena() {
    const res = await fetch(`${API}/api/miembros`, { credentials: 'include' });
    const lista = await res.json();
    const filtrados = lista.filter(m => m.tipo === 'Propiedad');
    document.getElementById('tablaSantaCena').innerHTML = filtrados.map(m =>
        `<tr><td><strong>${m.codigo}</strong></td><td>${m.nombre}</td><td><input type="checkbox" class="sc-check" data-id="${m.id}" /></td></tr>`
    ).join('');
}

async function guardarSantaCena() {
    const ahora = new Date();
    if (ahora.getDay() !== 0) return mostrarNotificacion('La Santa Cena solo se registra los Domingos.', 'error');
    const fecha = ahora.toISOString().split('T')[0];
    const checks = document.querySelectorAll('.sc-check:checked');
    if (!checks.length) return mostrarNotificacion('No hay asistentes seleccionados.', 'error');
    for (const check of checks) {
        await fetch(`${API}/api/santacena`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ miembro_id: parseInt(check.dataset.id), fecha: fecha, asistio: true }), credentials: 'include' });
    }
    mostrarNotificacion('✅ Registro de Santa Cena guardado.', 'exito');
}

// ==================== ELIMINAR MIEMBRO (MODAL CON VALIDACIÓN) ====================
async function abrirModalEliminar() {
    document.getElementById('inputEliminarCodigo').value = '';
    document.getElementById('textoConfirmacionEliminar').innerHTML = '';
    document.getElementById('modalEliminar').classList.add('activo');
}

async function buscarYEliminar() {
    const codigo = document.getElementById('inputEliminarCodigo').value.trim();
    if (!codigo) return mostrarNotificacion('Ingresa un código.', 'error');
    const res = await fetch(`${API}/api/miembros/${codigo}`, { credentials: 'include' });
    if (res.status === 404) return mostrarNotificacion('El código ingresado no pertenece a ningún miembro.', 'error');
    const data = await res.json();
    if (!confirm(`¿Estás seguro que quieres eliminar al hermano ${data.nombre} (Código ${codigo})?`)) return;
    const delRes = await fetch(`${API}/api/miembros/${codigo}`, { method: 'DELETE', credentials: 'include' });
    if (delRes.ok) {
        mostrarNotificacion('Miembro eliminado y códigos reordenados.', 'exito');
        cerrarModalYLimpiar('modalEliminar');
        cargarMiembros();
    } else { const err = await delRes.json(); mostrarNotificacion(err.error, 'error'); }
}

// ==================== ACTUALIZAR MIEMBRO (MODAL CON PRECARGA) ====================
async function abrirModalActualizar() {
    document.getElementById('inputActualizarCodigo').value = '';
    document.getElementById('formActualizarModal').style.display = 'none';
    document.getElementById('inputActualizarCodigo').style.display = 'block';
    document.getElementById('btnBuscarActualizar').style.display = 'inline-block';
    document.getElementById('btnGuardarActualizar').style.display = 'none';
    document.getElementById('modalActualizar').classList.add('activo');
}

async function buscarParaActualizar() {
    const codigo = document.getElementById('inputActualizarCodigo').value.trim();
    if (!codigo) return mostrarNotificacion('Ingresa un código.', 'error');
    const res = await fetch(`${API}/api/miembros/${codigo}`, { credentials: 'include' });
    if (res.status === 404) return mostrarNotificacion('El código ingresado no pertenece a ningún miembro.', 'error');
    const data = await res.json();
    document.getElementById('inputActualizarCodigo').style.display = 'none';
    document.getElementById('btnBuscarActualizar').style.display = 'none';
    document.getElementById('btnGuardarActualizar').style.display = 'inline-block';
    document.getElementById('formActualizarModal').style.display = 'block';
    document.getElementById('m_actualizar_nombre').value = data.nombre.replace(/ \(.*\)/, '');
    document.getElementById('m_actualizar_telefono').value = data.telefono || '';
    document.getElementById('m_actualizar_tipo').value = data.tipo;
    document.getElementById('m_actualizar_grupo').value = data.grupo;

    const match = data.nombre.match(/\((.*)\)/);
    if (match && match[1]) {
        document.getElementById('m_actualizar_liderazgo_si').value = 'Si';
        document.getElementById('m_actualizar_liderazgo_texto').value = match[1];
        document.getElementById('div_actualizar_liderazgo_texto').style.display = 'block';
    } else {
        document.getElementById('m_actualizar_liderazgo_si').value = 'No';
        document.getElementById('div_actualizar_liderazgo_texto').style.display = 'none';
    }
}

function toggleActualizarLiderazgo() {
    const val = document.getElementById('m_actualizar_liderazgo_si').value;
    document.getElementById('div_actualizar_liderazgo_texto').style.display = val === 'Si' ? 'block' : 'none';
}

async function guardarActualizacion() {
    const codigo = document.getElementById('inputActualizarCodigo').value.trim();
    const liderazgoSi = document.getElementById('m_actualizar_liderazgo_si').value === 'Si';
    const liderazgoTexto = document.getElementById('m_actualizar_liderazgo_texto').value.trim();
    if (liderazgoSi && !liderazgoTexto) return mostrarNotificacion('Debes especificar el liderazgo.', 'error');

    const datos = {
        nombre: document.getElementById('m_actualizar_nombre').value.trim(),
        telefono: document.getElementById('m_actualizar_telefono').value.trim(),
        tipo: document.getElementById('m_actualizar_tipo').value,
        grupo: document.getElementById('m_actualizar_grupo').value,
        liderazgo: liderazgoSi ? liderazgoTexto : null
    };
    if (!datos.nombre) return mostrarNotificacion('El nombre no puede estar vacío.', 'error');

    const res = await fetch(`${API}/api/miembros/${codigo}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos), credentials: 'include' });
    if (res.ok) {
        mostrarNotificacion('Información actualizada.', 'exito');
        cerrarModalYLimpiar('modalActualizar');
        cargarMiembros(); // Refresca la lista sin expulsar al usuario
    } else {
        mostrarNotificacion('Error al actualizar.', 'error');
    }
}

// ==================== AUDITORÍA (HISTORIAL) ====================
async function cargarAuditoria() {
    const res = await fetch(`${API}/api/auditoria`, { credentials: 'include' });
    const lista = await res.json();
    let html = "";
    lista.forEach(n => {
        const fecha = new Date(n.fecha_hora);
        const fechaStr = fecha.toLocaleDateString('es-ES');
        const horaStr = fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        html += `<tr onclick="mostrarDetalleAuditoria('${n.accion}', '${n.detalles || 'Sin detalles adicionales'}', '${n.usuario_correo}', '${fechaStr} ${horaStr}')" style="cursor:pointer;">
            <td>${fechaStr} ${horaStr}</td><td>${n.usuario_correo}</td><td>${n.accion}</td>
        </tr>`;
    });
    document.getElementById('tablaAuditoria').innerHTML = html || "<tr><td colspan='3'>No hay actividad registrada.</td></tr>";
}

function mostrarDetalleAuditoria(accion, detalles, usuario, fecha) {
    mostrarNotificacion(`[${fecha}] ${usuario}\n\nAcción: ${accion}\n\nDetalles: ${detalles}`, 'info');
}

// ==================== VERIFICAR CLAVE ADMIN (FINANZAS) ====================
async function verificarClaveAdmin() {
    const clave = document.getElementById('inputContraAdmin').value;
    if (!clave) return mostrarNotificacion('Debes ingresar la clave del Admin.', 'error');
    const res = await fetch(`${API}/api/verificar-admin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: clave }), credentials: 'include' });
    if (res.ok) {
        mostrarNotificacion('Acceso a Finanzas concedido.', 'exito');
        document.getElementById('modalClaveAdmin').classList.remove('activo');
        cambiarPestaña('finanzas');
    } else {
        mostrarNotificacion('Clave incorrecta. Acceso denegado.', 'error');
    }
}

const API = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost' ? 'http://127.0.0.1:5000' : 'https://onrender.com';
let rol = null;
let esModoOscuro = false;
let intentosFallidos = 0;

const $ = id => document.getElementById(id);

// ==================== NOTIFICACIONES PERSONALIZADAS ====================
const mostrarNotificacion = (mensaje, tipo = 'error') => {
    const icono = tipo === 'exito' ? '✅' : tipo === 'info' ? 'ℹ️' : '⚠️';
    const iconoEl = $('iconoNotificacion');
    const textoEl = $('textoNotificacion');
    const modalNoti = $('modalNotificacion');

    if (iconoEl && textoEl && modalNoti) {
        iconoEl.textContent = icono;
        textoEl.innerHTML = mensaje; // Permite renderizar el HTML detallado de auditoría
        modalNoti.classList.add('activo');

        // Reordenar al final del body por JS para blindarlo contra problemas de z-index (Contextos de apilamiento)
        document.body.appendChild(modalNoti);
    }
};

// Cerrar notificación con tecla Enter
document.addEventListener('keydown', (e) => {
    const modalNoti = $('modalNotificacion');
    if (e.key === 'Enter' && modalNoti && modalNoti.classList.contains('activo')) {
        modalNoti.classList.remove('activo');
    }
});

// ==================== MAPEO DE ROLES Y GÉNEROS OFICIALES ====================
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

// ==================== CIERRE DE MENÚ MÓVIL ====================
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

// ==================== NAVEGACIÓN ====================
document.addEventListener('DOMContentLoaded', () => {
    // Intentar recuperar sesión persistente si existe
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
                mostrarNotificacion('Módulo En Desarrollo (Versión 2.0)', 'info');
                return;
            }
            if (targetId === 'finanzas' && rol === 'Secretario_General') {
                const modalClave = $('modalClaveAdmin');
                if (modalClave) modalClave.classList.add('activo');
                return;
            }
            cambiarPestaña(targetId);
        });
    });
});

const cambiarPestaña = id => {
    document.querySelectorAll('.tab-content, .sidebar .tab-btn').forEach(el => el.classList.remove('active'));

    const targetTab = $(id);
    const targetBtn = document.querySelector(`.tab-btn[data-tab="${id}"]`);

    if (targetTab) targetTab.classList.add('active');
    if (targetBtn) targetBtn.classList.add('active');

    if (id === 'membresia') cargarMiembros();
    if (id === 'asistencia') cargarAsistencia();
    if (id === 'santacena') iniciarCronometroSantaCena();
    if (id === 'solicitudes') cargarSolicitudes();
    if (id === 'auditoria') cargarAuditoria();
};

// ==================== LOGIN CON BLOQUEO ====================
let temporizadorLogin = null;

async function iniciarSesion(e) {
    if (e) e.preventDefault();
    const emailInp = $('l_email');
    const passInp = $('l_pass');

    if (temporizadorLogin) {
        mostrarNotificacion('Espera a que termine el bloqueo.', 'error');
        return;
    }

    try {
        const res = await fetch(`${API}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailInp.value, password: passInp.value }),
            credentials: 'include'
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
            if (emailInp) emailInp.value = '';
            if (passInp) passInp.value = '';
            return;
        }

        rol = data.rol;
        sessionStorage.setItem('zoar360_user', JSON.stringify({ rol: data.rol, email: data.email }));
        if (rol === 'Administrador') localStorage.setItem('zoar360_admin', 'true');

        configurarInterfazPostLogin(data.email);

    } catch (err) {
        mostrarNotificacion('Error de conexión con el servidor.', 'error');
    }
}

function configurarInterfazPostLogin(emailUsuario) {
    const pantallaLogin = $('pantallaLogin');
    const appPrincipal = $('appPrincipal');
    if (pantallaLogin) pantallaLogin.style.display = 'none';
    if (appPrincipal) appPrincipal.style.display = 'block';

    const fecha = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const fechaHeader = $('fechaHeader');
    if (fechaHeader) fechaHeader.textContent = fecha;

    const info = MAPA_ROLES[rol] || { ministerio: 'General', rol: rol };

    const nombreUsuarioHeader = $('nombreUsuarioHeader');
    const rolUsuarioDropdown = $('rolUsuarioDropdown');
    const ministerioUsuarioDropdown = $('ministerioUsuarioDropdown');
    const correoUsuarioDropdown = $('correoUsuarioDropdown');

    if (nombreUsuarioHeader) nombreUsuarioHeader.textContent = info.rol;
    if (rolUsuarioDropdown) rolUsuarioDropdown.textContent = info.rol;
    if (ministerioUsuarioDropdown) ministerioUsuarioDropdown.textContent = info.ministerio;
    if (correoUsuarioDropdown) correoUsuarioDropdown.textContent = emailUsuario;

    const esAdminPastor = (rol === 'Administrador' || rol === 'Pastor');
    const esSecretarioGeneral = (rol === 'Secretario_General');
    const esSecretarioGrupo = (rol.startsWith('Secretario_') || rol.startsWith('Secretaria_')) && rol !== 'Secretario_General';

    document.querySelectorAll('.sidebar .tab-btn').forEach(b => b.style.display = 'flex');

    if ($('btnSolicitudes')) $('btnSolicitudes').style.display = esAdminPastor ? 'flex' : 'none';
    if ($('btnFinanzas')) $('btnFinanzas').style.display = (esAdminPastor || esSecretarioGeneral) ? 'flex' : 'none';
    if ($('btnEventos')) $('btnEventos').style.display = esAdminPastor ? 'flex' : 'none';
    if ($('btnPrivilegios')) $('btnPrivilegios').style.display = esAdminPastor ? 'flex' : 'none';
    if ($('btnAuditoria')) $('btnAuditoria').style.display = esAdminPastor ? 'flex' : 'none';
    if ($('btnSantaCena')) $('btnSantaCena').style.display = (esAdminPastor || esSecretarioGeneral) ? 'flex' : 'none';

    if (esSecretarioGrupo) {
        if ($('btnMembresia')) $('btnMembresia').style.display = 'none';
        if ($('btnSantaCena')) $('btnSantaCena').style.display = 'none';
        if ($('btnEliminarAdmin')) $('btnEliminarAdmin').style.display = 'none';
        if ($('btnActualizarAdmin')) $('btnActualizarAdmin').style.display = 'none';
        if ($('btnAuditoria')) $('btnAuditoria').style.display = 'none';
        if ($('btnSolicitudes')) $('btnSolicitudes').style.display = 'none';
        if ($('btnFinanzas')) $('btnFinanzas').style.display = 'none';
        if ($('btnEventos')) $('btnEventos').style.display = 'none';
        if ($('btnPrivilegios')) $('btnPrivilegios').style.display = 'none';
        cambiarPestaña('asistencia');
    } else {
        if ($('btnEliminarAdmin')) $('btnEliminarAdmin').style.display = 'inline-flex';
        if ($('btnActualizarAdmin')) $('btnActualizarAdmin').style.display = 'inline-flex';
        cambiarPestaña('membresia');
    }
    document.body.classList.remove('sidebar-abierto');
}

function iniciarTemporizadorLogin(segundos) {
    const btnLogin = document.querySelector('#formLogin .btn-submit');
    if (!btnLogin) return;
    btnLogin.disabled = true;
    btnLogin.textContent = `Espera ${segundos}s`;

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

// ==================== SEGURIDAD Y CIERRE DE SESIÓN ====================
window.addEventListener('beforeunload', () => {
    if (rol && rol !== 'Administrador') sessionStorage.removeItem('zoar360_user');
});
document.addEventListener('visibilitychange', () => {
    if (document.hidden && rol && rol !== 'Administrador') {
        sessionStorage.removeItem('zoar360_user');
        window.location.reload();
    }
});
function cerrarSesion() {
    sessionStorage.clear();
    if (rol !== 'Administrador') localStorage.clear();
    window.location.reload();
}
// ==================== FORMULARIO DINÁMICO (Liderazgo) ====================
function toggleLiderazgoPorTipo() {
    const tipo = $('m_tipo').value;
    const divLiderazgoPregunta = $('div_liderazgo_pregunta');
    const divLiderazgoTexto = $('div_liderazgo_texto');
    if (tipo === 'Propiedad') {
        if (divLiderazgoPregunta) divLiderazgoPregunta.style.display = 'block';
        const selectSiNo = $('m_liderazgo_si');
        if (selectSiNo) selectSiNo.value = 'No';
        if (divLiderazgoTexto) divLiderazgoTexto.style.display = 'none';
    } else {
        if (divLiderazgoPregunta) divLiderazgoPregunta.style.display = 'none';
        if (divLiderazgoTexto) divLiderazgoTexto.style.display = 'none';
    }
}
function toggleLiderazgoSiNo() {
    const val = $('m_liderazgo_si').value;
    const divTexto = $('div_liderazgo_texto');
    if (divTexto) divTexto.style.display = val === 'Si' ? 'block' : 'none';
}
// ==================== GUARDAR MIEMBRO / SOLICITUD ====================
async function guardarMiembro(e) {
    if (e) e.preventDefault();
    const nombre = $('m_nombre').value.trim();
    const tipo = $('m_tipo').value;
    if (!nombre) return mostrarNotificacion('El nombre no puede estar vacío.', 'error');
    let liderazgoTexto = null;
    if (tipo === 'Propiedad') {
        const esLiderazgo = $('m_liderazgo_si').value === 'Si';
        liderazgoTexto = esLiderazgo ? $('m_liderazgo_texto').value.trim() : null;
        if (esLiderazgo && !liderazgoTexto) return mostrarNotificacion('Si marca Sí, debe especificar el liderazgo.', 'error');
    }
    let grupos = [];
    if ($('g_femenil') && $('g_femenil').checked) grupos.push('Concilio Misionero Femenil');
    if ($('g_misioneritas') && $('g_misioneritas').checked) grupos.push('Misioneritas');
    if ($('g_varones') && $('g_varones').checked) grupos.push('Fraternidad de Varones');
    if ($('g_exploradores') && $('g_exploradores').checked) grupos.push('Exploradores del Rey');
    if ($('g_embajadores') && $('g_embajadores').checked) grupos.push('Embajadores de Cristo');
    const datos = {
        nombre: nombre,
        telefono: $('m_telefono').value.trim() || null,
        tipo: tipo,
        grupo: grupos.join(', ') || 'Culto General',
        liderazgo: liderazgoTexto
    };
    const esAdminPastor = (rol === 'Administrador' || rol === 'Pastor');
    const url = esAdminPastor ? `${API}/api/miembros` : `${API}/api/solicitudes`;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos),
            credentials: 'include'
        });
        if (res.ok) {
            mostrarNotificacion(esAdminPastor ? 'Miembro registrado con éxito.' : 'Solicitud enviada exitosamente al Pastor.', 'exito');
            cerrarModalYLimpiar('modalMiembro');
            if (esAdminPastor) cargarMiembros();
        } else {
            const err = await res.json();
            mostrarNotificacion(err.error || 'Error al guardar.', 'error');
        }
    } catch (err) {
        mostrarNotificacion('Error de red al intentar guardar.', 'error');
    }
}
// ==================== CARGAR MIEMBROS (LISTA) ====================
async function cargarMiembros() {
    try {
        const res = await fetch(`${API}/api/miembros`, { credentials: 'include' });
        const lista = await res.json();
        const tabla = $('tablaMiembros');
        if (tabla) {
            tabla.innerHTML = lista.map(m =>
                `<tr> <td><strong>${m.codigo}</strong></td> <td>${m.nombre}</td> <td>${m.telefono || '---'}</td> <td><span class="badge badge-propiedad">${m.tipo}</span></td> <td>${m.grupo}</td> </tr>`
            ).join('');
        }
    } catch (e) {
        console.error("Error al cargar miembros:", e);
    }
}
// ==================== CARGAR SOLICITUDES ====================
async function cargarSolicitudes() {
    try {
        const res = await fetch(`${API}/api/solicitudes`, { credentials: 'include' });
        const lista = await res.json();
        const tabla = $('tablaSolicitudes');
        if (tabla) {
            tabla.innerHTML = lista.map(s =>
                `<tr> <td>${s.nombre}</td> <td><span class="badge badge-pendiente" style="background:#fef3c7; color:#b45309; padding: 4px 8px; border-radius: 4px;">${s.estado}</span></td> <td><button class="tab-btn" style="width:auto; padding:5px 10px; font-size:0.8rem; background:#22c55e; color:white; border-radius:4px;" onclick="procesarSolicitud(${s.id}, 'Aprobada')">Aprobar</button></td> </tr>`
            ).join('');
        }
    } catch (e) {
        console.error("Error al cargar solicitudes:", e);
    }
}
async function procesarSolicitud(id, estado) {
    try {
        const res = await fetch(`${API}/api/solicitudes/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: estado }),
            credentials: 'include'
        });
        if (res.ok) {
            mostrarNotificacion('Solicitud procesada con éxito.', 'exito');
            cargarSolicitudes();
            cargarMiembros();
        }
    } catch (e) {
        mostrarNotificacion('Error al procesar la solicitud.', 'error');
    }
}
// ==================== ASISTENCIA CON FILTRO SECTORIAL ====================
async function cargarAsistencia() {
    const ahora = new Date();
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const dia = dias[ahora.getDay()];
    const mapa = {
        'Martes': 'Concilio Misionero Femenil',
        'Miércoles': 'Misioneritas',
        'Jueves': 'Fraternidad de Varones',
        'Viernes': 'Exploradores del Rey',
        'Sábado': 'Embajadores de Cristo',
        'Domingo': 'Culto General'
    };
    let grupo = mapa[dia] || '';
    const btnRecargar = $('btnRecargarListaAsistencia');
    const diaActualEl = $('diaActual');
    const grupoActualEl = $('grupoActual');
    const tablaAsi = $('tablaAsistencia');
    if (!grupo) {
        if (diaActualEl) diaActualEl.textContent = dia;
        if (grupoActualEl) grupoActualEl.textContent = 'Sin culto hoy';
        if (tablaAsi) tablaAsi.innerHTML = "Hoy lunes no se encuentra programado ningún culto.";
        if (btnRecargar) { btnRecargar.disabled = true; btnRecargar.style.opacity = '0.5'; }
        return;
    } else {
        if (btnRecargar) { btnRecargar.disabled = false; btnRecargar.style.opacity = '1'; }
    }
    if (diaActualEl) diaActualEl.textContent = dia;
    if (grupoActualEl) grupoActualEl.textContent = grupo;
    const esCuentaGrupo = rol.startsWith('Secretario_') || rol.startsWith('Secretaria_');
    const esSecretarioGeneral = (rol === 'Secretario_General');
    let endpoint = (esCuentaGrupo && !esSecretarioGeneral) ? `${API}/api/asistencia/grupo/${grupo}` : `${API}/api/miembros`;
    try {
        const res = await fetch(endpoint, { credentials: 'include' });
        const lista = await res.json();
        if (lista.error) {
            if (tablaAsi) tablaAsi.innerHTML = `<tr><td colspan='5' style='text-align:center; color:#ef4444;'>${lista.error}</td></tr>`;
            return;
        }
        if (tablaAsi) {
            tablaAsi.innerHTML = lista.map(m =>
                `<tr> <td><strong>${m.codigo}</strong></td> <td>${m.nombre}</td> <td>${m.grupo}</td> <td><input type="checkbox" class="asistencia-check" data-codigo="${m.codigo}" style="width:20px; height:20px;" /></td> <td><strong>${m.total_asistencias || 0}</strong></td> </tr>`
            ).join('');
        }
    } catch (e) {
        if (tablaAsi) tablaAsi.innerHTML = "Error al conectar con el servidor.";
    }
}
async function guardarAsistencia() {
    const checks = document.querySelectorAll('.asistencia-check:checked');
    if (!checks.length) return mostrarNotificacion('Advertencia: Selecciona al menos un miembro para guardar la lista.', 'error');
    const listaCodigos = Array.from(checks).map(check => check.dataset.codigo);
    try {
        const res = await fetch(`${API}/api/marcar-asistencia`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ codigos: listaCodigos }),
            credentials: 'include'
        });
        const data = await res.json();
        if (!res.ok) {
            return mostrarNotificacion(data.error || 'Error al guardar asistencia.', 'error');
        }
        mostrarNotificacion('✅ Asistencias guardadas exitosamente en el servidor.', 'exito');
        cargarAsistencia();
    } catch (e) {
        mostrarNotificacion('Error de red al guardar asistencia.', 'error');
    }
}
// ==================== SANTA CENA (CRONÓMETRO) ====================
let intervaloActual = null;
function iniciarCronometroSantaCena() {
    if (intervaloActual) clearInterval(intervaloActual);
    cargarSantaCena();
    intervaloActual = setInterval(() => {
        const hoy = new Date();
        let año = hoy.getFullYear();
        let mes = hoy.getMonth();
        let primerDiaMes = new Date(año, mes, 1);
        let primerDomingo = 1 + ((7 - primerDiaMes.getDay()) % 7);
        let fechaSantaCena = new Date(año, mes, primerDomingo);
        if (hoy > fechaSantaCena.setHours(23, 59, 59, 999)) {
            mes++;
            if (mes > 11) { mes = 0; año++; }
            primerDiaMes = new Date(año, mes, 1);
            primerDomingo = 1 + ((7 - primerDiaMes.getDay()) % 7);
            fechaSantaCena = new Date(año, mes, primerDomingo);
        }
        const diferencia = fechaSantaCena - hoy;
        const cronoEl = $('cronometroSantaCena');
        if (!cronoEl) return;
        if (diferencia <= 0) {
            cronoEl.innerHTML = `<span style="color:#22c55e; font-weight:bold;">¡Hoy es el día de la Santa Cena!</span>`;
            return;
        }
        const dias = Math.floor(diferencia / (1000 * 60 * 60 * 24));
        const horas = Math.floor((diferencia % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutos = Math.floor((diferencia % (1000 * 60 * 60)) / (1000 * 60));
        const segundos = Math.floor((diferencia % (1000 * 60)) / 1000);
        cronoEl.textContent = `${dias} días, ${horas} h, ${minutos} m, ${segundos} s`;
    }, 1000);
}
async function cargarSantaCena() {
    try {
        const res = await fetch(`${API}/api/miembros`, { credentials: 'include' });
        const lista = await res.json();
        const filtrados = lista.filter(m => m.tipo === 'Propiedad');
        const tablaSC = $('tablaSantaCena');
        if (tablaSC) {
            tablaSC.innerHTML = filtrados.map(m =>
                `<tr><td><strong>${m.codigo}</strong></td><td>${m.nombre}</td><td><input type="checkbox" class="sc-check" data-id="${m.id}" style="width:20px; height:20px;" /></td></tr>`
            ).join('');
        }
    } catch (e) {
        console.error("Error al cargar Santa Cena:", e);
    }
}
async function guardarSantaCena() {
    const ahora = new Date();
    if (ahora.getDay() !== 0) return mostrarNotificacion('La Santa Cena solo se registra los Domingos.', 'error');
    const fecha = ahora.toISOString().split('T')[0];
    const checks = document.querySelectorAll('.sc-check:checked');
    if (!checks.length) return mostrarNotificacion('No hay asistentes seleccionados.', 'error');
    try {
        for (const check of checks) {
            await fetch(`${API}/api/santacena`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ miembro_id: parseInt(check.dataset.id), fecha: fecha, asistio: true }),
                credentials: 'include'
            });
        }
        mostrarNotificacion('✅ Registro de Santa Cena guardado con éxito.', 'exito');
    } catch (e) {
        mostrarNotificacion('Error de red al guardar registro de Santa Cena.', 'error');
    }
}
// ==================== ELIMINAR MIEMBRO ====================
async function abrirModalEliminar() {
    const inpCod = $('inputEliminarCodigo');
    const txtConf = $('textoConfirmacionEliminar');
    if (inpCod) inpCod.value = '';
    if (txtConf) txtConf.innerHTML = '';
    const modalDel = $('modalEliminar');
    if (modalDel) modalDel.classList.add('activo');
}
async function buscarYEliminar() {
    const codigo = $('inputEliminarCodigo').value.trim();
    if (!codigo) return mostrarNotificacion('Ingresa un código.', 'error');
    try {
        const res = await fetch(`${API}/api/miembros/${codigo}`, { credentials: 'include' });
        if (res.status === 404) return mostrarNotificacion('El código ingresado no pertenece a ningún miembro.', 'error');
        const data = await res.json();
        if (!confirm(`¿Estás seguro que quieres eliminar al hermano ${data.nombre} (Código ${codigo})?`)) return;
        const delRes = await fetch(`${API}/api/miembros/${codigo}`, { method: 'DELETE', credentials: 'include' });
        if (delRes.ok) {
            mostrarNotificacion('Miembro eliminado y códigos reordenados con éxito.', 'exito');
            cerrarModalYLimpiar('modalEliminar');
            cargarMiembros();
        } else {
            const err = await delRes.json();
            mostrarNotificacion(err.error || 'Error al eliminar miembro.', 'error');
        }
    } catch (e) {
        mostrarNotificacion('Error de red al intentar eliminar miembro.', 'error');
    }
}
// ==================== ACTUALIZAR MIEMBRO ====================
async function abrirModalActualizar() {
    const inpActCod = $('inputActualizarCodigo');
    const formAct = $('formActualizarModal');
    const btnBusc = $('btnBuscarActualizar');
    const btnGuar = $('btnGuardarActualizar');
    const modalAct = $('modalActualizar');
    if (inpActCod) inpActCod.value = '';
    if (formAct) formAct.style.display = 'none';
    if (inpActCod) inpActCod.style.display = 'block';
    if (btnBusc) btnBusc.style.display = 'inline-block';
    if (btnGuar) btnGuar.style.display = 'none';
    if (modalAct) modalAct.classList.add('activo');
}
async function buscarParaActualizar() {
    const codigo = $('inputActualizarCodigo').value.trim();
    if (!codigo) return mostrarNotificacion('Ingresa un código.', 'error');
    try {
        const res = await fetch(`${API}/api/miembros/${codigo}`, { credentials: 'include' });
        if (res.status === 404) return mostrarNotificacion('El código ingresado no pertenece a ningún miembro.', 'error');
        const data = await res.json();
        const inpActCod = $('inputActualizarCodigo');
        const btnBusc = $('btnBuscarActualizar');
        const btnGuar = $('btnGuardarActualizar');
        const formAct = $('formActualizarModal');
        if (inpActCod) inpActCod.style.display = 'none';
        if (btnBusc) btnBusc.style.display = 'none';
        if (btnGuar) btnGuar.style.display = 'inline-block';
        if (formAct) formAct.style.display = 'block';
        if ($('m_actualizar_nombre')) $('m_actualizar_nombre').value = data.nombre.replace(/ \(.*\)/, '');
        if ($('m_actualizar_telefono')) $('m_actualizar_telefono').value = data.telefono || '';
        if ($('m_actualizar_tipo')) $('m_actualizar_tipo').value = data.tipo;
        if ($('m_actualizar_grupo')) $('m_actualizar_grupo').value = data.grupo;
        const divLiderazgoPregunta = $('div_actualizar_liderazgo_pregunta');
        const divLiderazgoTexto = $('div_actualizar_liderazgo_texto');
        if (data.tipo === 'Propiedad') {
            if (divLiderazgoPregunta) divLiderazgoPregunta.style.display = 'block';
            const match = data.nombre.match(/\((.*)\)/);
            if (match && match[1]) {
                if ($('m_actualizar_liderazgo_si')) $('m_actualizar_liderazgo_si').value = 'Si';
                if ($('m_actualizar_liderazgo_texto')) $('m_actualizar_liderazgo_texto').value = match[1];
                if (divLiderazgoTexto) divLiderazgoTexto.style.display = 'block';
            } else {
                if ($('m_actualizar_liderazgo_si')) $('m_actualizar_liderazgo_si').value = 'No';
                if ($('m_actualizar_liderazgo_texto')) $('m_actualizar_liderazgo_texto').value = '';
                if (divLiderazgoTexto) divLiderazgoTexto.style.display = 'none';
            }
        } else {
            if (divLiderazgoPregunta) divLiderazgoPregunta.style.display = 'none';
            if (divLiderazgoTexto) divLiderazgoTexto.style.display = 'none';
        }
    } catch (e) {
        mostrarNotificacion('Error al consultar datos del miembro.', 'error');
    }
}
function handleActualizarTipoCambio() {
    const tipo = $('m_actualizar_tipo').value;
    const divLiderazgoPregunta = $('div_actualizar_liderazgo_pregunta');
    const divLiderazgoTexto = $('div_actualizar_liderazgo_texto');
    if (tipo === 'Propiedad') {
        if (divLiderazgoPregunta) divLiderazgoPregunta.style.display = 'block';
        if ($('m_actualizar_liderazgo_si')) $('m_actualizar_liderazgo_si').value = 'No';
        if (divLiderazgoTexto) divLiderazgoTexto.style.display = 'none';
    } else {
        if (divLiderazgoPregunta) divLiderazgoPregunta.style.display = 'none';
        if (divLiderazgoTexto) divLiderazgoTexto.style.display = 'none';
    }
}
function toggleActualizarLiderazgo() {
    const val = $('m_actualizar_liderazgo_si').value;
    const divLiderazgoTexto = $('div_actualizar_liderazgo_texto');
    if (divLiderazgoTexto) divLiderazgoTexto.style.display = val === 'Si' ? 'block' : 'none';
}
async function guardarActualizacion() {
    const codigo = $('inputActualizarCodigo').value.trim();
    const tipo = $('m_actualizar_tipo').value;
    const liderazgoSi = $('m_actualizar_liderazgo_si').value === 'Si';
    const liderazgoTexto = $('m_actualizar_liderazgo_texto').value.trim();
    if (tipo === 'Propiedad' && liderazgoSi && !liderazgoTexto) {
        return mostrarNotificacion('Si marca Sí, debe especificar los cargos de liderazgo.', 'error');
    }
    const datos = {
        nombre: $('m_actualizar_nombre').value.trim(),
        telefono: $('m_actualizar_telefono').value.trim() || null,
        tipo: tipo,
        grupo: $('m_actualizar_grupo').value,
        liderazgo: (tipo === 'Propiedad' && liderazgoSi) ? liderazgoTexto : null
    };
    if (!datos.nombre) return mostrarNotificacion('El nombre es obligatorio y no puede ir vacío.', 'error');
    try {
        const res = await fetch(`${API}/api/miembros/${codigo}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos),
            credentials: 'include'
        });
        if (res.ok) {
            mostrarNotificacion('Información del miembro actualizada con éxito.', 'exito');
            cerrarModalYLimpiar('modalActualizar');
            cargarMiembros();
        } else {
            const err = await res.json();
            mostrarNotificacion(err.error || 'Error al guardar los cambios.', 'error');
        }
    } catch (e) {
        mostrarNotificacion('Error de red al intentar actualizar la información.', 'error');
    }
}
// ==================== AUDITORÍA (HISTORIAL EXPANDIBLE) ====================
async function cargarAuditoria() {
    try {
        const res = await fetch(`${API}/api/auditoria`, { credentials: 'include' });
        const lista = await res.json();
        let html = "";
        lista.forEach(n => {
            const fecha = new Date(n.fecha_hora);
            const fechaStr = fecha.toLocaleDateString('es-ES');
            const horaStr = fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            const accionLimpia = n.accion.replace(/'/g, "\'");
            const detallesLimpios = (n.detalles || 'Sin detalles adicionales registrados.').replace(/'/g, "\'").replace(/\n/g, " ");
            const correoLimpio = n.usuario_correo.replace(/'/g, "\'");
            html += `<tr onclick="mostrarDetalleAuditoria('${accionLimpia}', '${detallesLimpios}', '${correoLimpio}', '${fechaStr} ${horaStr}')" style="cursor:pointer;"> <td><strong>${fechaStr} ${horaStr}</strong></td> <td>${n.usuario_correo}</td> <td><span style="color:#0c4d8e; font-weight:500;">${n.accion}</span></td> </tr>`;
        });
        const tablaAud = $('tablaAuditoria');
        if (tablaAud) tablaAud.innerHTML = html || "No se ha registrado actividad en el historial.";
    } catch (e) {
        if ($('tablaAuditoria')) $('tablaAuditoria').innerHTML = "Error al cargar los registros de auditoría.";
    }
}
function mostrarDetalleAuditoria(accion, detalles, usuario, fecha) {
    const cuerpoDetalle = `<div style="text-align:left; line-height:1.6; font-size:0.95rem;"> <p><strong>📅 Fecha y Hora:</strong> ${fecha}</p> <p><strong>📧 Usuario Operador:</strong> ${usuario}</p> <p><strong>⚡ Acción Realizada:</strong> ${accion}</p> <hr style="border:0; border-top:1px solid #e2e8f0; margin:12px 0;" /> <p><strong>📋 Detalles Técnicos de la Operación:</strong></p> <div style="background:#f8fafc; padding:10px; border-radius:6px; border:1px solid #e2e8f0; font-family:monospace; white-space:pre-wrap; word-break:break-word; max-height:200px; overflow-y:auto;">${detalles}</div> </div>`;
    mostrarNotificacion(cuerpoDetalle, 'info');
}
// ==================== VERIFICAR CLAVE ADMIN (FINANZAS) ====================
async function verificarClaveAdmin() {
    const clave = $('inputContraAdmin').value;
    if (!clave) return mostrarNotificacion('Advertencia: Debes ingresar la clave de autorización del Administrador.', 'error');
    try {
        const res = await fetch(`${API}/api/verificar-admin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: clave }),
            credentials: 'include'
        });
        if (res.ok) {
            mostrarNotificacion('✅ Acceso al módulo financiero autorizado.', 'exito');
            if ($('inputContraAdmin')) $('inputContraAdmin').value = '';
            const modalClave = $('modalClaveAdmin');
            if (modalClave) modalClave.classList.remove('activo');
            cambiarPestaña('finanzas');
        } else {
            mostrarNotificacion('Error: Clave incorrecta. Acceso denegado a las finanzas.', 'error');
        }
    } catch (e) {
        mostrarNotificacion('Error de red al intentar verificar la clave de seguridad.', 'error');
    }
}
// ==================== LIMPIEZA DE MODALES Y UTILIDADES ====================
function cerrarModalYLimpiar(modalId) {
    const modal = $(modalId);
    if (!modal) return;
    modal.classList.remove('activo');
    modal.querySelectorAll('input, select, textarea').forEach(input => {
        if (input.type === 'checkbox' || input.type === 'radio') input.checked = false;
        else if (input.tagName === 'SELECT') input.selectedIndex = 0;
        else input.value = '';
    });
    if (modalId === 'modalMiembro') {
        if ($('div_liderazgo_pregunta')) $('div_liderazgo_pregunta').style.display = 'none';
        if ($('div_liderazgo_texto')) $('div_liderazgo_texto').style.display = 'none';
        const formMieb = $('formMiembroModal');
        if (formMieb) formMieb.reset();
    }
    if (modalId === 'modalEliminar') {
        const txtConf = $('textoConfirmacionEliminar');
        if (txtConf) txtConf.innerHTML = '';
    }
    if (modalId === 'modalActualizar') {
        if ($('formActualizarModal')) $('formActualizarModal').style.display = 'none';
        if ($('inputActualizarCodigo')) $('inputActualizarCodigo').style.display = 'block';
        if ($('btnBuscarActualizar')) $('btnBuscarActualizar').style.display = 'inline-block';
        if ($('btnGuardarActualizar')) $('btnGuardarActualizar').style.display = 'none';
        if ($('div_actualizar_liderazgo_texto')) $('div_actualizar_liderazgo_texto').style.display = 'none';
        if ($('div_actualizar_liderazgo_pregunta')) $('div_actualizar_liderazgo_pregunta').style.display = 'none';
    }
}
const abrirModal = id => { const m = $(id); if (m) m.classList.add('activo'); };
const cerrarModal = id => cerrarModalYLimpiar(id);
// ==================== TEMA OSCURO Y DROPDOWN ====================
function toggleDropdown() {
    const headerUser = $('headerUser');
    if (headerUser) headerUser.classList.toggle('abierto');
}
function cambiarTema() {
    esModoOscuro = !esModoOscuro;
    document.body.classList.toggle('modo-oscuro', esModoOscuro);
    const btnTema = $('btnTema');
    if (btnTema) {
        btnTema.innerHTML = esModoOscuro ? '' : '';
    }
}