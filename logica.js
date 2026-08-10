const API = 'https://zoar360.onrender.com';
let rol = null;
let esModoOscuro = false;

const $ = id => document.getElementById(id);

// ==================== NOTIFICACIONES ====================
const mostrarNotificacion = (mensaje, tipo = 'error') => {
    const icono = tipo === 'exito' ? '✅' : tipo === 'info' ? 'ℹ️' : '⚠️';
    document.getElementById('iconoNotificacion').textContent = icono;
    document.getElementById('textoNotificacion').textContent = mensaje;
    document.getElementById('modalNotificacion').classList.add('activo');
};

// ==================== TEMA Y DROPDOWN ====================
function toggleDropdown() { document.getElementById('headerUser').classList.toggle('abierto'); }
function cambiarTema() {
    esModoOscuro = !esModoOscuro;
    document.body.classList.toggle('modo-oscuro', esModoOscuro);
    document.getElementById('btnTema').innerHTML = esModoOscuro ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
}

// ==================== NAVEGACIÓN ====================
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.sidebar .tab-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const targetId = this.dataset.tab;
            if (targetId === 'finanzas' && rol === 'Secretario_General') {
                return mostrarNotificacion('Módulo de Finanzas en desarrollo.', 'info');
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
};

// ==================== LOGIN ====================
async function iniciarSesion(e) {
    e.preventDefault();
    try {
        const res = await fetch(`${API}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: $('l_email').value, password: $('l_pass').value }) });
        const data = await res.json();
        if (!res.ok) return mostrarNotificacion(data.error, 'error');

        rol = data.rol;
        document.getElementById('pantallaLogin').style.display = 'none';
        document.getElementById('appPrincipal').style.display = 'block';
        document.getElementById('nombreUsuarioHeader').textContent = data.rol;

        const fechaHoy = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        document.getElementById('fechaHeader').textContent = fechaHoy;
        document.getElementById('correoUsuarioDropdown').textContent = data.email;
        document.getElementById('rolUsuarioDropdown').textContent = data.rol;
        document.getElementById('fechaDropdown').textContent = fechaHoy;

        const esAdminPastor = (rol === 'Administrador' || rol === 'Pastor');
        const esSecretarioGrupo = rol.startsWith('Secretario_') && rol !== 'Secretario_General';

        document.querySelectorAll('.sidebar .tab-btn').forEach(b => b.style.display = 'flex');
        document.getElementById('btnSolicitudes').style.display = esAdminPastor ? 'flex' : 'none';
        document.getElementById('btnFinanzas').style.display = esAdminPastor ? 'flex' : 'none';

        if (esSecretarioGrupo) {
            document.querySelectorAll('.sidebar .tab-btn').forEach(b => {
                if (b.dataset.tab !== 'asistencia') b.style.display = 'none';
            });
            document.getElementById('btnEliminarAdmin').style.display = 'none';
            document.getElementById('btnActualizarAdmin').style.display = 'none';
            cambiarPestaña('asistencia');
        } else {
            document.getElementById('btnEliminarAdmin').style.display = 'inline-flex';
            document.getElementById('btnActualizarAdmin').style.display = 'inline-flex';
            cambiarPestaña('membresia');
        }
        document.body.classList.remove('sidebar-abierto');
    } catch { mostrarNotificacion('Error de conexión con Render.', 'error'); }
}

function cerrarSesion() { location.reload(); }

// ==================== MIEMBROS & SOLICITUDES ====================
async function cargarMiembros() {
    const res = await fetch(`${API}/api/miembros`);
    const lista = await res.json();
    document.getElementById('tablaMiembros').innerHTML = lista.map(m =>
        `<tr><td><strong>${m.codigo}</strong></td><td>${m.nombre}</td><td>${m.telefono || '---'}</td><td><span class="badge badge-propiedad">${m.tipo}</span></td><td>${m.grupo}</td></tr>`
    ).join('');
}

function toggleLiderazgo() {
    const val = document.getElementById('m_liderazgo_si').value;
    document.getElementById('div_liderazgo_texto').style.display = val === 'Si' ? 'block' : 'none';
}

async function guardarMiembro(e) {
    e.preventDefault();
    const nombre = document.getElementById('m_nombre').value.trim();
    if (!nombre) return mostrarNotificacion('El nombre no puede estar vacío.', 'error');

    const liderazgoSi = document.getElementById('m_liderazgo_si').value === 'Si';
    const liderazgoTexto = document.getElementById('m_liderazgo_texto').value.trim();
    if (liderazgoSi && !liderazgoTexto) return mostrarNotificacion('Debes especificar el liderazgo.', 'error');

    let grupos = [];
    if (document.getElementById('g_femenil').checked) grupos.push('Concilio Misionero Femenil');
    if (document.getElementById('g_misioneritas').checked) grupos.push('Misioneritas');
    if (document.getElementById('g_varones').checked) grupos.push('Fraternidad de Varones');
    if (document.getElementById('g_exploradores').checked) grupos.push('Exploradores del Rey');
    if (document.getElementById('g_embajadores').checked) grupos.push('Embajadores de Cristo');

    const datos = {
        nombre: nombre,
        telefono: document.getElementById('m_telefono').value.trim() || null,
        tipo: document.getElementById('m_tipo').value,
        grupo: grupos.join(', ') || 'General',
        liderazgo: liderazgoSi ? liderazgoTexto : null
    };

    const esAdminPastor = (rol === 'Administrador' || rol === 'Pastor');
    const url = esAdminPastor ? `${API}/api/miembros` : `${API}/api/solicitudes`;

    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) });
    if (res.ok) {
        mostrarNotificacion(esAdminPastor ? 'Miembro registrado con éxito.' : 'Solicitud enviada al Pastor/Admin.', 'exito');
        cerrarModal('modalMiembro'); cargarMiembros();
    } else {
        const err = await res.json();
        mostrarNotificacion(err.error || 'Error al guardar.', 'error');
    }
}

async function cargarSolicitudes() {
    const res = await fetch(`${API}/api/solicitudes`);
    const lista = await res.json();
    document.getElementById('tablaSolicitudes').innerHTML = lista.map(s => `<tr><td>${s.nombre}</td><td><span class="badge badge-pendiente" style="background:#fef3c7;">${s.estado}</span></td><td><button class="btn-submit" style="width:auto; padding:5px 10px; font-size:0.8rem;" onclick="procesarSolicitud(${s.id}, 'Aprobada')">Aprobar</button></td></tr>`).join('');
}

async function procesarSolicitud(id, estado) {
    await fetch(`${API}/api/solicitudes/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado: estado }) });
    mostrarNotificacion('Solicitud procesada.', 'exito');
    cargarSolicitudes(); cargarMiembros();
}

