# Tracker Digestivo 🩺

Registro clínico de deposiciones: cronometra cada visita al baño, la clasifica según la
escala de Bristol y calcula medias diarias y mensuales para poder enseñárselas a un médico.

**Entrar: https://ltmrk.github.io/TrackerDigestivo/**

Funciona en el móvil y en el ordenador. No hay que instalar nada: es una página web que
guarda los datos en Supabase.

---

## Primer acceso

Los registros son privados y hace falta una cuenta para verlos.

1. Abre https://ltmrk.github.io/TrackerDigestivo/
2. Escribe tu correo y una contraseña de 6 caracteres o más.
3. Pulsa **Crear cuenta** la primera vez, o **Entrar** las siguientes.
4. Si te pide confirmar por correo, abre el enlace que te llegue y vuelve a entrar.

La sesión queda guardada en el navegador y se renueva sola, así que solo tienes que entrar
una vez por dispositivo. Si borras los datos del navegador o usas otro móvil, toca repetirlo.
Para cerrar sesión, el botón **🚪 Salir** de la barra inferior.

---

## Registrar una visita

Este es el uso normal, en el momento:

1. En **🏠 Inicio**, pulsa **Nueva Entrada al Baño**. Arranca un cronómetro en pantalla.
2. Al terminar, pulsa **Finalizar Entrada**.
3. Rellena la evaluación y pulsa **Guardar Registro**.

El cronómetro sobrevive a que cierres la pestaña o bloquees el móvil: al volver a abrir la
app sigue contando por donde iba. Si ya lo habías parado pero no guardaste, te devuelve
directamente al formulario. El botón **Descartar** tira esa entrada a medias y te devuelve
al inicio, por si arrancaste el cronómetro sin querer.

**Mi Resumen sigue visible mientras cronometras**, así que siempre puedes consultar las
medias sin tener que cerrar la entrada en curso.

### La evaluación

| Campo | Opciones |
|---|---|
| **Categoría** | Deposición completa · Solo gases · Intento fallido / Falsa alarma |
| **Escala Bristol** | Tipos 1 a 7 (solo aparece en «Deposición completa») |
| **¿Dolor?** | Sí / No |
| **¿Urgencia?** | Sí / No |
| **⚠️ ¿Sangre?** | Sí / No |

La escala de Bristol va del tipo 1 (bolitas duras separadas) al tipo 7 (diarrea líquida),
siendo el **tipo 4** (salchicha lisa y suave) el ideal. Del 1 al 2 indica estreñimiento;
del 5 al 7, tránsito acelerado.

Si marcas **Sangre**, la pantalla de inicio muestra un aviso rojo permanente mientras exista
algún registro con sangre. Es un dato para consultar con un médico, no una alarma automática.

---

## Mi Resumen

La pantalla de inicio calcula, sobre todos tus registros:

| Indicador | Qué mide |
|---|---|
| **T. Hoy** | Tiempo total en el baño hoy |
| **Veces Hoy** | Número de visitas hoy |
| **Media Veces/Día** | Visitas por día, de media histórica |
| **T. Medio/Día** | Tiempo total al día, de media |
| **T. Visita (Mes)** | Duración media por visita, últimos 30 días |
| **T. Visita (Total)** | Duración media por visita, histórico completo |
| **Gases Mes** | Registros de «Solo gases» en los últimos 30 días |
| **Dolor Mes** | Porcentaje de visitas con dolor, últimos 30 días |
| **Urgencia Mes** | Porcentaje de visitas con urgencia, últimos 30 días |

Debajo aparecen los tres tipos de Bristol más frecuentes, con su recuento.

Los cálculos se hacen en el navegador cada vez que abres la pestaña, sobre los datos
recién descargados.

---

## Para la consulta

Debajo del resumen hay un segundo bloque con los datos que suele pedir un digestivo,
calculados sobre los **últimos 30 días**. A diferencia del resumen de arriba, aquí solo
cuentan como deposición las de categoría «Deposición completa»: los gases y los intentos
fallidos se contabilizan aparte, porque incluirlos falsearía la frecuencia.

Arriba, una barra con el reparto de la **escala de Bristol** en tres tramos: duras (1-2),
normales (3-4) y blandas (5-7).

| Indicador | Por qué importa |
|---|---|
| **Deposiciones/día** | Frecuencia real, sin contar gases ni falsas alarmas |
| **Bristol medio** | Consistencia media; por debajo de 3 tira a estreñimiento, por encima de 4 a tránsito acelerado |
| **Días ≥3 dep.** | Cuántos días alcanzan el umbral habitual de diarrea |
| **Días sin dep.** | La cara opuesta: días sin ninguna deposición |
| **Racha sin dep.** | Días seguidos sin deposición, el dato de estreñimiento |
| **Nocturnas 0-6h** | Despertarse a defecar orienta a causa orgánica más que funcional |
| **Urgencia** | Porcentaje de deposiciones con urgencia |
| **Dolor** | Porcentaje con dolor |
| **Agrupadas <1h** | Deposiciones encadenadas: sugieren evacuación incompleta |
| **Visitas >15 min** | Tiempo prolongado, asociado a dificultad para evacuar |
| **Intentos fallidos** | Ir sin conseguir nada, equivalente a tenesmo |
| **Sangre (total)** | Episodios en todo el histórico y fecha del último |

