import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'database', 'iglesia.db')

def ensure_column():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    try:
        cur.execute("PRAGMA table_info(notificaciones_sistema)")
        cols = [r[1] for r in cur.fetchall()]
        if 'detalles' in cols:
            print('La columna detalles ya existe en notificaciones_sistema.')
        else:
            print('Agregando columna detalles a notificaciones_sistema...')
            cur.execute("ALTER TABLE notificaciones_sistema ADD COLUMN detalles TEXT")
            conn.commit()
            print('Columna agregada.')
    except sqlite3.OperationalError:
        print('La tabla notificaciones_sistema no existe; creando tabla completa...')
        cur.execute("CREATE TABLE IF NOT EXISTS notificaciones_sistema (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_correo TEXT, accion TEXT, detalles TEXT, fecha_hora TEXT DEFAULT CURRENT_TIMESTAMP)")
        conn.commit()
        print('Tabla creada con columna detalles.')
    finally:
        conn.close()

if __name__ == '__main__':
    ensure_column()