// ==================== ASISTENCIA ====================
async function cargarAsistencia() {
    const ahora = new Date();
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const dia = dias[ahora.getDay()];
    const mapa = { 'Martes': 'Concilio Misionero Femenil', 'Miércoles': 'Misioneritas', 'Jueves': 'Fraternidad de Varones', 'Viernes': 'Exploradores del Rey', 'Sábado': 'Embajadores de Cristo', 'Domingo': 'Culto General' };
    let grupo = mapa[dia] || '';
    document.getElementById('diaActual').textContent = dia;
    document.getElementById('grupoActual').textContent = grupo || 'Sin culto hoy';
    if (!grupo) return document.getElementById('tablaAsistencia').innerHTML = "<tr><td colspan='5'>Hoy no hay culto.</td></tr>";

    let endpoint = (rol.startsWith('Secretario_') && rol !== 'Secretario_General') ? `${API}/api/asistencia/grupo/${grupo}` : `${API}/api/miembros`;
    const res = await fetch(endpoint);
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
        await fetch(`${API}/api/marcar-asistencia`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo }) });
    }
    mostrarNotificacion('✅ Asistencias guardadas.', 'exito');
    cargarAsistencia();
}

// ==================== SANTA CENA (CRONÓMETRO VIVO) ====================
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

        if (hoy > fechaSantaCena) {
            mes++;
            if (mes > 11) { mes = 0; año++; }
            primerDiaMes = new Date(año, mes, 1);
            primerDomingo = 1 + ((7 - primerDiaMes.getDay()) % 7);
            fechaSantaCena = new Date(año, mes, primerDomingo);
        }

        const diferencia = fechaSantaCena - hoy;
        if (diferencia <= 0) {
            document.getElementById('cronometroSantaCena').innerHTML = `<span style="color:#22c55e;">¡Hoy es el día!</span>`;
            return;
        }
        const dias = Math.floor(diferencia / (1000 * 60 * 60 * 24));
        const horas = Math.floor((diferencia % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutos = Math.floor((diferencia % (1000 * 60 * 60)) / (1000 * 60));
        const segundos = Math.floor((diferencia % (1000 * 60)) / 1000);
        document.getElementById('cronometroSantaCena').textContent = `${dias} días, ${horas} h, ${minutos} m, ${segundos} s`;
    }, 1000);
}

