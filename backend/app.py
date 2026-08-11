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

# ==================== LOGIN Y VALIDACIÓN ====================
@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    user = get_db().execute("SELECT * FROM usuarios WHERE email = ? AND password_hash = ?", (data['email'], data['password'])).fetchone()
    if user:
        session.update({'user_id': user['id'], 'user_rol': user['rol']})
        return jsonify({"message": "Login exitoso", "rol": user['rol'], "email": user['email']}), 200
    return jsonify({"error": "Credenciales incorrectas"}), 401

# ==================== MIEMBROS Y SOLICITUDES ====================
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
    return jsonify({"error": "Miembro no encontrado"}), 404

@app.route('/api/miembros', methods=['POST'])
def crear_miembro():
    if session.get('user_rol') not in ['Administrador', 'Pastor']:
        return jsonify({"error": "Solo Pastor o Admin registran."}), 403
    data = request.json
    conn = get_db()
    ultimo = conn.execute("SELECT MAX(codigo) as max FROM miembros").fetchone()
    nuevo_codigo = f"{(int(ultimo['max']) + 1) if ultimo and ultimo['max'] else 1:04d}"
    
    nombre_final = data['nombre'] + (f" ({data['liderazgo']})" if data.get('liderazgo') else "")
    conn.execute("INSERT INTO miembros (codigo, nombre, telefono, tipo, grupo) VALUES (?, ?, ?, ?, ?)", (nuevo_codigo, nombre_final, data.get('telefono'), data['tipo'], data.get('grupo', 'General')))
    conn.commit()
    conn.close()
    return jsonify({"message": "Miembro creado", "codigo": nuevo_codigo}), 201

@app.route('/api/miembros/<codigo>', methods=['DELETE'])
def eliminar_miembro(codigo):
    if session.get('user_rol') not in ['Administrador', 'Pastor']: return jsonify({"error": "Acceso denegado."}), 403
    conn = get_db()
    miembro = conn.execute("SELECT * FROM miembros WHERE codigo = ?", (codigo,)).fetchone()
    if not miembro: return jsonify({"error": "El código ingresado no pertenece a ningún miembro"}), 404
    conn.execute("DELETE FROM miembros WHERE codigo = ?", (codigo,))
    conn.commit()
    todos = conn.execute("SELECT id, codigo FROM miembros ORDER BY id ASC").fetchall()
    for index, row in enumerate(todos):
        nuevo_cod = f"{index + 1:04d}"
        if row['codigo'] != nuevo_cod:
            conn.execute("UPDATE miembros SET codigo = ? WHERE id = ?", (nuevo_cod, row['id']))
    conn.commit()
    conn.close()
    return jsonify({"message": "Miembro eliminado y códigos reordenados"}), 200

@app.route('/api/miembros/<codigo>', methods=['PUT'])
def actualizar_miembro(codigo):
    if session.get('user_rol') not in ['Administrador', 'Pastor']: return jsonify({"error": "Acceso denegado."}), 403
    data = request.json
    conn = get_db()
    nombre_final = data['nombre'] + (f" ({data['liderazgo']})" if data.get('liderazgo') else "")
    conn.execute("UPDATE miembros SET nombre = ?, telefono = ?, tipo = ?, grupo = ? WHERE codigo = ?", (nombre_final, data.get('telefono'), data['tipo'], data.get('grupo', 'General'), codigo))
    conn.commit()
    conn.close()
    return jsonify({"message": "Información actualizada"}), 200

@app.route('/api/solicitudes', methods=['POST'])
def crear_solicitud():
    data = request.json
    conn = get_db()
    nombre_final = data['nombre'] + (f" ({data['liderazgo']})" if data.get('liderazgo') else "")
    conn.execute("INSERT INTO solicitudes (nombre, telefono, tipo, grupo, solicitante_email, estado) VALUES (?, ?, ?, ?, ?, ?)", (nombre_final, data.get('telefono'), data['tipo'], data.get('grupo'), session.get('user_rol'), 'Pendiente'))
    conn.commit()
    # AUDITORÍA: Registro de solicitud
    conn.execute("INSERT INTO notificaciones_sistema (usuario_correo, accion) VALUES (?, ?)", (session.get('user_rol'), f"Envío una solicitud para registrar a {data['nombre']}"))
    conn.commit()
    conn.close()
    return jsonify({"message": "Solicitud enviada"}), 201

@app.route('/api/solicitudes', methods=['GET'])
def obtener_solicitudes():
    if session.get('user_rol') not in ['Administrador', 'Pastor']: return jsonify([])
    conn = get_db()
    solicitudes = conn.execute("SELECT * FROM solicitudes WHERE estado = 'Pendiente'").fetchall()
    conn.close()
    return jsonify([dict(s) for s in solicitudes])

@app.route('/api/solicitudes/<int:id>', methods=['PUT'])
def procesar_solicitud(id):
    if session.get('user_rol') not in ['Administrador', 'Pastor']: return jsonify({"error": "Acceso denegado"}), 403
    data = request.json
    conn = get_db()
    sol = conn.execute("SELECT * FROM solicitudes WHERE id = ?", (id,)).fetchone()
    if data['estado'] == 'Aprobada':
        ultimo = conn.execute("SELECT MAX(codigo) as max FROM miembros").fetchone()
        nuevo_codigo = f"{(int(ultimo['max']) + 1) if ultimo and ultimo['max'] else 1:04d}"
        conn.execute("INSERT INTO miembros (codigo, nombre, telefono, tipo, grupo) VALUES (?, ?, ?, ?, ?)", (nuevo_codigo, sol['nombre'], sol['telefono'], sol['tipo'], sol['grupo']))
    conn.execute("UPDATE solicitudes SET estado = ? WHERE id = ?", (data['estado'], id))
    conn.commit()
    conn.close()
    return jsonify({"message": "Solicitud procesada"}), 200

