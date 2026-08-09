const API = 'https://zoar360.onrender.com';
let rol = null;
let esModoOscuro = false;

const $ = id => document.getElementById(id);
const mostrarNotificacion = (mensaje, tipo = 'error') => {
    const icono = tipo === 'exito' ? '✅' : tipo === 'info' ? 'ℹ️' : '⚠️';
    $('iconoNotificacion').textContent = icono;
    $('textoNotificacion').textContent = mensaje;
    $('modalNotificacion').classList.add('activo');
};

function toggleDropdown() { $('headerUser').classList.toggle('abierto'); }
function cambiarTema() {
    esModoOscuro = !esModoOscuro;
    document.body.classList.toggle('modo-oscuro', esModoOscuro);
    $('btnTema').innerHTML = esModoOscuro ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
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
    $(id).classList.add('active');
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
        $('pantallaLogin').style.display = 'none';
        $('appPrincipal').style.display = 'block';
        $('nombreUsuarioHeader').textContent = data.rol;

        // Dropdown info
        const fechaHoy = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        $('fechaHeader').textContent = fechaHoy;
        $('correoUsuarioDropdown').textContent = data.email;
        $('rolUsuarioDropdown').textContent = data.rol;
        $('fechaDropdown').textContent = fechaHoy;

        const esAdminPastor = (rol === 'Administrador' || rol === 'Pastor');
        const esSecretarioGrupo = rol.startsWith('Secretario_') && rol !== 'Secretario_General';

        document.querySelectorAll('.sidebar .tab-btn').forEach(b => b.style.display = 'flex');
        document.getElementById('btnSolicitudes').style.display = esAdminPastor ? 'flex' : 'none';
        document.getElementById('btnFinanzas').style.display = esAdminPastor ? 'flex' : 'none';

        if (esSecretarioGrupo) {
            document.querySelectorAll('.sidebar .tab-btn').forEach(b => {
                if (b.dataset.tab !== 'asistencia') b.style.display = 'none';
            });
            // Ocultar botones de Admin
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
    $('tablaMiembros').innerHTML = lista.map(m =>
        `<tr><td><strong>${m.codigo}</strong></td><td>${m.nombre}</td><td>${m.telefono || '---'}</td><td><span class="badge badge-propiedad">${m.tipo}</span></td><td>${m.grupo}</td></tr>`
    ).join('');
}

function toggleLiderazgo() {
    const val = document.getElementById('m_liderazgo_si').value;
    document.getElementById('div_liderazgo_texto').style.display = val === 'Si' ? 'block' : 'none';
}

async function guardarMiembro(e) {
    e.preventDefault();
    const nombre = $('m_nombre').value.trim();
    if (!nombre) return mostrarNotificacion('El nombre no puede estar vacío.', 'error');

    const liderazgoSi = $('m_liderazgo_si').value === 'Si';
    const liderazgoTexto = $('m_liderazgo_texto').value.trim();
    if (liderazgoSi && !liderazgoTexto) return mostrarNotificacion('Debes especificar el liderazgo.', 'error');

    let grupos = [];
    if ($('g_femenil').checked) grupos.push('Concilio Misionero Femenil');
    if ($('g_misioneritas').checked) grupos.push('Misioneritas');
    if ($('g_varones').checked) grupos.push('Fraternidad de Varones');
    if ($('g_exploradores').checked) grupos.push('Exploradores del Rey');
    if ($('g_embajadores').checked) grupos.push('Embajadores de Cristo');

    const datos = {
        nombre: nombre,
        telefono: $('m_telefono').value.trim() || null,
        tipo: $('m_tipo').value,
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
    $('tablaSolicitudes').innerHTML = lista.map(s => `<tr><td>${s.nombre}</td><td><span class="badge badge-pendiente" style="background:#fef3c7;">${s.estado}</span></td><td><button class="btn-submit" style="width:auto; padding:5px 10px; font-size:0.8rem;" onclick="procesarSolicitud(${s.id}, 'Aprobada')">Aprobar</button></td></tr>`).join('');
}

async function procesarSolicitud(id, estado) {
    await fetch(`${API}/api/solicitudes/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado: estado }) });
    mostrarNotificacion('Solicitud procesada.', 'exito');
    cargarSolicitudes(); cargarMiembros();
}

// ==================== ASISTENCIA (CON FILTRO Y HORARIO PERSONALIZADO) ====================
async function cargarAsistencia() {
    const ahora = new Date();
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const dia = dias[ahora.getDay()];
    const mapa = {
        'Martes': 'Concilio Misionero Femenil', 'Miércoles': 'Misioneritas',
        'Jueves': 'Fraternidad de Varones', 'Viernes': 'Exploradores del Rey',
        'Sábado': 'Embajadores de Cristo', 'Domingo': 'Culto General'
    };
    let grupo = mapa[dia] || '';
    $('diaActual').textContent = dia;
    $('grupoActual').textContent = grupo || 'Sin culto hoy';
    if (!grupo) return $('tablaAsistencia').innerHTML = "<tr><td colspan='5'>Hoy no hay culto.</td></tr>";

    // SECRETARIOS DE GRUPO: Solo ven su lista filtrada. PASTOR/ADMIN: Ven todo.
    let endpoint = (rol.startsWith('Secretario_') && rol !== 'Secretario_General') ? `${API}/api/asistencia/grupo/${grupo}` : `${API}/api/miembros`;

    const res = await fetch(endpoint);
    const lista = await res.json();
    $('tablaAsistencia').innerHTML = lista.map(m =>
        `<tr><td>${m.codigo}</td><td>${m.nombre}</td><td>${m.grupo}</td><td><input type="checkbox" class="asistencia-check" data-id="${m.id}" /></td><td><strong>${m.total_asistencias || 0}</strong></td></tr>`
    ).join('');
}

async function guardarAsistencia() {
    const checks = document.querySelectorAll('.asistencia-check:checked');
    if (!checks.length) return mostrarNotificacion('Selecciona al menos un miembro.', 'error');

    const ahora = new Date();
    const hora = ahora.getHours();
    const min = ahora.getMinutes();
    const diaSemana = ahora.getDay(); // 0 = Dom, 2=Mar, 3=Mie, 4=Jue, 5=Vie, 6=Sab

    // REGLAS DE HORARIO PERSONALIZADAS POR DÍA
    let mensajeError = null;
    if (diaSemana === 0) { // Domingo (General y Santa Cena)
        if (hora < 14 || (hora === 14 && min < 45) || hora >= 16) {
            mensajeError = "⛔ Fuera de horario. Domingos solo de 2:45 PM a 4:00 PM.";
        }
    } else if (diaSemana >= 2 && diaSemana <= 6) {
        // Días de semana (Martes a Sábado)
        if (hora < 17 || (hora === 17 && min < 45) || hora >= 19) {
            const diasSemanaMap = { 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado' };
            const nombreDia = diasSemanaMap[diaSemana];
            // Mensaje de error personalizado con el día correcto
            mensajeError = `⛔ Error: El registro para este grupo solo está habilitado los ${nombreDia} en el horario de 5:45 PM a 7:00 PM.`;
        }
    }

    if (mensajeError) return mostrarNotificacion(mensajeError, 'error');

    for (const check of checks) {
        const codigo = check.closest('tr').querySelector('td:first-child').innerText.trim();
        await fetch(`${API}/api/marcar-asistencia`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo }) });
    }
    mostrarNotificacion('✅ Asistencias guardadas.', 'exito');
    cargarAsistencia();
}

// ==================== SANTA CENA (CRONÓMETRO Y LÓGICA DE PRIVILEGIOS) ====================
function iniciarCronometroSantaCena() {
    const hoy = new Date();
    let año = hoy.getFullYear();
    let mes = hoy.getMonth();
    let dia = 1;

    // Calcular el PRIMER DOMINGO del mes
    let primerDiaMes = new Date(año, mes, 1);
    let primerDomingo = 1 + ((7 - primerDiaMes.getDay()) % 7);
    let fechaSantaCena = new Date(año, mes, primerDomingo);

    // Si ya pasó, calcular el del próximo mes
    if (hoy > fechaSantaCena) {
        mes++;
        if (mes > 11) { mes = 0; año++; }
        primerDiaMes = new Date(año, mes, 1);
        primerDomingo = 1 + ((7 - primerDiaMes.getDay()) % 7);
        fechaSantaCena = new Date(año, mes, primerDomingo);
    }

    // Iniciar cronómetro regresivo
    const intervalo = setInterval(() => {
        const ahora = new Date();
        const diferencia = fechaSantaCena - ahora;
        if (diferencia <= 0) {
            clearInterval(intervalo);
            $('cronometroSantaCena').innerHTML = `<span style="color:#22c55e;">¡Hoy es el día!</span>`;
            cargarSantaCena(); // Cargar lista para marcar
            return;
        }
        const dias = Math.floor(diferencia / (1000 * 60 * 60 * 24));
        const horas = Math.floor((diferencia % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutos = Math.floor((diferencia % (1000 * 60 * 60)) / (1000 * 60));
        $('cronometroSantaCena').textContent = `${dias} días, ${horas} h, ${minutos} m`;
    }, 1000);
}

async function cargarSantaCena() {
    const res = await fetch(`${API}/api/miembros`);
    const lista = await res.json();
    const filtrados = lista.filter(m => m.tipo === 'Propiedad');
    $('tablaSantaCena').innerHTML = filtrados.map(m =>
        `<tr><td><strong>${m.codigo}</strong></td><td>${m.nombre}</td><td><input type="checkbox" class="sc-check" data-id="${m.id}" /></td></tr>`
    ).join('');
}

async function guardarSantaCena() {
    const ahora = new Date();
    const diaSemana = ahora.getDay();
    if (diaSemana !== 0) return mostrarNotificacion('La Santa Cena solo se registra los Domingos.', 'error');

    const fecha = ahora.toISOString().split('T')[0];
    const checks = document.querySelectorAll('.sc-check:checked');
    if (!checks.length) return mostrarNotificacion('No hay asistentes seleccionados.', 'error');

    for (const check of checks) {
        await fetch(`${API}/api/santacena`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ miembro_id: parseInt(check.dataset.id), fecha: fecha, asistio: true }) });
    }
    mostrarNotificacion('✅ Registro de Santa Cena guardado con fecha del sistema.', 'exito');
}

// ==================== NUEVAS FUNCIONES PASTOR/ADMIN ====================
async function eliminarMiembroAdmin() {
    const codigo = $('inputEliminarCodigo').value.trim();
    if (!codigo) return mostrarNotificacion('Ingresa un código válido.', 'error');
    if (!confirm('¿Estás seguro de eliminar al miembro ' + codigo + '?')) return;

    const res = await fetch(`${API}/api/miembros/${codigo}`, { method: 'DELETE' });
    if (res.ok) { mostrarNotificacion('Miembro eliminado.', 'exito'); cerrarModal('modalEliminar'); cargarMiembros(); }
    else { const err = await res.json(); mostrarNotificacion(err.error, 'error'); }
}

// ==================== ABRIR/CERRAR MODALES ====================
const abrirModal = id => $(id).classList.add('activo');
const cerrarModal = id => $(id).classList.remove('activo');