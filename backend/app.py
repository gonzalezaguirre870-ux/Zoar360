from flask import Flask, request, jsonify, session
from flask_cors import CORS
import sqlite3
import datetime
import os

app = Flask(__name__)
CORS(app)
app.secret_key = 'clave_super_secreta_para_sesiones'

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'database', 'iglesia.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# ==================== VALIDACIÓN DE PERMISOS ====================
def es_admin_o_pastor(rol): return rol in ['Administrador', 'Pastor']
def es_secretario_general(rol): return rol == 'Secretario_General'
def es_secretario_de_grupo(rol): return rol.startswith('Secretario_') and rol != 'Secretario_General'

def validar_permiso(seccion, rol):
    if seccion == 'finanzas': return es_admin_o_pastor(rol) or es_secretario_general(rol)
    if seccion == 'solicitudes_panel': return es_admin_o_pastor(rol)
    if seccion == 'santacena': return es_admin_o_pastor(rol) or es_secretario_general(rol)
    if seccion == 'membresia': return es_admin_o_pastor(rol) # Solo Admin/Pastor ven la lista grande
    if seccion == 'asistencia': return True
    return True

# ==================== LOGIN ====================
@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    user = get_db().execute("SELECT * FROM usuarios WHERE email = ? AND password_hash = ?", (data['email'], data['password'])).fetchone()
    if user:
        session.update({'user_id': user['id'], 'user_rol': user['rol'], 'user_email': user['email']})
        return jsonify({"message": "Login exitoso", "rol": user['rol'], "email": user['email'], "nombre": user['nombre']}), 200
    return jsonify({"error": "Credenciales incorrectas"}), 401

# ==================== MIEMBROS (Solo Admin/Pastor) ====================
@app.route('/api/miembros', methods=['GET'])
def obtener_miembros():
    if not validar_permiso('membresia', session.get('user_rol')):
        return jsonify({"error": "Acceso denegado"}), 403
    conn = get_db()
    miembros = conn.execute("SELECT * FROM miembros ORDER BY codigo ASC").fetchall()
    conn.close()
    return jsonify([dict(m) for m in miembros])

@app.route('/api/miembros', methods=['POST'])
def crear_miembro():
    if not validar_permiso('membresia', session.get('user_rol')):
        return jsonify({"error": "Acción denegada. Solo Pastor/Administrador pueden registrar."}), 403
    data = request.json
    conn = get_db()
    ultimo = conn.execute("SELECT MAX(codigo) as max FROM miembros").fetchone()
    nuevo_codigo = f"{(int(ultimo['max']) + 1) if ultimo and ultimo['max'] else 1:04d}"
    nombre_completo = data['nombre'] + (f" ({data['detalleCargo']})" if data.get('tieneCargo') and data.get('detalleCargo') else "")
    conn.execute("INSERT INTO miembros (codigo, nombre, telefono, tipo, grupo) VALUES (?, ?, ?, ?, ?)", 
                 (nuevo_codigo, nombre_completo, data.get('telefono'), data['tipo'], data.get('grupo', 'General')))
    conn.commit()
    conn.close()
    return jsonify({"message": "Miembro creado", "codigo": nuevo_codigo}), 201

@app.route('/api/miembros/<codigo>', methods=['DELETE'])
def eliminar_miembro(codigo):
    data = request.json
    conn = get_db()
    user = conn.execute("SELECT * FROM usuarios WHERE (rol='Administrador' OR rol='Pastor') AND password_hash=?", (data['password'],)).fetchone()
    if not user:
        conn.close()
        return jsonify({"error": "Contraseña incorrecta. Solo Pastor/Admin pueden eliminar."}), 403
    conn.execute("DELETE FROM miembros WHERE codigo = ?", (codigo,))
    todos = conn.execute("SELECT id, codigo FROM miembros ORDER BY id ASC").fetchall()
    for index, row in enumerate(todos):
        nuevo_cod = f"{index + 1:04d}"
        if row['codigo'] != nuevo_cod:
            conn.execute("UPDATE miembros SET codigo = ? WHERE id = ?", (nuevo_cod, row['id']))
    conn.commit()
    conn.close()
    return jsonify({"message": "Miembro eliminado y códigos reordenados"}), 200

# ==================== SOLICITUDES (Secretarios envián, Admin/Pastor aceptan) ====================
@app.route('/api/solicitudes', methods=['GET'])
def obtener_solicitudes():
    if not validar_permiso('solicitudes_panel', session.get('user_rol')):
        return jsonify({"error": "Acceso denegado. Solo Pastor/Admin."}), 403
    conn = get_db()
    solicitudes = conn.execute("SELECT * FROM solicitudes WHERE estado = 'Pendiente'").fetchall()
    conn.close()
    return jsonify([dict(s) for s in solicitudes])

