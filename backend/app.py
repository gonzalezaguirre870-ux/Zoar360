from flask import Flask, request, jsonify, session
import re
from flask_cors import CORS
import sqlite3
import datetime
import os
import time

app = Flask(__name__)

# CORS dinámico y robusto que acepta las credenciales tanto en tu MacBook local como en GitHub Pages con Render
CORS(app, supports_credentials=True, origins=[
    "http://127.0.0.1:3000", "http://localhost:3000",
    "http://127.0.0.1:5500", "http://localhost:5500",
    "http://127.0.0.1:5000", "http://localhost:5000",
    "https://github.io",
    "https://gonzalezaguirre870-ux.github.io"
])

app.secret_key = 'clave_super_secreta_para_sesiones_iglesia_zoar'
app.config['SESSION_COOKIE_SAMESITE'] = 'None'
app.config['SESSION_COOKIE_SECURE'] = True
app.config['SESSION_COOKIE_HTTPONLY'] = True

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'database', 'iglesia.db')

def get_db():
    # Añadimos timeout y check_same_thread para reducir errores 'database is locked'
    conn = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        # Habilitar claves foráneas y WAL para concurrencia mejorada
        conn.execute('PRAGMA foreign_keys = ON')
        conn.execute('PRAGMA journal_mode = WAL')
    except Exception:
        pass
    return conn


def execute_with_retry(conn, sql, params=(), retries=5, delay=0.05):
    """Ejecuta una sentencia con reintentos exponenciales si la base de datos está bloqueada."""
    for attempt in range(retries):
        try:
            return conn.execute(sql, params)
        except sqlite3.OperationalError as e:
            msg = str(e).lower()
            if 'locked' in msg or 'database is locked' in msg:
                if attempt < retries - 1:
                    time.sleep(delay * (2 ** attempt))
                    continue
            raise

