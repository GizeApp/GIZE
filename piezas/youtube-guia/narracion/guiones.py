"""Guiones de narración (voz en off) para las dos guías de YouTube, sincronizados con cada
explicación en pantalla. Arma, por video, un .md para leer y un .srt para usar de teleprompter.

Cada línea se ancla al inicio de un texto en pantalla (o al inicio de la sección) y dura hasta
la siguiente. Los tiempos salen de guia.py, así que si se vuelve a renderizar, se regeneran solos:
    python3 narracion/guiones.py
"""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
MAX_WPS = 2.8          # palabras por segundo: por encima de esto no llega a decirlo tranquilo

# por sección: lista de (índice del texto en pantalla que la ancla, lo que dice). -1 = inicio de la sección
G = {
 'usuarios': {
  'Introducción': [(-1, 'Esta es la guía de GIZE, el plan gratuito, función por función.')],
  'Plan gratuito': [(-1, 'Para entrenar por tu cuenta, sin coach y sin pagar nada. En iPhone y en Android.')],
  'Bienvenida': [(-1, 'La primera vez que entrás, GIZE te recibe.'), (1, '¿Tenés coach? Ponés su código.'),
                 (2, 'Si no, arrancás vacío o con rutina armada.')],
  'Armá tu semana': [(-1, '«Empezar vacío»: tu semana en tres pasos.'), (1, 'Cuántos días entrenás,'), (2, 'tu objetivo,'),
                     (3, 'y el nombre del primer día. Listo.')],
  'Rutinas armadas': [(-1, '¿No sabés qué hacer? Hay rutinas armadas.'), (1, 'Elegís para quién son,'),
                      (2, 'tocás una, y queda lista para entrenar.')],
  'Tu rutina': [(-1, 'Tu rutina viene organizada por días.'), (1, 'Cambiás de día con las pestañas de arriba.'),
                (2, 'Cada ejercicio trae series, repeticiones objetivo y RIR.')],
  'Entrenar': [(-1, '«Iniciar entrenamiento» arranca el reloj de la sesión.'), (1, 'Ves tu sesión anterior,'),
               (2, 'cargás esos pesos con un toque,'), (3, 'y anotás las repeticiones de cada serie.')],
  'Descanso': [(-1, 'Terminás la serie e iniciás el descanso.'), (1, 'La cuenta regresiva queda abajo,'),
               (2, 'y cada ejercicio tiene su propio tiempo.')],
  'Cambiar y agregar ejercicios': [(-1, '¿Máquina ocupada? Cambiás el ejercicio por uno parecido.'),
                                   (1, 'También agregás ejercicios, buscando por músculo,'), (2, 'o unís dos en una superserie.')],
  'Finalizar el entreno': [(-1, 'Al terminar, «Finalizar» guarda el entreno'),
                           (1, 'y te muestra el resumen: tiempo, ejercicios y series.')],
  'Progreso': [(-1, 'En Progreso tenés todo tu historial, por secciones.'), (1, 'Evolución de cargas: elegís un ejercicio'),
               (3, 'y ves cómo sube, sesión por sesión.')],
  'Peso corporal': [(-1, 'Peso corporal: anotás tu peso del día'), (1, 'y ves el gráfico con el promedio semanal.')],
  'Registro de hoy': [(-1, 'Registro de hoy: cómo dormiste, entrenaste y te sentís.'), (1, 'Menos de un minuto por día.')],
  'Check-in semanal': [(-1, 'El check-in semanal es un repaso corto:'), (1, 'entreno, descanso y comida.')],
  'Historial de entrenos': [(-1, 'En el historial está cada sesión guardada,'), (1, 'y si erraste una serie, la corregís.')],
  'Volumen semanal': [(-1, 'Volumen semanal: tus series por músculo,'), (1, 'para que ninguno quede atrás.')],
  'Tu meta de calorías': [(-1, 'Pasamos a Comida. Primero, tu meta.'), (1, 'Cargás tus datos, tu actividad y tu objetivo,'),
                          (2, 'y GIZE calcula calorías y macros.')],
  'Registrar comidas': [(-1, 'Cada día ves calorías, proteína, carbos y grasas.'), (1, 'Buscás entre alimentos y productos argentinos,'),
                        (2, 'crudo o cocido, y la porción,'), (3, 'y se suma solo al contador.')],
  'Escáner y alimentos propios': [(-1, 'También escaneás el código de barras'),
                                  (1, 'o creás tu propio alimento con su tabla nutricional.')],
  'Otros días': [(-1, 'Con las flechas mirás otros días'), (1, 'y volvés a hoy.')],
  'Agua': [(-1, 'El agua también se cuenta: sumás lo que tomás en el día.')],
  'Hábitos': [(-1, 'Hábitos es tu checklist de todos los días: las pequeñas cosas que suman.'), (1, 'Tildás lo que cumplís,'),
              (2, 'y al otro día arranca de nuevo.')],
  'Cardio': [(-1, 'Cardio: un cronómetro para tus sesiones.'), (1, 'Marcás vueltas o intervalos,'),
             (2, 'o usás el temporizador con cuenta regresiva.')],
  'Racha': [(-1, 'Tu racha cuenta los días seguidos que entrás.'), (1, 'Si cortás, vuelve a cero.')],
  'Ajustes': [(-1, 'En Ajustes: perfil, notificaciones y modo liviano.'), (1, 'Y si sumás un coach, ponés su código.')],
  'Cierre': [(-1, 'GIZE es gratis, en iPhone y en Android. ¿Entrenás con un coach? Pedile su código y vinculate.')],
 },
 'coach': {
  'Introducción': [(-1, 'Esta es la guía del panel del coach de GIZE, función por función.')],
  'Panel del coach': [(-1, 'Todo para guiar a tus alumnos. Y lo probás catorce días gratis, sin tarjeta.')],
  'Tu panel': [(-1, 'Tu panel: todos tus alumnos, con su mail.'),
               (1, 'Un globito te avisa quién escribió, y ves su última actividad.'), (3, 'Y buscás a cualquiera por nombre.')],
  'Código de invitación': [(-1, 'Tus alumnos se suman con tu código.'), (1, 'Lo copiás y lo mandás,'), (2, 'o lo cambiás por uno nuevo.')],
  'Tu plan': [(-1, '«Mi plan»: tu suscripción y tus alumnos.'), (1, 'El plan va según cuántos alumnos tengas.')],
  'Plantillas de rutinas': [(-1, 'Tus rutinas quedan guardadas como plantillas.'), (1, 'Las abrís y editás día por día,'),
                            (2, 'o creás nuevas e importás modelos armados.')],
  'La ficha del alumno': [(-1, 'Tocás un alumno y se abre su ficha,'), (1, 'con Ficha, Rutina y Plan alimenticio.')],
  'Chat con tu alumno': [(-1, 'Cada alumno tiene su chat: mensajes y audios.'), (1, 'Le respondés al toque,'),
                         (2, 'o le grabás un audio, y ves cuándo lo escuchó.')],
  'El chat del alumno': [(-1, 'Tu alumno lo tiene arriba; late si hay nuevos.'), (1, 'Y te escribe o te manda audios cuando quiera.')],
  'Datos y objetivos': [(-1, 'En la ficha: datos, lesiones y pasos.'), (1, 'Su contexto de entrenamiento,'),
                        (2, 'y sus objetivos, generales y del bloque.')],
  'Bloque / mesociclo': [(-1, 'El bloque: nombre, inicio, semanas y fase.'), (1, 'Estrategia calórica y una nota,'),
                         (2, 'marcás descargas, y el alumno ve su semana.')],
  'Seguimiento diario': [(-1, 'El seguimiento diario muestra cómo se sintió:'), (1, 'dolor, rendimiento, hambre, sueño y pasos.')],
  'Check-in semanal': [(-1, 'En el check-in semanal ves sus respuestas y su adherencia.')],
  'Historial de entrenos': [(-1, 'El historial muestra cada sesión que registró,'), (1, 'serie por serie, contra la vez pasada.')],
  'Volumen semanal': [(-1, 'Volumen semanal: series por grupo muscular,'), (1, 'para equilibrar la rutina de un vistazo.')],
  'Peso corporal': [(-1, 'Peso corporal: promedio semanal y variación,'), (1, 'y el registro día a día.')],
  'Armar la rutina': [(-1, 'En Rutina armás el entrenamiento de cada alumno.'), (1, 'Por días: con nombre, notas y el orden que quieras.'),
                      (2, 'Duplicás un día,'), (3, 'cada uno con sus ejercicios.')],
  'Series, video y voz': [(-1, 'Abrís un ejercicio y definís cada serie:'), (1, 'repeticiones, peso, RIR y descanso.'),
                          (2, 'Le dejás una nota y el video de técnica.'), (3, 'Y le grabás una explicación con tu voz.')],
  'Tu voz en su entreno': [(-1, 'Y la escucha ahí, en pleno entreno.')],
  'Progresión y superseries': [(-1, 'GIZE le sugiere el peso siguiente.'), (1, 'Armás superseries o cambiás ejercicios,'),
                               (2, 'guardás, y el alumno la ve al instante.')],
  'Rutinas programadas': [(-1, 'Podés dejar programada la próxima rutina, con fecha.'),
                          (1, 'Ese día le cambia sola; hasta entonces, sigue con la actual.')],
  'Plan alimenticio': [(-1, 'El plan alimenticio también va por secciones.'),
                       (1, 'Comidas con horario y macros, para días de entreno y de descanso.')],
  'Hidratación e indicaciones': [(-1, 'Hidratación: agua y sal por día.'), (1, 'Indicaciones: pautas generales y suplementos.')],
  'Personalización del menú': [(-1, 'En el menú dejás opciones para cada comida,'), (1, 'adicionales permitidos e intercambios.')],
  'Cardio y hábitos': [(-1, 'Le indicás el cardio y los hábitos de su checklist.'), (1, 'Guardás, y le aparece en su app.')],
  'Tus preguntas': [(-1, 'En Preguntas armás las tuyas,'), (1, 'para el día y el check-in,'), (2, 'con el tipo de respuesta y las opciones.')],
  'Configuración': [(-1, 'Y en Configuración, tu nombre y las notificaciones.')],
  'Cierre': [(-1, 'Probá el panel catorce días gratis, sin tarjeta. Tus alumnos usan la app gratis. Te esperamos en GIZE.')],
 },
}

