const API = 'https://zoar360.onrender.com';
let rol = null;

const $ = id => document.getElementById(id);
const ocultar = id => $(id).style.display = 'none';

const cambiarPestaña = id => {
    document.querySelectorAll('.tab-content, .sidebar .tab-btn').forEach(el => el.classList.remove('active'));
    $(id).classList.add('active');
    document.querySelector(`.tab-btn[data-tab="${id}"]`).classList.add('active');
    if(id === 'asistencia') cargarAsistencia();
    if(id === 'membresia') cargarMiembros();
};

async function iniciarSesion(e) {
    e.preventDefault();
    try {
        const res = await fetch(`${API}/api/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:$('l_email').value, password:$('l_pass').value}) });
        const data = await res.json();
        if(!res.ok) return alert('❌ ' + data.error);
        
        rol = data.rol;
        $('pantallaLogin').style.display = 'none';
        $('appPrincipal').style.display = 'block';
        $('nombreUsuarioHeader').textContent = rol;
        $('correoUsuarioDropdown').textContent = data.email;

        if(rol.startsWith('Secretario_') && rol !== 'Secretario_General') {
            document.querySelectorAll('.sidebar .tab-btn').forEach(b => { if(b.textContent.trim() !== 'Cerrar Sesión') b.style.display='none'; });
            cambiarPestaña('asistencia');
        } else {
            cambiarPestaña('membresia');
        }
    } catch { alert('Error de conexión con Render.'); }
}

// ========== MIEMBROS ==========
async function cargarMiembros() {
    const res = await fetch(`${API}/api/miembros`);
    const lista = await res.json();
    $('tablaMiembros').innerHTML = lista.map(m => 
        `<tr><td><strong>${m.codigo}</strong></td><td>${m.nombre}</td><td>${m.telefono||'---'}</td><td><span class="badge badge-propiedad">${m.tipo}</span></td><td>${m.grupo}</td></tr>`
    ).join('') || "<tr><td colspan='5'>Sin miembros</td></tr>";
}

async function guardarMiembro(e) {
    e.preventDefault();
    const datos = {
        nombre: $('m_nombre_modal').value,
        telefono: $('m_telefono_modal').value || null,
        tipo: $('m_tipo_modal').value,
        grupo: $('g_varones_modal').checked ? 'Fraternidad' : 'General'
    };
    const res = await fetch(`${API}/api/miembros`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(datos) });
    if(res.ok) { alert('Miembro Agregado'); cerrarModal(); cargarMiembros(); } else alert('Error');
}

// ========== ASISTENCIA (Con reloj) ==========
async function cargarAsistencia() {
    const dia = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][new Date().getDay()];
    let grupo = dia === 'Jueves' ? 'Fraternidad' : dia === 'Sábado' ? 'Embajadores' : '';
    $('diaActual').textContent = dia;
    $('grupoActual').textContent = grupo ? `Grupo: ${grupo}` : '';
    if(!grupo) return $('tablaAsistencia').innerHTML = "<tr><td colspan='4'>Hoy no hay culto.</td></tr>";
    
    const res = await fetch(`${API}/api/asistencia/grupo/${grupo}`);
    const lista = await res.json();
    $('tablaAsistencia').innerHTML = lista.map(m => 
        `<tr><td>${m.codigo}</td><td>${m.nombre}</td><td><input type="checkbox" class="asistencia-check" data-id="${m.id}" /></td><td><strong>${m.total_asistencias}</strong></td></tr>`
    ).join('');
}

async function guardarAsistencia() {
    const checks = document.querySelectorAll('.asistencia-check:checked');
    if(!checks.length) return alert('Selecciona al menos un miembro.');
    
    // VERIFICACIÓN DE RELOJ (Hora de El Salvador - UTC-6)
    const ahora = new Date();
    const horaLocal = ahora.getHours();
    const minutosLocal = ahora.getMinutes();
    const diaLocal = ahora.getDay(); // 4 = Jueves

    // Si hoy es Jueves, solo permitir entre 5:45 PM (17:45) y 7:00 PM (19:00)
    if(diaLocal === 4) {
        if(horaLocal < 17 || (horaLocal === 17 && minutosLocal < 45) || horaLocal >= 19) {
            return alert('⛔ Fuera de horario. La asistencia de Jueves solo se permite de 5:45 PM a 7:00 PM.');
        }
    }

    for (const check of checks) {
        const codigo = check.closest('tr').querySelector('td:first-child').innerText.trim();
        await fetch(`${API}/api/marcar-asistencia`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({codigo}) });
    }
    alert('✅ Asistencias guardadas.');
    cargarAsistencia();
}

// ========== UTILIDADES ==========
const cerrarSesion = () => location.reload();
const abrirModal = () => $('modalMiembro').classList.add('activo');
const cerrarModal = () => $('modalMiembro').classList.remove('activo');

document.addEventListener("DOMContentLoaded", () => {
    const hoy = new Date().toISOString().split('T')[0];
    document.querySelectorAll('input[type="date"]').forEach(i => i.value = hoy);
    setTimeout(() => $('pantallaBienvenida').style.display = "none", 2500);
});