def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT, email TEXT UNIQUE, password_hash TEXT, rol TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS miembros (
            id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT UNIQUE,
            nombre TEXT, telefono TEXT, tipo TEXT, grupo TEXT, total_asistencias INTEGER DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS solicitudes (
            id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT, telefono TEXT,
            tipo TEXT, grupo TEXT, solicitante_email TEXT, estado TEXT DEFAULT 'Pendiente', fecha_solicitud TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS asistencias (
            id INTEGER PRIMARY KEY AUTOINCREMENT, miembro_id INTEGER,
            fecha TEXT, hora TEXT, grupo_asistido TEXT, FOREIGN KEY(miembro_id) REFERENCES miembros(id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS santacena (
            id INTEGER PRIMARY KEY AUTOINCREMENT, miembro_id INTEGER,
            fecha TEXT, asistio INTEGER, FOREIGN KEY(miembro_id) REFERENCES miembros(id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS notificaciones_sistema (
            id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_correo TEXT,
            accion TEXT, detalles TEXT, fecha_hora TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()

init_db()

intentos_fallidos = {}

MAPEO_MINISTERIOS = {
    "cmf@iglesiazoarsv.org": {"grupo": "Concilio Misionero Femenil", "dia": 1, "msg": "los martes de 5:45 PM a 7:00 PM"},
    "misioneritas@iglesiazoarsv.org": {"grupo": "Misioneritas", "dia": 2, "msg": "los miércoles de 5:45 PM a 7:00 PM"},
    "fraternidad@iglesiazoarsv.org": {"grupo": "Fraternidad de Varones", "dia": 3, "msg": "los jueves de 5:45 PM a 7:00 PM"},
    "exploradores@iglesiazoarsv.org": {"grupo": "Exploradores del Rey", "dia": 4, "msg": "los viernes de 5:45 PM a 7:00 PM"},
    "embajadores@iglesiazoarsv.org": {"grupo": "Embajadores de Cristo", "dia": 5, "msg": "los sábados de 5:45 PM a 7:00 PM"},
    "secretariageneral@iglesiazoarsv.org": {"grupo": "Culto General", "dia": 6, "msg": "los domingos de 2:45 PM a 4:00 PM"}
}

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json or {}
    email = data.get('email', '').strip()
    password = data.get('password', '').strip()
    ahora = time.time()

    if email in intentos_fallidos:
        intentos, tiempo_bloqueo = intentos_fallidos[email]
        if intentos >= 3:
            if ahora < tiempo_bloqueo:
                return jsonify({"error": f"<i class='fa-solid fa-hourglass-key'></i> Demasiados intentos erróneos. Espera {int(tiempo_bloqueo - ahora)} segundos para recuperar token."}), 429
            else:
                del intentos_fallidos[email]

    conn = get_db()
    user = conn.execute("SELECT * FROM usuarios WHERE email = ? AND password_hash = ?", (email, password)).fetchone()
    conn.close()

    if user:
        if email in intentos_fallidos: del intentos_fallidos[email]
        session.clear()
        session['user_id'] = user['id']
        session['user_rol'] = user['rol']
        session['user_email'] = user['email']
        return jsonify({"message": "Login exitoso", "rol": user['rol'], "email": user['email']}), 200
    else:
        if email in intentos_fallidos:
            intentos_fallidos[email][0] += 1
        else:
            intentos_fallidos[email] = [1, 0]
        
        if intentos_fallidos[email][0] >= 3:
            intentos_fallidos[email][1] = ahora + 60
            return jsonify({"error": "<i class='fa-solid fa-user-lock'></i> Demasiados intentos erróneos. Cuenta bloqueada por 60 segundos."}), 429
        
        return jsonify({"error": "Credenciales incorrectas"}), 401

@app.route('/api/miembros', methods=['GET'])
def obtener_miembros():
    conn = get_db()
    miembros = conn.execute("SELECT * FROM miembros ORDER BY codigo ASC").fetchall()
    conn.close()
    return jsonify([dict(m) for m in miembros])

@app.route('/api/miembros/<codigo>', methods=['GET'])
def obtener_miembro_por_codigo(codigo):
    conn = get_db()
    miembro = conn.execute("SELECT * FROM miembros WHERE codigo = ?", (codigo,)).fetchone()
    conn.close()
    if miembro: return jsonify(dict(miembro))
    return jsonify({"error": "El código ingresado no pertenece a ningún miembro"}), 404

@app.route('/api/miembros', methods=['POST'])
def crear_miembro():
    if session.get('user_rol') not in ['Administrador', 'Pastor']: return jsonify({"error": "Acción denegada."}), 403
    data = request.json or {}
    nombre = data.get('nombre', '').strip()
    if not nombre: return jsonify({"error": "El nombre es obligatorio."}), 400

    u_id, u_rol, u_email = session.get('user_id'), session.get('user_rol'), session.get('user_email')
    conn = get_db()
    ultimo = conn.execute("SELECT MAX(CAST(codigo AS INTEGER)) as max FROM miembros").fetchone()
    nuevo_codigo = f"{(ultimo['max'] + 1) if ultimo and ultimo['max'] is not None else 1:04d}"
    
    liderazgo = data.get('liderazgo', '').strip() if data.get('tipo') == 'Propiedad' else None
    # eliminar sufijos anteriores entre paréntesis para evitar duplicados
    nombre_clean = re.sub(r"\s*\(.*\)\s*$", "", nombre)
    nombre_final = nombre_clean + (f" ({liderazgo})" if liderazgo else "")
    
    execute_with_retry(conn, "INSERT INTO miembros (codigo, nombre, telefono, tipo, grupo) VALUES (?, ?, ?, ?, ?)", 
                 (nuevo_codigo, nombre_final, data.get('telefono'), data.get('tipo'), data.get('grupo', 'Culto General')))
    execute_with_retry(conn, "INSERT INTO notificaciones_sistema (usuario_correo, accion, detalles) VALUES (?, ?, ?)", 
                 (u_email, f"Miembro creado: {nombre}", f"Código: {nuevo_codigo}"))
    conn.commit()
    conn.close()
    
    session['user_id'], session['user_rol'], session['user_email'] = u_id, u_rol, u_email
    return jsonify({"message": "Miembro creado", "codigo": nuevo_codigo}), 201

@app.route('/api/miembros/<codigo>', methods=['DELETE'])
def eliminar_miembro(codigo):
    if session.get('user_rol') not in ['Administrador', 'Pastor']: return jsonify({"error": "Acceso denegado."}), 403
    
    # RESPALDO SEGURO DE VARIABLES DE SESIÓN (Previene cierres de sesión automáticos tras reindexación)
    u_id, u_rol, u_email = session.get('user_id'), session.get('user_rol'), session.get('user_email')
    
    conn = get_db()
    miembro = conn.execute("SELECT * FROM miembros WHERE codigo = ?", (codigo,)).fetchone()
    if not miembro:
        conn.close()
        return jsonify({"error": "El código ingresado no pertenece a ningún miembro"}), 404
    
    execute_with_retry(conn, "DELETE FROM miembros WHERE codigo = ?", (codigo,))
    conn.commit()
    
    todos = conn.execute("SELECT id FROM miembros ORDER BY id ASC").fetchall()
    for index, row in enumerate(todos):
        nuevo_cod = f"{index + 1:04d}"
        execute_with_retry(conn, "UPDATE miembros SET codigo = ? WHERE id = ?", (nuevo_cod, row['id']))
        
    execute_with_retry(conn, "INSERT INTO notificaciones_sistema (usuario_correo, accion, detalles) VALUES (?, ?, ?)", 
                 (u_email, f"Miembro eliminado", f"Código: {codigo}"))
    conn.commit()
    conn.close()
    
    # Re-inyección forzada del estado de la sesión en Flask
    session['user_id'] = u_id
    session['user_rol'] = u_rol
    session['user_email'] = u_email
    return jsonify({"message": "Miembro eliminado y códigos reordenados"}), 200

@app.route('/api/miembros/<codigo>', methods=['PUT'])
def actualizar_miembro(codigo):
    if session.get('user_rol') not in ['Administrador', 'Pastor']: return jsonify({"error": "Acceso denegado."}), 403
    data = request.json or {}
    nombre = data.get('nombre', '').strip()
    
    u_id, u_rol, u_email = session.get('user_id'), session.get('user_rol'), session.get('user_email')
    conn = get_db()
    
    liderazgo = data.get('liderazgo', '').strip() if data.get('tipo') == 'Propiedad' else None
    nombre_clean = re.sub(r"\s*\(.*\)\s*$", "", nombre)
    nombre_final = nombre_clean + (f" ({liderazgo})" if liderazgo else "")
    
    execute_with_retry(conn, "UPDATE miembros SET nombre = ?, telefono = ?, tipo = ?, grupo = ? WHERE codigo = ?", 
                 (nombre_final, data.get('telefono'), data.get('tipo'), data.get('grupo', 'Culto General'), codigo))
    execute_with_retry(conn, "INSERT INTO notificaciones_sistema (usuario_correo, accion, detalles) VALUES (?, ?, ?)", 
                 (u_email, f"Miembro actualizado", f"Código: {codigo}"))
    conn.commit()
    conn.close()
    
    session['user_id'] = u_id
    session['user_rol'] = u_rol
    session['user_email'] = u_email
    return jsonify({"message": "Información actualizada"}), 200

@app.route('/api/solicitudes', methods=['POST'])
def crear_solicitud():
    data = request.json or {}
    nombre = data.get('nombre', '').strip()
    if not nombre:
        return jsonify({"error": "El nombre es obligatorio."}), 400

    conn = get_db()
    liderazgo = data.get('liderazgo', '').strip() if data.get('tipo') == 'Propiedad' else None
    nombre_final = nombre + (f" ({liderazgo})" if liderazgo else "")
    email_solicitante = session.get('user_email', 'Secretaría')

    try:
        conn.execute("INSERT INTO solicitudes (nombre, telefono, tipo, grupo, solicitante_email, fecha_solicitud) VALUES (?, ?, ?, ?, ?, ?)",
                     (nombre_final, data.get('telefono'), data.get('tipo'), data.get('grupo'), email_solicitante, datetime.datetime.now().strftime('%Y-%m-%d %H:%M')))
        conn.execute("INSERT INTO notificaciones_sistema (usuario_correo, accion, detalles) VALUES (?, ?, ?)",
                     (email_solicitante, f"Nueva solicitud de ingreso", f"Nombre: {nombre}, Grupo: {data.get('grupo')}"))
        conn.commit()
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        conn.close()
        return jsonify({"error": str(e)}), 500
    finally:
        try:
            conn.close()
        except Exception:
            pass

    return jsonify({"message": "Solicitud enviada"}), 201

@app.route('/api/solicitudes', methods=['GET'])
def obtener_solicitudes():
    if session.get('user_rol') not in ['Administrador', 'Pastor']: return jsonify([])
    conn = get_db()
    solicitudes = conn.execute("SELECT * FROM solicitudes WHERE estado = 'Pendiente' ORDER BY id DESC").fetchall()
    conn.close()
    return jsonify([dict(s) for s in solicitudes])

@app.route('/api/solicitudes/<int:id>', methods=['PUT'])
def procesar_solicitud(id):
    if session.get('user_rol') not in ['Administrador', 'Pastor']: return jsonify({"error": "Acceso denegado"}), 403
    data = request.json or {}
    estado = data.get('estado')
    conn = get_db()
    sol = conn.execute("SELECT * FROM solicitudes WHERE id = ?", (id,)).fetchone()
    if estado == 'Aprobada':
        ultimo = conn.execute("SELECT MAX(CAST(codigo AS INTEGER)) as max FROM miembros").fetchone()
        nuevo_codigo = f"{(ultimo['max'] + 1) if ultimo and ultimo['max'] is not None else 1:04d}"
        execute_with_retry(conn, "INSERT INTO miembros (codigo, nombre, telefono, tipo, grupo) VALUES (?, ?, ?, ?, ?)",
                     (nuevo_codigo, sol['nombre'], sol['telefono'], sol['tipo'], sol['grupo']))
    execute_with_retry(conn, "UPDATE solicitudes SET estado = ? WHERE id = ?", (estado, id))
    conn.commit()
    conn.close()
    return jsonify({"message": "Solicitud procesada"}), 200

@app.route('/api/asistencia/grupo/<path:grupo>', methods=['GET'])
def obtener_asistencia_grupo(grupo):
    grupo_limpio = grupo.replace('_', ' ').strip()
    conn = get_db()
    # Normalizar separadores y buscar coincidencia por token exacto
    miembros = conn.execute("SELECT * FROM miembros WHERE ',' || REPLACE(COALESCE(grupo, ''), ', ', ',') || ',' LIKE ? ORDER BY nombre ASC", (f"%,{grupo_limpio},%",)).fetchall()
    conn.close()
    return jsonify([dict(m) for m in miembros])


@app.route('/api/miembros/ministerio', methods=['GET'])
def obtener_miembros_por_ministerio():
    # Devuelve sólo los miembros que pertenecen al ministerio asociado al correo de sesión
    email = session.get('user_email')
    if not email:
        return jsonify({"grupo": None, "miembros": []})
    config = MAPEO_MINISTERIOS.get(email)
    if not config:
        return jsonify({"grupo": None, "miembros": []})
    grupo_req = config['grupo']
    conn = get_db()
    miembros = conn.execute("SELECT * FROM miembros WHERE ',' || REPLACE(COALESCE(grupo, ''), ', ', ',') || ',' LIKE ? ORDER BY nombre ASC", (f"%,{grupo_req},%",)).fetchall()
    conn.close()
    return jsonify({"grupo": grupo_req, "miembros": [dict(m) for m in miembros]})

@app.route('/api/marcar-asistencia', methods=['POST'])
def marcar_asistencia():
    if 'user_id' not in session: return jsonify({"error": "No autorizado. Inicie sesión nuevamente."}), 401
    data = request.json or {}
    codigos = data.get('codigos', [])
    email_activo = session.get('user_email', '')
    ahora = datetime.datetime.now()
    dia_semana = ahora.weekday() # 0=Lunes... 6=Domingo
    hora_minutos = ahora.hour * 60 + ahora.minute
    inicio_semana, fin_semana = (17 * 60 + 45), (19 * 60 + 0)
    inicio_domingo, fin_domingo = (14 * 60 + 45), (16 * 60 + 0)
    if dia_semana == 0:
        return jsonify({"error": " Error: Los días lunes no se encuentra programado ningún culto."}), 403
    config_horaria = MAPEO_MINISTERIOS.get(email_activo)
    if config_horaria:
        req_dia = config_horaria['dia']
        req_msg = config_horaria['msg']
        es_dom = (req_dia == 6)
        r_ini, r_fin = (inicio_domingo, fin_domingo) if es_dom else (inicio_semana, fin_semana)
        if dia_semana != req_dia or hora_minutos < r_ini or hora_minutos > r_fin:
            return jsonify({"error": f" Error: El registro de asistencia para este grupo solo está habilitado {req_msg}."}), 403
    if not codigos: return jsonify({"error": "Selecciona al menos un miembro para guardar."}), 400
    conn = get_db()
    fecha_hoy, hora_hoy = ahora.strftime('%Y-%m-%d'), ahora.strftime('%H:%M:%S')
    nombres_asistentes = []
    for codigo in codigos:
        miembro = conn.execute("SELECT * FROM miembros WHERE codigo = ?", (codigo,)).fetchone()
        if miembro:
            execute_with_retry(conn, "INSERT INTO asistencias (miembro_id, fecha, hora, grupo_asistido) VALUES (?, ?, ?, ?)",
                         (miembro['id'], fecha_hoy, hora_hoy, config_horaria['grupo'] if config_horaria else 'General'))
            execute_with_retry(conn, "UPDATE miembros SET total_asistencias = total_asistencias + 1 WHERE id = ?", (miembro['id'],))
            nombres_asistentes.append(miembro['nombre'])
    if nombres_asistentes:
        conn.execute("INSERT INTO notificaciones_sistema (usuario_correo, accion, detalles) VALUES (?, ?, ?)",
                     (email_activo, f"Asistencia Guardada", f"Asistieron: {', '.join(nombres_asistentes)} | IP: {request.remote_addr}"))
    conn.commit()
    conn.close()
    return jsonify({"message": "Asistencia guardada"}), 200

@app.route('/api/santacena', methods=['POST'])
def registrar_santa_cena():
    data = request.json or {}
    conn = get_db()
    execute_with_retry(conn, "INSERT OR REPLACE INTO santacena (miembro_id, fecha, asistio) VALUES (?, ?, ?)",
                 (data['miembro_id'], data['fecha'], 1 if data['asistio'] else 0))
    conn.commit()
    conn.close()
    return jsonify({"message": "Registro guardado"}), 200

@app.route('/api/auditoria', methods=['GET'])
def obtener_auditoria():
    if session.get('user_rol') not in ['Administrador', 'Pastor']: return jsonify([])
    conn = get_db()
    notis = conn.execute("SELECT * FROM notificaciones_sistema ORDER BY fecha_hora DESC LIMIT 50").fetchall()
    conn.close()
    return jsonify([dict(n) for n in notis])

@app.route('/api/verificar-admin', methods=['POST'])
def verificar_admin():
    data = request.json or {}
    password = data.get('password', '')
    conn = get_db()
    user = conn.execute("SELECT * FROM usuarios WHERE rol='Administrador' AND password_hash=?", (password,)).fetchone()
    conn.close()
    if user: return jsonify({"message": "Acceso concedido"}), 200
    return jsonify({"error": "Clave de Administrador incorrecta"}), 401

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=True)