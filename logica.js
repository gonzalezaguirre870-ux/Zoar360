const API_URL = 'https://zoar360.onrender.com'; 
let ROL_ACTIVO = null;
let CORREO_ACTIVO = null;
let NOMBRE_ACTIVO = null;

function cambiarPestaña(id) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.sidebar .tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelector(`.tab-btn[data-tab="${id}"]`).classList.add('active');

    if (id === 'asistencia') cargarAsistencia();
    if (id === 'membresia') cargarMiembros();
    if (id === 'solicitudes') cargarSolicitudes();
}

async function iniciarSesion(e) {
    e.preventDefault();
    const email = document.getElementById("l_email").value;
    const pass = document.getElementById("l_pass").value;
    try {
        const res = await fetch(`${API_URL}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pass }) });
        const data = await res.json();
        if (res.ok) {
            ROL_ACTIVO = data.rol; CORREO_ACTIVO = data.email; NOMBRE_ACTIVO = data.nombre;
            document.getElementById("pantallaLogin").style.display = "none";
            document.getElementById("appPrincipal").style.display = "block";
            document.getElementById('nombreUsuarioHeader').textContent = NOMBRE_ACTIVO;
            document.getElementById('correoUsuarioDropdown').textContent = CORREO_ACTIVO;
            
            // === REGLA DE ORO PARA SECRETARIOS DE GRUPO ===
            const esSecretarioGrupo = ROL_ACTIVO.startsWith('Secretario_') && ROL_ACTIVO !== 'Secretario_General';
            
            if (esSecretarioGrupo) {
                // Si es secretario de grupo: OCULTAR TODO y dejar solo Asistencia
                document.getElementById('btnMembresia').style.display = 'none';
                document.getElementById('btnEventos').style.display = 'none';
                document.getElementById('btnFinanzas').style.display = 'none';
                document.getElementById('btnSolicitudes').style.display = 'none';
                document.getElementById('btnPrivilegios').style.display = 'none';
                document.getElementById('btnSantaCena').style.display = 'none';
                
                // Redirigir automáticamente a la pestaña de asistencia
                cambiarPestaña('asistencia'); 
            } else {
                // Si es Admin, Pastor o Secretario General, mostrar todo
                cambiarPestaña('membresia');
            }
        } else alert("❌ " + data.error);
    } catch (err) {
        // Este error sale si el servidor Python no está encendido
        alert("❌ Error de conexión con el servidor. ¿Olvidaste ejecutar 'python3 app.py' en la terminal?");
    }
}

// ==================== MIEMBROS (Solo Admin/Pastor) ====================
async function cargarMiembros() {
    const res = await fetch(`${API_URL}/api/miembros`);
    if(!res.ok) {
        document.getElementById("tablaMiembros").innerHTML = "<tr><td colspan='6'>Acceso denegado o servidor caído</td></tr>";
        return;
    }
    const lista = await res.json();
    let html = "";
    lista.forEach(m => {
        let grupos = m.grupo ? m.grupo.split(',').map(g => g.trim()) : ['General'];
        let iniciales = grupos.map(g => g.charAt(0).toUpperCase()).join('/'); 
        html += `<tr>
            <td><strong>${m.codigo}</strong></td>
            <td>${m.nombre}</td>
            <td>${m.telefono || '---'}</td>
            <td><span class="badge badge-propiedad">${m.tipo}</span></td>
            <td>${grupos.join(', ')} <span style="font-size:0.8rem;color:#64748b;">(${iniciales})</span></td>
            <td><button class="btn-accion aprobar" onclick="abrirModalEliminar('${m.codigo}')"><i class="fa-solid fa-trash"></i></button></td>
        </tr>`;
    });
    document.getElementById("tablaMiembros").innerHTML = html;
}

// ==================== SOLICITUDES (Admin/Pastor) ====================
async function cargarSolicitudes() {
    const res = await fetch(`${API_URL}/api/solicitudes`);
    if(res.status === 403) return;
    const lista = await res.json();
    let html = "";
    lista.forEach(s => {
        html += `<tr><td>${s.nombre}</td><td>${s.telefono}</td><td>${s.tipo}</td><td><span class="badge badge-pendiente">${s.estado}</span></td><td>${s.solicitante_email}</td>
            <td><button class="btn-accion aprobar" onclick="procesarSolicitud(${s.id}, 'aprobar')"><i class="fa-solid fa-check"></i></button>
            <button class="btn-accion rechazar" onclick="procesarSolicitud(${s.id}, 'rechazar')"><i class="fa-solid fa-xmark"></i></button></td></tr>`;
    });
    document.getElementById("tablaSolicitudes").innerHTML = html;
}
async function procesarSolicitud(id, accion) {
    await fetch(`${API_URL}/api/solicitudes/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({accion: accion}) });
    cargarSolicitudes(); cargarMiembros();
}