DUMP = r'''
import sys, os, json
sys.path.insert(0, sys.argv[1]); sys.argv = ['x', '--capitulos']
import guia as G
out = []
for sg, st in zip(G.SEGS, G.STARTS):
    s = {'titulo': sg['title'], 'a': st / G.FPS, 'b': (st + sg['n']) / G.FPS, 'caps': []}
    if sg['kind'] == 'feat':
        marks = json.load(open(os.path.join(sg['dir'], 'times.json')))['marks']
        s['caps'] = [{'a': (st + c[0]) / G.FPS, 't': m['text']} for c, m in zip(sg['caps'], marks)]
    out.append(s)
print(json.dumps(out))
'''

def linea_tiempo(video):
    env = dict(os.environ, GUIA_VIDEO=video)
    r = subprocess.run([sys.executable, '-c', DUMP, os.path.dirname(HERE)], env=env, capture_output=True, text=True, check=True)
    return json.loads(r.stdout.strip().splitlines()[-1])

def ts(s): return f'{int(s // 60)}:{int(s % 60):02d}'
def tsd(s): return f'{int(s // 60)}:{s % 60:04.1f}'
def srt_t(s): return f'{int(s // 3600):02d}:{int(s % 3600 // 60):02d}:{int(s % 60):02d},{int(round(s % 1 * 1000)) % 1000:03d}'