# ==================== ASISTENCIA Y AUDITORÍA ====================
@app.route('/api/asistencia/grupo/<grupo>', methods=['GET'])
def obtener_asistencia_grupo(grupo):
    conn = get_db()
    # Búsqueda exacta del ministerio en la cadena de la columna 'grupo' de SQLite
    miembros = conn.execute("SELECT * FROM miembros WHERE grupo LIKE ?", (f'%{grupo}%',)).fetchall()
    resultado = []
    for m in miembros:
        total = conn.execute("SELECT COUNT(*) as total FROM asistencias WHERE miembro_id = ?", (m['id'],)).fetchone()
        m_dict = dict(m)
        m_dict['total_asistencias'] = total['total'] if total else 0
        resultado.append(m_dict)
    conn.close()
    return jsonify(resultado)

@app.route('/api/marcar-asistencia', methods=['POST'])
def marcar_asistencia():
    if 'user_id' not in session: return jsonify({"error": "No autorizado"}), 401
    data = request.json
    miembro_codigo = data.get('codigo')
    
    # OBTENER LA HORA REAL DEL SERVIDOR (Render)
    ahora = datetime.datetime.now()
    fecha_actual = ahora.date()
    hora_actual = ahora.time()

    conn = get_db()
    miembro = conn.execute("SELECT * FROM miembros WHERE codigo = ?", (miembro_codigo,)).fetchone()
    if not miembro: return jsonify({"error": "Miembro no encontrado"}), 404

    dia_semana = ahora.weekday() # 0=Lun, 6=Dom
    usuario_rol = session.get('user_rol')
    grupo_miembro = miembro['grupo']
    
    # === LÓGICA ESTRICTA DE HORARIO POR SERVIDOR (UTC-6 para El Salvador) ===
    hora_local = (hora_actual.hour - 6) if (hora_actual.hour - 6) >= 0 else (hora_actual.hour + 18)
    min_local = hora_actual.minute

    # Reglas de días y horarios
    if dia_semana == 0: # Domingo (Santa Cena y Culto General)
        if not ((hora_local == 14 and min_local >= 45) or (hora_local == 15) or (hora_local == 16 and min_local == 0)):
            return jsonify({"error": "⛔ Fuera de horario. Domingos solo de 2:45 PM a 4:00 PM."}), 403
    elif dia_semana in [1, 2, 3, 4, 5, 6]: # Lunes a Sábado
        # Verificar si el día es válido para el grupo
        dias_validos = {'Martes':'Concilio Misionero Femenil','Miércoles':'Misioneritas','Jueves':'Fraternidad de Varones','Viernes':'Exploradores del Rey','Sábado':'Embajadores de Cristo'}
        dia_nombre = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'][dia_semana]
        
        if dia_semana == 1 or dia_nombre not in dias_validos:
            # Si es Lunes o un día sin grupo, bloqueamos
            return jsonify({"error": f"⛔ El registro de asistencia para este grupo solo está habilitado el día correspondiente."}), 403
        
        # Verificar horario de 5:45 PM a 7:00 PM
        if not ((hora_local == 17 and min_local >= 45) or (hora_local == 18) or (hora_local == 19 and min_local == 0)):
            # Mensaje de error personalizado con el día correcto
            return jsonify({"error": f"⛔ Fuera de horario. El registro para este grupo solo está habilitado los {dia_nombre} de 5:45 PM a 7:00 PM."}), 403

    # === PERSISTENCIA REAL DE DATOS ===
    conn.execute("INSERT INTO asistencias (miembro_id, fecha, hora) VALUES (?, ?, ?)", (miembro['id'], fecha_actual.strftime('%Y-%m-%d'), hora_actual.strftime('%H:%M:%S')))
    conn.commit()
    
    # AUDITORÍA: Registro de asistencia exitosa
    conn.execute("INSERT INTO notificaciones_sistema (usuario_correo, accion) VALUES (?, ?)", (session.get('user_rol'), f"El grupo {usuario_rol} envió la asistencia a las {hora_actual.strftime('%H:%M')} el día {fecha_actual.strftime('%A')}"))
    conn.commit()
    conn.close()

    return jsonify({"message": "Asistencia guardada exitosamente"}), 200

# ==================== SANTA CENA ====================
@app.route('/api/santacena', methods=['POST'])
def registrar_santa_cena():
    data = request.json
    conn = get_db()
    conn.execute("INSERT OR REPLACE INTO santacena (miembro_id, fecha, asistio) VALUES (?, ?, ?)", (data['miembro_id'], data['fecha'], 1 if data['asistio'] else 0))
    conn.commit()
    conn.close()
    return jsonify({"message": "Registro guardado"}), 200

# ==================== NOTIFICACIONES DE AUDITORÍA PARA ADMIN/PASTOR ====================
@app.route('/api/auditoria', methods=['GET'])
def obtener_auditoria():
    if session.get('user_rol') not in ['Administrador', 'Pastor']: return jsonify([])
    conn = get_db()
    notis = conn.execute("SELECT * FROM notificaciones_sistema ORDER BY fecha_hora DESC LIMIT 50").fetchall()
    conn.close()
    return jsonify([dict(n) for n in notis])

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)