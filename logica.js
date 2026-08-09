const API = 'https://zoar360.onrender.com';
let rol = null;
let esModoOscuro = false;
let usuarioLogueado = { email: '', rol: '' };

// ==================== UTILIDADES (Modales y Notificaciones) ====================
const $ = id => document.getElementById(id);
const mostrarNotificacion = (mensaje, tipo = 'error') => {
    const icono = tipo === 'exito' ? '✅' : tipo === 'info' ? 'ℹ️' : '⚠️';
    const color = tipo === 'exito' ? '#22c55e' : tipo === 'info' ? '#2563eb' : '#ef4444';
    $('iconoNotificacion').textContent = icono;
    $('iconoNotificacion').style.color = color;
    $('textoNotificacion').textContent = mensaje;
    $('modalNotificacion').classList.add('activo');
};

// ==================== CAMBIO DE TEMA ====================
function cambiarTema() {
    esModoOscuro = !esModoOscuro;
    document.body.classList.toggle('modo-oscuro', esModoOscuro);
    $('btnTema').innerHTML = esModoOscuro ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
}

// ==================== NAVEGACIÓN ====================
function toggleDropdown() { $('headerUser').classList.toggle('abierto'); }

// Conecta los botones del menú a sus secciones
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.sidebar .tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const targetId = this.dataset.tab;
            if(targetId === 'finanzas' && rol === 'Secretario_General') {
                $('modalClaveAdmin').classList.add('activo');
                return;
            }
            cambiarPestaña(targetId);
        });
    });
});

const cambiarPestaña = id => {
    document.querySelectorAll('.tab-content, .sidebar .tab-btn').forEach(el => el.classList.remove('active'));
    $(id).classList.add('active');
    document.querySelector(`.tab-btn[data-tab="${id}"]`).classList.add('active');
    if(id === 'membresia') cargarMiembros();
    if(id === 'asistencia') cargarAsistencia();
    if(id === 'santacena') cargarSantaCena();
    if(id === 'solicitudes') cargarSolicitudes();
};

