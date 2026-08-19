from flask import Flask, request, jsonify, session
from flask_cors import CORS
import datetime
import os
import time
from supabase import create_client, Client

# mypy: ignore-errors

app = Flask(__name__)

# --- CONFIGURACIÓN CORS ---
CORS(app, supports_credentials=True, origins=[
    "http://127.0.0.1:3000", "http://localhost:3000",
    "http://127.0.0.1:5000", "http://localhost:5000",
    "https://gonzalezaguirre870-ux.github.io"
])

app.secret_key = 'clave_super_secreta_para_sesiones_iglesia_zoar'
app.config['SESSION_COOKIE_SAMESITE'] = 'None'
app.config['SESSION_COOKIE_SECURE'] = True

# =========================================================
# CONEXIÓN A SUPABASE
# =========================================================
SUPABASE_URL = "https://noxdmoxlytpsmkyclpna.supabase.co"
SUPABASE_KEY = "sb_publishable_wvWGLVcc3TtyAh3YT5Fuvw_Id1M4q4P"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# =========================================================
# MAPEO DE MINISTERIOS
# =========================================================
MAPEO_MINISTERIOS = {
    "cmf@iglesiazoarsv.org": {"grupo": "Concilio Misionero Femenil", "dia": 1, "msg": "los martes de 5:45 PM a 7:00 PM"},
    "misioneritas@iglesiazoarsv.org": {"grupo": "Misioneritas", "dia": 2, "msg": "los miércoles de 5:45 PM a 7:00 PM"},
    "fraternidad@iglesiazoarsv.org": {"grupo": "Fraternidad de Varones", "dia": 3, "msg": "los jueves de 5:45 PM a 7:00 PM"},
    "exploradores@iglesiazoarsv.org": {"grupo": "Exploradores del Rey", "dia": 4, "msg": "los viernes de 5:45 PM a 7:00 PM"},
    "embajadores@iglesiazoarsv.org": {"grupo": "Embajadores de Cristo", "dia": 5, "msg": "los sábados de 5:45 PM a 7:00 PM"},
    "secretariageneral@iglesiazoarsv.org": {"grupo": "Culto General", "dia": 6, "msg": "los domingos de 2:45 PM a 4:00 PM"}
}

# --- DICCIONARIO DE INTENTOS FALLIDOS (MEMORIA LOCAL) ---
intentos_fallidos = {}

# ==================== LOGIN CON DEPURACIÓN ====================
@app.route('/api/login', methods=['POST'])
def login():
    data = request.json or {}
    email = data.get('email', '').strip()
    password = data.get('password', '').strip()
    ahora = time.time()

    # Bloqueo por intentos
    if email in intentos_fallidos:
        intentos, tiempo_bloqueo = intentos_fallidos[email]
        if intentos >= 3:
            if ahora < tiempo_bloqueo:
                return jsonify({"error": f"Demasiados intentos erróneos. Espera {int(tiempo_bloqueo - ahora)} segundos."}), 429
            else:
                del intentos_fallidos[email]

    try:
        password_limpia = password.strip()
        print(f"Intentando login con email: {email} y tabla: usuario") # <--- Línea de depuración

        # CORRECCIÓN CRUCIAL: Usar el nombre de tu tabla real 'usuario'
        response = supabase.table('usuario').select('*').eq('email', email).eq('password_hash', password_limpia).execute()
        
        if response.data and len(response.data) > 0:
            user = dict(response.data[0]) # type: ignore
            
            if email in intentos_fallidos: del intentos_fallidos[email]
            
            session.clear()
            session['user_id'] = user['id']  # type: ignore
            session['user_rol'] = user['rol'] # type: ignore
            session['user_email'] = user['email'] # type: ignore
            return jsonify({"message": "Login exitoso", "rol": user['rol'], "email": user['email']}), 200 # type: ignore
        else:
            if email in intentos_fallidos:
                intentos_fallidos[email][0] += 1
            else:
                intentos_fallidos[email] = [1, 0]
            
            if intentos_fallidos[email][0] >= 3:
                intentos_fallidos[email][1] = ahora + 60
                return jsonify({"error": "Demasiados intentos erróneos. Cuenta bloqueada por 60 segundos."}), 429
            
            return jsonify({"error": "Credenciales incorrectas"}), 401
            
    except Exception as e:
        # ESTO IMPRIMIRÁ EL ERROR REAL EN LOS LOGS DE RENDER
        print(f"!!! ERROR FATAL EN LOGIN: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Error interno del servidor: {str(e)}"}), 500