Las casillas de **nocturnas** y **sangre** se ponen en rojo si hay algún caso.

El botón **Copiar informe** deja en el portapapeles un resumen en texto plano con todos
esos datos, listo para pegarlo en un correo o enseñarlo en la consulta. Si el navegador
no deja copiar, el texto aparece en un cuadro para seleccionarlo a mano.

Son recuentos de lo registrado, no una interpretación médica.

---

## Historial

En **📅 Historial** está la lista completa, ordenada por la fecha y la hora del propio
registro, de la más próxima a ahora hacia atrás, con la fecha,
las horas de inicio y fin, la duración, la categoría, el tipo y unas etiquetas de color
para dolor, urgencia, sangre y gases.

- **+ Registro Manual** — para añadir una visita que no cronometraste en su momento.
- **Modificar** — corrige cualquier campo de un registro.
- **Quitar** — lo borra, pidiendo confirmación.

En el formulario, **hora de fin y duración se calculan solas**: escribe la duración y se
ajusta la hora de fin, o cambia las horas y se recalcula la duración. La fecha va en
formato `DD/MM/YYYY`.

---

## Rellenar el historial en bloque

Para reconstruir días sueltos o rangos largos sin ir uno a uno, hay dos herramientas que
**imitan tu propio patrón**: leen lo que ya tienes registrado y calculan tus horas
habituales, tus duraciones, tu media de visitas por día y tus tasas de dolor y urgencia.

### Desde el navegador

**https://ltmrk.github.io/TrackerDigestivo/generador.html**

Entra con la misma cuenta y sigue los tres pasos: leer la base de datos, generar la
propuesta y revisarla, insertar. Enseña una vista previa completa con estadísticas
comparadas frente a tu histórico, y **no escribe nada hasta que confirmas**. También
permite descargar el SQL en lugar de insertar.

Es configurable: rango de fechas, entradas por día, minutos totales de baño al día,
franja y duración de la primera entrada del día, y el reparto de tipos de Bristol.

### Desde la terminal

```bash
node scripts/generar-entradas.mjs                 # simula y enseña la propuesta
node scripts/generar-entradas.mjs --insert        # inserta de verdad
```

Opciones principales:

| Opción | Efecto |
|---|---|
| `--desde=` / `--hasta=` | Rango de fechas (`YYYY-MM-DD`) |
| `--por-dia=4-6` | Entradas por día |
| `--minutos-dia=90-120` | Minutos totales de baño al día |
| `--franja=06:45-07:10` | Franja de la primera entrada del día |
| `--dur1=27-33` | Duración en minutos de esa primera entrada |
| `--mezcla=80/15/4/1` | % tipo 5 / tipo 6 / tipo 4 / solo gases |
| `--completar` | Añade entradas también a días que ya tienen registros |
| `--seed=N` | Semilla, para repetir el mismo resultado |
| `--sql=archivo.sql` | Vuelca los INSERT a un archivo |

Antes de escribir, el script **verifica la propuesta contra el resultado combinado** (lo
guardado más lo nuevo): entradas por día y minutos diarios dentro del rango, ninguna
mezcla de tipo 4 con tipo 6 el mismo día, ningún solape de horarios y ningún día pisado.
Si algo falla, aborta sin insertar.

Nunca borra ni modifica lo que ya está guardado: solo añade.

---

## Cómo se guardan los datos

Supabase (PostgreSQL), tabla `tracker_digestivo`:

| Columna | Contenido |
|---|---|
| `id` | uuid, automático |
| `user_id` | Dueño del registro, automático |
| `day` | Fecha, texto `D/M/YYYY` |
| `start_time`, `end_time` | Horas, texto `HH:MM` |
| `duration` | Texto `Xm Ys` |
| `category` | Deposición completa · Solo gases · Intento fallido / Falsa alarma |
| `type` | Texto del tipo de Bristol, o `No aplica` |
| `pain`, `urgency`, `blood` | `Sí` / `No` |
| `created_at` | Momento de creación, automático |

Las migraciones están en `supabase/migrations/`.

### Privacidad

La tabla tiene **RLS activado** con políticas que restringen lectura, inserción,
modificación y borrado a `user_id = auth.uid()`. La clave anónima viaja en el HTML público,
pero sin una sesión iniciada no da acceso a ninguna fila: cada cuenta ve exclusivamente
sus propios registros.

---

## Estructura del repositorio

```
index.html                      La aplicación
generador.html                  Generador de entradas, desde el navegador
scripts/generar-entradas.mjs    Generador de entradas, desde la terminal
supabase/migrations/            Esquema y políticas de seguridad
```

Todo el frontend es un único archivo HTML sin dependencias más allá del cliente de
Supabase, servido por GitHub Pages desde la rama `main`. Cualquier cambio en `main` se
publica solo en un par de minutos.

---

## Aviso

Esto es una herramienta de registro personal, no un dispositivo médico ni una ayuda al
diagnóstico. Sangre en las heces, dolor persistente o un cambio brusco y sostenido del
patrón intestinal merecen una consulta médica, con independencia de lo que digan estas
estadísticas.