def armar(video):
    tl, guion = linea_tiempo(video), G[video]
    lineas, alertas = [], []
    for s in tl:
        items = guion[s['titulo']]
        starts = [s['a'] if i < 0 else s['caps'][i]['a'] for i, _ in items]
        ends = starts[1:] + [s['b']]
        for (i, txt), a, b in zip(items, starts, ends):
            wps = len(txt.split()) / (b - a)
            if wps > MAX_WPS: alertas.append(f'{video} {ts(a)} {wps:.1f} pal/s: {txt}')
            lineas.append({'sec': s['titulo'], 'a': a, 'b': b, 'txt': txt,
                           'pantalla': s['caps'][max(i, 0)]['t'] if s['caps'] else '', 'wps': wps})
    return tl, lineas, alertas

TITULO = {'usuarios': 'Guía del plan gratuito (usuarios)', 'coach': 'Guía del panel del coach'}
def escribir(video, tl, lineas):
    total = tl[-1]['b']
    md = [f'# Narración · {TITULO[video]}', '',
          f'Video: `salida/gize-guia-{video}.mp4` ({ts(total)}). Voz en off en tono tranquilo y cercano, de «vos».',
          'Cada línea arranca en el tiempo indicado y tiene que terminar antes de la siguiente. Están medidas para decirlas',
          'sin apurarse (menos de ~2,8 palabras por segundo). Si se prefiere, el `.srt` de al lado se carga en el reproductor',
          '(VLC, QuickTime o el editor) y hace de teleprompter: el texto aparece justo cuando hay que decirlo.', '']
    sec = None
    for l in lineas:
        if l['sec'] != sec:
            sec = l['sec']; md += ['', f'## {sec}', '', '| Entra | Dura | Decir | En pantalla |', '|---|---|---|---|']
        md.append(f"| {tsd(l['a'])} | {l['b'] - l['a']:.1f} s | **{l['txt']}** | {l['pantalla']} |")
    md += ['', '## Texto corrido (para ensayar)', '']
    sec = None; par = []
    for l in lineas:
        if l['sec'] != sec and par: md.append(' '.join(par)); md.append(''); par = []
        sec = l['sec']; par.append(l['txt'])
    md.append(' '.join(par))
    open(os.path.join(HERE, f'narracion-{video}.md'), 'w').write('\n'.join(md) + '\n')
    srt = []
    for n, l in enumerate(lineas, 1):
        srt += [str(n), f"{srt_t(l['a'])} --> {srt_t(l['b'] - .05)}", l['txt'], '']
    open(os.path.join(HERE, f'narracion-{video}.srt'), 'w').write('\n'.join(srt))
    json.dump(lineas, open(os.path.join(HERE, f'narracion-{video}.json'), 'w'), ensure_ascii=False, indent=1)

if __name__ == '__main__':
    todas = []
    for v in ('usuarios', 'coach'):
        tl, lineas, al = armar(v); escribir(v, tl, lineas); todas += al
        print(v, len(lineas), 'líneas', ts(tl[-1]['b']), 'máx', f"{max(l['wps'] for l in lineas):.2f} pal/s")
    print('\n'.join(todas) or 'todas las líneas entran cómodas')