// ==================== ASISTENCIA (La vista principal de los Secretarios de Grupo) ====================
async function cargarAsistencia() {
    const dia = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][new Date().getDay()];
    let grupo = '';
    if(dia === 'Jueves') grupo = 'Fraternidad';
    else if(dia === 'Sábado') grupo = 'Embajadores';
    else if(dia === 'Domingo') grupo = 'General';
    
    document.getElementById('diaActual').textContent = dia;
    document.getElementById('grupoActual').textContent = `Grupo: ${grupo}`;
    
    if(!grupo) {
        document.getElementById("tablaAsistencia").innerHTML = "<tr><td colspan='5'>Hoy no hay culto de grupo.</td></tr>";
        return;
    }

    const res = await fetch(`${API_URL}/api/asistencia/grupo/${grupo}`);
    if(!res.ok) {
        document.getElementById("tablaAsistencia").innerHTML = "<tr><td colspan='5'>Error cargando datos.</td></tr>";
        return;
    }
    const lista = await res.json();
    let html = "";
    if(lista.length === 0) {
        html = "<tr><td colspan='5'>No hay miembros registrados en este grupo.</td></tr>";
    } else {
        lista.forEach(m => {
            html += `<tr>
                <td><strong>${m.codigo}</strong></td>
                <td>${m.nombre}</td>
                <td>${m.grupo}</td>
                <td><input type="checkbox" class="asistencia-check" data-id="${m.id}" style="width:17px;height:17px;accent-color:#2563eb;" /></td>
                <td><strong style="color: #2563eb;">${m.total_asistencias}</strong></td>
            </tr>`;
        });
    }
    document.getElementById("tablaAsistencia").innerHTML = html;
}

async function guardarAsistencia() {
    const checks = document.querySelectorAll('.asistencia-check:checked');
    if(checks.length === 0) {
        alert("No seleccionaste ningún miembro.");
        return;
    }
    let contador = 0;
    for (const check of checks) {
        const codigo = check.closest('tr').querySelector('td:first-child').innerText.trim();
        const res = await fetch(`${API_URL}/api/marcar-asistencia`, { 
            method: 'POST', headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({codigo: codigo})
        });
        if(res.ok) contador++;
        else {
            const data = await res.json();
            alert(`Error en ${codigo}: ${data.error}`);
        }
    }
    if(contador > 0) {
        alert(`✅ ${contador} asistencias marcadas exitosamente.`);
        cargarAsistencia(); // Recargamos la tabla para actualizar el total
    }
}

function abrirModalSolicitudAsistencia() {
    document.getElementById('modalMiembro').classList.add('activo');
    document.getElementById('formMiembroModal').reset();
    document.getElementById('c_det_modal').style.display = 'none';
}

async function enviarSolicitudDesdeAsistencia(e) {
    e.preventDefault();
    const datos = {
        nombre: document.getElementById("m_nombre_modal").value,
        telefono: document.getElementById("m_telefono_modal").value || null,
        tipo: document.getElementById("m_tipo_modal").value,
        grupo: (document.getElementById("g_varones_modal").checked ? 'Fraternidad' : '') + 
               (document.getElementById("g_exploradores_modal").checked ? (', Exploradores' ).replace(/^, /, '') : '') +
               (document.getElementById("g_embajadores_modal").checked ? (', Embajadores' ).replace(/^, /, '') : '')
    };
    const res = await fetch(`${API_URL}/api/solicitudes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) });
    if(res.ok) {
        alert("✅ Solicitud enviada al Pastor/Admin para revisión.");
        cerrarModalMiembro();
    }
}

// ==================== UTILIDADES ====================
function cerrarSesion() { location.reload(); }
function cerrarModalMiembro() { document.getElementById('modalMiembro').classList.remove('activo'); }
function abrirModalEliminar(codigo) {
    document.getElementById('e_codigo_eliminar').value = codigo;
    document.getElementById('modalEliminar').classList.add('activo');
}
async function confirmarEliminar() {
    const res = await fetch(`${API_URL}/api/miembros/${document.getElementById('e_codigo_eliminar').value}`, { method: 'DELETE', headers: {'Content-Type':'application/json'}, body: JSON.stringify({password: document.getElementById('e_password_eliminar').value})});
    if(res.ok){ alert("Eliminado con éxito"); cerrarModalEliminar(); cargarMiembros(); } else { const data = await res.json(); alert("❌ " + data.error); }
}
function cerrarModalEliminar() { document.getElementById('modalEliminar').classList.remove('activo'); }

document.addEventListener("DOMContentLoaded", () => {
    const hoy = new Date().toISOString().split('T')[0];
    document.querySelectorAll('input[type="date"]').forEach(i => i.value = hoy);
    setTimeout(() => document.getElementById("pantallaBienvenida").style.display = "none", 2500);
});