// ==================== LOGIN Y PERMISOS ====================
async function iniciarSesion(e) {
    e.preventDefault();
    try {
        const res = await fetch(`${API}/api/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:$('l_email').value, password:$('l_pass').value}) });
        const data = await res.json();
        if(!res.ok) return mostrarNotificacion(data.error, 'error');
        
        rol = data.rol; usuarioLogueado = { email: data.email, rol: data.rol };
        $('pantallaLogin').style.display = 'none';
        $('appPrincipal').style.display = 'block';
        $('nombreUsuarioHeader').textContent = data.rol;
        $('correoUsuarioDropdown').textContent = data.email;

        const esAdminPastor = (rol === 'Administrador' || rol === 'Pastor');
        const esSecretarioGeneral = (rol === 'Secretario_General');
        const esSecretarioGrupo = rol.startsWith('Secretario_') && !esSecretarioGeneral;

        // Resetear visibilidad y luego ocultar según rol
        document.querySelectorAll('.sidebar .tab-btn').forEach(b => b.style.display = 'flex');
        document.getElementById('btnSolicitudes').style.display = esAdminPastor ? 'flex' : 'none';
        document.getElementById('btnPrivilegios').style.display = esAdminPastor ? 'flex' : 'none';
        document.getElementById('btnFinanzas').style.display = (esAdminPastor || esSecretarioGeneral) ? 'flex' : 'none';
        document.getElementById('btnSantaCena').style.display = (esAdminPastor || esSecretarioGeneral) ? 'flex' : 'none';

        if (esSecretarioGrupo) {
            document.querySelectorAll('.sidebar .tab-btn').forEach(b => {
                if(b.dataset.tab !== 'asistencia') b.style.display = 'none';
            });
            cambiarPestaña('asistencia');
        } else {
            cambiarPestaña(esSecretarioGeneral ? 'santacena' : 'membresia');
        }
        document.body.classList.remove('sidebar-abierto');
    } catch { mostrarNotificacion('Error de conexión con el servidor. Revisa Render.', 'error'); }
}

function cerrarSesion() { location.reload(); }

// ==================== VERIFICACIÓN CLAVE ADMIN (Finanzas) ====================
async function verificarClaveAdmin() {
    const clave = $('claveAdminInput').value;
    if(!clave) return mostrarNotificacion('Debes ingresar la clave.', 'error');
    const res = await fetch(`${API}/api/verificar-admin`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password: clave}) });
    const data = await res.json();
    if(res.ok) {
        cerrarModal('modalClaveAdmin');
        cambiarPestaña('finanzas');
    } else {
        mostrarNotificacion('Clave incorrecta. Acceso denegado.', 'error');
    }
}

// ==================== MIEMBROS Y SOLICITUDES ====================
async function cargarMiembros() {
    const res = await fetch(`${API}/api/miembros`);
    const lista = await res.json();
    $('tablaMiembros').innerHTML = lista.map(m => 
        `<tr><td><strong>${m.codigo}</strong></td><td>${m.nombre}</td><td>${m.telefono||'---'}</td><td><span class="badge badge-propiedad">${m.tipo}</span></td><td>${m.grupo}</td></tr>`
    ).join('');
}

function toggleLiderazgo() {
    const val = document.getElementById('m_liderazgo_si').value;
    document.getElementById('div_liderazgo_texto').style.display = val === 'Si' ? 'block' : 'none';
}

async function guardarMiembro(e) {
    e.preventDefault();
    // Construir grupos
    let grupos = [];
    if($('g_femenil').checked) grupos.push('Concilio Misionero Femenil');
    if($('g_misioneritas').checked) grupos.push('Misioneritas');
    if($('g_varones').checked) grupos.push('Fraternidad de Varones');
    if($('g_exploradores').checked) grupos.push('Exploradores del Rey');
    if($('g_embajadores').checked) grupos.push('Embajadores de Cristo');

    const datos = {
        nombre: $('m_nombre').value,
        telefono: $('m_telefono').value || null,
        tipo: $('m_tipo').value,
        grupo: grupos.join(', ') || 'General',
        liderazgo: ($('m_liderazgo_si').value === 'Si') ? $('m_liderazgo_texto').value : null
    };

    const esSolicitud = (rol.startsWith('Secretario_') && rol !== 'Secretario_General');
    const url = esSolicitud ? `${API}/api/solicitudes` : `${API}/api/miembros`;
    const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(datos) });
    if(res.ok) {
        mostrarNotificacion(esSolicitud ? 'Solicitud enviada al Pastor/Admin.' : 'Miembro registrado con éxito.', 'exito');
        cerrarModal('modalMiembro'); cargarMiembros();
    } else {
        const err = await res.json();
        mostrarNotificacion(err.error || 'Error al guardar.', 'error');
    }
}

// ==================== ASISTENCIA (Con Reloj y Horarios) ====================
async function cargarAsistencia() {
    const ahora = new Date();
    const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const dia = dias[ahora.getDay()];
    const mapa = {
        'Martes':'Concilio Misionero Femenil',
        'Miércoles':'Misioneritas',
        'Jueves':'Fraternidad de Varones',
        'Viernes':'Exploradores del Rey',
        'Sábado':'Embajadores de Cristo',
        'Domingo':'Culto General / Santa Cena'
    };
    let grupo = mapa[dia] || '';
    $('diaActual').textContent = dia;
    $('grupoActual').textContent = grupo || 'Sin culto hoy';

    if(!grupo) return $('tablaAsistencia').innerHTML = "<tr><td colspan='5'>Hoy no hay culto programado.</td></tr>";

    // Si es domingo, se carga general. Si no, se filtra por grupo.
    let endpoint = `${API}/api/asistencia/grupo/${grupo}`;
    if(dia === 'Domingo') endpoint = `${API}/api/miembros`;

    const res = await fetch(endpoint);
    const lista = await res.json();
    $('tablaAsistencia').innerHTML = lista.map(m => 
        `<tr><td>${m.codigo}</td><td>${m.nombre}</td><td>${m.grupo}</td><td><input type="checkbox" class="asistencia-check" data-id="${m.id}" /></td><td><strong>${m.total_asistencias || 0}</strong></td></tr>`
    ).join('');
}

async function guardarAsistencia() {
    const checks = document.querySelectorAll('.asistencia-check:checked');
    if(!checks.length) return mostrarNotificacion('Selecciona al menos un miembro.', 'error');
    
    const ahora = new Date();
    const hora = ahora.getHours();
    const min = ahora.getMinutes();
    const diaSemana = ahora.getDay(); // 0 = Dom, 4 = Jue, 6 = Sab

    let mensajeError = null;
    // Lógica de horarios y días
    if (diaSemana >= 1 && diaSemana <= 6) {
        if (hora < 17 || (hora === 17 && min < 45) || hora >= 19) {
            mensajeError = "⛔ Fuera de horario. De Martes a Sábado solo de 5:45 PM a 7:00 PM.";
        }
    } else if (diaSemana === 0) {
        if (hora < 14 || (hora === 14 && min < 45) || hora >= 16) {
            mensajeError = "⛔ Fuera de horario. Domingos solo de 2:45 PM a 4:00 PM.";
        }
    }

    if(mensajeError) return mostrarNotificacion(mensajeError, 'error');

    for (const check of checks) {
        const codigo = check.closest('tr').querySelector('td:first-child').innerText.trim();
        await fetch(`${API}/api/marcar-asistencia`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({codigo}) });
    }
    mostrarNotificacion('✅ Asistencias guardadas exitosamente.', 'exito');
    cargarAsistencia();
}

// ==================== SANTA CENA ====================
async function cargarSantaCena() {
    const res = await fetch(`${API}/api/miembros`);
    const lista = await res.json();
    const filtrados = lista.filter(m => m.tipo === 'Propiedad');
    $('tablaSantaCena').innerHTML = filtrados.map(m => 
        `<tr><td><strong>${m.codigo}</strong></td><td>${m.nombre}</td><td><input type="checkbox" class="sc-check" data-id="${m.id}" /></td></tr>`
    ).join('');
}

async function guardarSantaCena() {
    const fecha = $('sc_fecha').value;
    if(!fecha) return mostrarNotificacion('Selecciona una fecha', 'error');
    const checks = document.querySelectorAll('.sc-check:checked');
    if(!checks.length) return mostrarNotificacion('No hay asistentes seleccionados', 'error');
    for (const check of checks) {
        await fetch(`${API}/api/santacena`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({miembro_id: parseInt(check.dataset.id), fecha: fecha, asistio: true}) });
    }
    mostrarNotificacion('✅ Registro de Santa Cena guardado.', 'exito');
}

// ==================== UTILIDADES ====================
const abrirModal = id => $(id).classList.add('activo');
const cerrarModal = id => $(id).classList.remove('activo');