async function cargarSantaCena() {
    const res = await fetch(`${API}/api/miembros`);
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
        await fetch(`${API}/api/santacena`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ miembro_id: parseInt(check.dataset.id), fecha: fecha, asistio: true }) });
    }
    mostrarNotificacion('✅ Registro de Santa Cena guardado.', 'exito');
}

// ==================== MODAL ELIMINAR (CORREGIDO) ====================
async function abrirModalEliminar() {
    document.getElementById('inputEliminarCodigo').value = '';
    document.getElementById('textoConfirmacionEliminar').innerHTML = 'Cargando información...';
    document.getElementById('modalEliminar').classList.add('activo');
}

async function buscarYEliminar() {
    const codigo = document.getElementById('inputEliminarCodigo').value.trim();
    if (!codigo) return mostrarNotificacion('Ingresa un código.', 'error');

    const res = await fetch(`${API}/api/miembros/${codigo}`);
    if (res.status === 404) {
        return mostrarNotificacion('El código de miembro ingresado no existe', 'error');
    }
    const data = await res.json();

    if (!confirm(`¿Estás seguro que quieres eliminar al hermano ${data.nombre} (Código ${codigo})?`)) return;

    const delRes = await fetch(`${API}/api/miembros/${codigo}`, { method: 'DELETE' });
    if (delRes.ok) {
        mostrarNotificacion('Miembro eliminado y códigos reordenados.', 'exito');
        document.getElementById('modalEliminar').classList.remove('activo');
        cargarMiembros();
    } else {
        const err = await delRes.json();
        mostrarNotificacion(err.error, 'error');
    }
}

// ==================== MODAL ACTUALIZAR (NUEVO) ====================
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

    const res = await fetch(`${API}/api/miembros/${codigo}`);
    if (res.status === 404) return mostrarNotificacion('El código de miembro ingresado no existe', 'error');

    const data = await res.json();
    document.getElementById('inputActualizarCodigo').style.display = 'none';
    document.getElementById('btnBuscarActualizar').style.display = 'none';
    document.getElementById('btnGuardarActualizar').style.display = 'inline-block';
    document.getElementById('formActualizarModal').style.display = 'block';

    document.getElementById('m_actualizar_nombre').value = data.nombre.replace(/ \(.*\)/, '');
    document.getElementById('m_actualizar_telefono').value = data.telefono || '';
    document.getElementById('m_actualizar_tipo').value = data.tipo;
    document.getElementById('m_actualizar_grupo').value = data.grupo;
}

async function guardarActualizacion() {
    const codigo = document.getElementById('inputActualizarCodigo').value.trim();
    const datos = {
        nombre: document.getElementById('m_actualizar_nombre').value.trim(),
        telefono: document.getElementById('m_actualizar_telefono').value.trim(),
        tipo: document.getElementById('m_actualizar_tipo').value,
        grupo: document.getElementById('m_actualizar_grupo').value
    };
    if (!datos.nombre) return mostrarNotificacion('El nombre no puede estar vacío.', 'error');

    const res = await fetch(`${API}/api/miembros/${codigo}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) });
    if (res.ok) {
        mostrarNotificacion('Información actualizada.', 'exito');
        document.getElementById('modalActualizar').classList.remove('activo');
        cargarMiembros();
    } else {
        mostrarNotificacion('Error al actualizar.', 'error');
    }
}

// ==================== ABRIR/CERRAR MODALES ====================
const abrirModal = id => document.getElementById(id).classList.add('activo');
const cerrarModal = id => document.getElementById(id).classList.remove('activo');

function cerrarModalEliminar() { document.getElementById('modalEliminar').classList.remove('activo'); }
function cerrarModalActualizar() { document.getElementById('modalActualizar').classList.remove('activo'); }