@app.route('/api/solicitudes', methods=['POST'])
def crear_solicitud():
    data = request.json
    conn = get_db()
    conn.execute("INSERT INTO solicitudes (nombre, telefono, tipo, grupo, solicitante_email, fecha_solicitud) VALUES (?, ?, ?, ?, ?, ?)", 
                 (data['nombre'], data.get('telefono'), data['tipo'], data.get('grupo'), session.get('user_email'), datetime.datetime.now().strftime('%Y-%m-%d')))
    conn.commit()
    conn.close()
    return jsonify({"message": "Solicitud enviada a revisión"}), 201

@app.route('/api/solicitudes/<int:id>', methods=['PUT'])
def procesar_solicitud(id):
    if not validar_permiso('solicitudes_panel', session.get('user_rol')):
        return jsonify({"error": "Acceso denegado"}), 403
    data = request.json
    conn = get_db()
    solicitud = conn.execute("SELECT * FROM solicitudes WHERE id = ?", (id,)).fetchone()
    if data['accion'] == 'aprobar':
        ultimo = conn.execute("SELECT MAX(codigo) as max FROM miembros").fetchone()
        nuevo_codigo = f"{(int(ultimo['max']) + 1) if ultimo and ultimo['max'] else 1:04d}"
        conn.execute("INSERT INTO miembros (codigo, nombre, telefono, tipo, grupo) VALUES (?, ?, ?, ?, ?)", 
                     (nuevo_codigo, solicitud['nombre'], solicitud['telefono'], solicitud['tipo'], solicitud['grupo']))
        conn.execute("UPDATE solicitudes SET estado = 'Aprobada' WHERE id = ?", (id,))
    else:
        conn.execute("UPDATE solicitudes SET estado = 'Rechazada' WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Solicitud procesada"}), 200

# ==================== ASISTENCIA (Para Secretarios de Grupo) ====================
@app.route('/api/asistencia/grupo/<grupo>', methods=['GET'])
def obtener_asistencia_grupo(grupo):
    conn = get_db()
    # Obtenemos los miembros del grupo
    miembros = conn.execute("SELECT * FROM miembros WHERE grupo LIKE ?", (f'%{grupo}%',)).fetchall()
    
    # Calculamos el total de asistencias de cada uno
    resultado = []
    for m in miembros:
        total = conn.execute("SELECT COUNT(*) as total FROM asistencias WHERE miembro_id = ?", (m['id'],)).fetchone()
        m_dict = dict(m)
        m_dict['total_asistencias'] = total['total']
        resultado.append(m_dict)
    conn.close()
    return jsonify(resultado)

@app.route('/api/marcar-asistencia', methods=['POST'])
def marcar_asistencia():
    if 'user_id' not in session: return jsonify({"error": "No autorizado"}), 401
    data = request.json
    ahora = datetime.datetime.now()
    conn = get_db()
    miembro = conn.execute("SELECT * FROM miembros WHERE codigo = ?", (data['codigo'],)).fetchone()
    if not miembro: return jsonify({"error": "Miembro no encontrado"}), 404

    dia = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'][ahora.weekday()]
    usuario_rol = session.get('user_rol')
    error = None

    # Lógica específica por día y rol (Solo Jueves y Sábado para grupos, Domingo General)
    if dia == 'Jueves':
        if not (datetime.time(17,45) <= ahora.time() <= datetime.time(19,0)): error = "Fuera de horario (5:45PM - 7PM)"
        elif usuario_rol != 'Secretario_Fraternidad_de_Varones': error = "Solo el Secretario de Fraternidad."
        elif 'Fraternidad' not in miembro['grupo']: error = "Este miembro no es de Fraternidad."
    elif dia == 'Sábado':
        if ahora.day not in [1,8,15,22,29]: error = "Hoy no es día de Embajadores"
        elif usuario_rol != 'Secretaria_Embajadores_de_Cristo': error = "Solo la Secretaria de Embajadores."
        elif 'Embajadores' not in miembro['grupo']: error = "Este miembro no es de Embajadores."
    elif dia == 'Domingo' and usuario_rol not in ['Administrador', 'Pastor', 'Secretario_General']:
        error = "El domingo es general, solo Pastor, Admin o Gral. pueden marcar."

    if error:
        conn.close()
        return jsonify({"error": error}), 403

    # Guardar asistencia
    conn.execute("INSERT INTO asistencias (miembro_id, fecha, hora) VALUES (?, ?, ?)", 
                 (miembro['id'], ahora.strftime('%Y-%m-%d'), ahora.strftime('%H:%M:%S')))
    conn.commit()
    conn.close()
    return jsonify({"message": "Asistencia marcada", "fecha": str(ahora)}), 200

# ==================== SANTA CENA ====================
@app.route('/api/santacena', methods=['POST'])
def registrar_santa_cena():
    if not validar_permiso('santacena', session.get('user_rol')):
        return jsonify({"error": "Acceso denegado"}), 403
    data = request.json
    conn = get_db()
    conn.execute("INSERT OR REPLACE INTO santacena (miembro_id, fecha, asistio) VALUES (?, ?, ?)", 
                 (data['miembro_id'], data['fecha'], 1 if data['asistio'] else 0))
    conn.commit()
    conn.close()
    return jsonify({"message": "Registro guardado"}), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)