# ==================== MIEMBROS ====================
@app.route('/api/miembros', methods=['GET'])
def obtener_miembros():
    try:
        response = supabase.table('miembros').select('*').order('codigo').execute()
        return jsonify(response.data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/miembros/<codigo>', methods=['GET'])
def obtener_miembro_por_codigo(codigo):
    try:
        response = supabase.table('miembros').select('*').eq('codigo', codigo).execute()
        if response.data and len(response.data) > 0:
            return jsonify(dict(response.data[0])) # type: ignore
        return jsonify({"error": "El código ingresado no pertenece a ningún miembro"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/miembros', methods=['POST'])
def crear_miembro():
    if session.get('user_rol') not in ['Administrador', 'Pastor']: 
        return jsonify({"error": "Acción denegada."}), 403
    
    data = request.json or {}
    nombre = data.get('nombre', '').strip()
    if not nombre: return jsonify({"error": "El nombre es obligatorio."}), 400

    try:
        last = supabase.table('miembros').select('codigo').order('codigo', desc=True).limit(1).execute()
        if last.data and len(last.data) > 0 and last.data[0]['codigo']: # type: ignore
            ultimo_num = int(last.data[0]['codigo']) # type: ignore
            nuevo_codigo = f"{ultimo_num + 1:04d}"
        else:
            nuevo_codigo = "0001"

        liderazgo = data.get('liderazgo', '').strip() if data.get('tipo') == 'Propiedad' else ""
        nombre_final = nombre + (f" ({liderazgo})" if liderazgo else "")
        
        nuevo_miembro = {
            "codigo": nuevo_codigo,
            "nombre": nombre_final,
            "telefono": data.get('telefono'),
            "tipo": data.get('tipo'),
            "grupo": data.get('grupo', 'Culto General'),
            "total_asistencias": 0
        }
        
        supabase.table('miembros').insert(nuevo_miembro).execute()
        
        supabase.table('notificaciones_sistema').insert({
            "usuario_correo": session.get('user_email'),
            "accion": f"Miembro creado: {nombre}",
            "detalles": f"Código: {nuevo_codigo}"
        }).execute()
        
        return jsonify({"message": "Miembro creado", "codigo": nuevo_codigo}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/miembros/<codigo>', methods=['DELETE'])
def eliminar_miembro(codigo):
    if session.get('user_rol') not in ['Administrador', 'Pastor']: 
        return jsonify({"error": "Acceso denegado."}), 403

    try:
        check = supabase.table('miembros').select('*').eq('codigo', codigo).execute()
        if not check.data or len(check.data) == 0:
            return jsonify({"error": "El código ingresado no pertenece a ningún miembro"}), 404
        
        supabase.table('miembros').delete().eq('codigo', codigo).execute()
        
        todos = supabase.table('miembros').select('id').order('id').execute()
        for index, row in enumerate(todos.data):
            nuevo_cod = f"{index + 1:04d}"
            supabase.table('miembros').update({"codigo": nuevo_cod}).eq('id', row['id']).execute() # type: ignore
            
        supabase.table('notificaciones_sistema').insert({
            "usuario_correo": session.get('user_email'),
            "accion": "Miembro eliminado",
            "detalles": f"Código: {codigo}"
        }).execute()
        
        return jsonify({"message": "Miembro eliminado y códigos reordenados"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/miembros/<codigo>', methods=['PUT'])
def actualizar_miembro(codigo):
    if session.get('user_rol') not in ['Administrador', 'Pastor']: 
        return jsonify({"error": "Acceso denegado."}), 403
    
    data = request.json or {}
    nombre = data.get('nombre', '').strip()
    
    try:
        liderazgo = data.get('liderazgo', '').strip() if data.get('tipo') == 'Propiedad' else ""
        nombre_final = nombre + (f" ({liderazgo})" if liderazgo else "")
        
        update_data = {
            "nombre": nombre_final,
            "telefono": data.get('telefono'),
            "tipo": data.get('tipo'),
            "grupo": data.get('grupo', 'Culto General')
        }
        
        supabase.table('miembros').update(update_data).eq('codigo', codigo).execute()
        
        supabase.table('notificaciones_sistema').insert({
            "usuario_correo": session.get('user_email'),
            "accion": "Miembro actualizado",
            "detalles": f"Código: {codigo}"
        }).execute()
        
        return jsonify({"message": "Información actualizada"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ==================== SOLICITUDES ====================
@app.route('/api/solicitudes', methods=['POST'])
def crear_solicitud():
    data = request.json or {}
    nombre = data.get('nombre', '').strip()
    if not nombre: return jsonify({"error": "El nombre es obligatorio."}), 400

    try:
        liderazgo = data.get('liderazgo', '').strip() if data.get('tipo') == 'Propiedad' else ""
        nombre_final = nombre + (f" ({liderazgo})" if liderazgo else "")
        email_solicitante = session.get('user_email', 'Secretaría')
        
        nueva_solicitud = {
            "nombre": nombre_final,
            "telefono": data.get('telefono'),
            "tipo": data.get('tipo'),
            "grupo": data.get('grupo'),
            "solicitante_email": email_solicitante,
            "fecha_solicitud": datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
        }
        
        supabase.table('solicitudes').insert(nueva_solicitud).execute()
        
        supabase.table('notificaciones_sistema').insert({
            "usuario_correo": email_solicitante,
            "accion": "Nueva solicitud de ingreso",
            "detalles": f"Nombre: {nombre}, Grupo: {data.get('grupo')}"
        }).execute()
        
        return jsonify({"message": "Solicitud enviada"}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/solicitudes', methods=['GET'])
def obtener_solicitudes():
    if session.get('user_rol') not in ['Administrador', 'Pastor']: return jsonify([])
    try:
        response = supabase.table('solicitudes').select('*').eq('estado', 'Pendiente').order('id', desc=True).execute()
        return jsonify(response.data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/solicitudes/<int:id>', methods=['PUT'])
def procesar_solicitud(id):
    if session.get('user_rol') not in ['Administrador', 'Pastor']: 
        return jsonify({"error": "Acceso denegado"}), 403
    
    data = request.json or {}
    estado = data.get('estado')
    
    try:
        sol = supabase.table('solicitudes').select('*').eq('id', id).execute()
        if not sol.data or len(sol.data) == 0:
            return jsonify({"error": "Solicitud no encontrada"}), 404
        
        if estado == 'Aprobada':
            last = supabase.table('miembros').select('codigo').order('codigo', desc=True).limit(1).execute()
            if last.data and len(last.data) > 0 and last.data[0]['codigo']: # type: ignore
                ultimo_num = int(last.data[0]['codigo']) # type: ignore
                nuevo_codigo = f"{ultimo_num + 1:04d}"
            else:
                nuevo_codigo = "0001"
            
            nuevo_miembro = {
                "codigo": nuevo_codigo,
                "nombre": sol.data[0]['nombre'], # type: ignore
                "telefono": sol.data[0]['telefono'], # type: ignore
                "tipo": sol.data[0]['tipo'], # type: ignore
                "grupo": sol.data[0]['grupo'] # type: ignore
            }
            supabase.table('miembros').insert(nuevo_miembro).execute()
        
        supabase.table('solicitudes').update({"estado": estado}).eq('id', id).execute()
        
        return jsonify({"message": "Solicitud procesada"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ==================== ASISTENCIA ====================
@app.route('/api/marcar-asistencia', methods=['POST'])
def marcar_asistencia():
    if 'user_id' not in session: 
        return jsonify({"error": "No autorizado. Inicie sesión nuevamente."}), 401
    
    data = request.json or {}
    codigos = data.get('codigos', [])
    email_activo = session.get('user_email', '')
    
    ahora = datetime.datetime.now()
    dia_semana = ahora.weekday()
    hora_minutos = ahora.hour * 60 + ahora.minute
    inicio_semana, fin_semana = (17 * 60 + 45), (19 * 60 + 0)
    inicio_domingo, fin_domingo = (14 * 60 + 45), (16 * 60 + 0)
    
    if dia_semana == 0:
        return jsonify({"error": "Error: Los días lunes no se encuentra programado ningún culto."}), 403
    
    config_horaria = MAPEO_MINISTERIOS.get(email_activo)
    if config_horaria:
        req_dia = config_horaria['dia']
        req_msg = config_horaria['msg']
        es_dom = (req_dia == 6)
        r_ini, r_fin = (inicio_domingo, fin_domingo) if es_dom else (inicio_semana, fin_semana)
        if dia_semana != req_dia or hora_minutos < r_ini or hora_minutos > r_fin:
            return jsonify({"error": f"Error: El registro de asistencia para este grupo solo está habilitado {req_msg}."}), 403
    
    if not codigos: 
        return jsonify({"error": "Selecciona al menos un miembro para guardar."}), 400
    
    try:
        fecha_hoy = ahora.strftime('%Y-%m-%d')
        hora_hoy = ahora.strftime('%H:%M:%S')
        nombres_asistentes = []
        
        for codigo in codigos:
            miembro = supabase.table('miembros').select('*').eq('codigo', codigo).execute()
            if miembro.data and len(miembro.data) > 0:
                m = miembro.data[0]
                supabase.table('asistencias').insert({
                    "miembro_id": m['id'], # type: ignore
                    "fecha": fecha_hoy,
                    "hora": hora_hoy,
                    "grupo_asistido": config_horaria['grupo'] if config_horaria else 'General'
                }).execute()
                
                nuevo_total = (m.get('total_asistencias') or 0) + 1 # type: ignore
                supabase.table('miembros').update({"total_asistencias": nuevo_total}).eq('id', m['id']).execute() # type: ignore
                nombres_asistentes.append(m['nombre']) # type: ignore
        
        if nombres_asistentes:
            supabase.table('notificaciones_sistema').insert({
                "usuario_correo": email_activo,
                "accion": "Asistencia Guardada",
                "detalles": f"Asistieron: {', '.join(nombres_asistentes)} | IP: {request.remote_addr}"
            }).execute()
        
        return jsonify({"message": "Asistencia guardada"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ==================== OTROS ENDPOINTS ====================
@app.route('/api/asistencia/grupo/<path:grupo>', methods=['GET'])
def obtener_asistencia_grupo(grupo):
    try:
        grupo_limpio = grupo.replace('_', ' ').strip()
        response = supabase.table('miembros').select('*').order('nombre').execute()
        filtrados = [m for m in response.data if grupo_limpio in (m.get('grupo') or '')] # type: ignore
        return jsonify(filtrados)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/santacena', methods=['POST'])
def registrar_santa_cena():
    data = request.json or {}
    try:
        supabase.table('santacena').upsert({
            "miembro_id": data['miembro_id'],
            "fecha": data['fecha'],
            "asistio": 1 if data['asistio'] else 0
        }, on_conflict='miembro_id, fecha').execute()
        return jsonify({"message": "Registro guardado"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/auditoria', methods=['GET'])
def obtener_auditoria():
    if session.get('user_rol') not in ['Administrador', 'Pastor']: 
        return jsonify([])
    try:
        response = supabase.table('notificaciones_sistema').select('*').order('fecha_hora', desc=True).limit(50).execute()
        return jsonify(response.data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/verificar-admin', methods=['POST'])
def verificar_admin():
    data = request.json or {}
    password = data.get('password', '')
    try:
        response = supabase.table('usuario').select('*').eq('rol', 'Administrador').eq('password_hash', password).execute()
        if response.data and len(response.data) > 0:
            return jsonify({"message": "Acceso concedido"}), 200
        return jsonify({"error": "Clave de Administrador incorrecta"}), 401
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=True)