# Requisitos — Simulador de Dejadas de Robot Paletizador

## 1. Propósito

Aplicación web de una sola página que simula y compara dos algoritmos de
paletizado para una celda de robot con 4 vías, en el escenario **PERFUMERÍA**.
Compara **2 VÍAS Estricto** vs **4 VÍAS** y muestra resultados, métricas por
vía y una reproducción 3D del movimiento del robot.

## 2. Stack y dependencias

- HTML/CSS/JS estático, sin framework ni build.
- Three.js r0.160.0 vía CDN (`three.min.js`) para el visor 3D.
- Fuente Manrope vía Google Fonts (fallback de tipografía interna).
- Persistencia en `localStorage` (clave `simuladorRobotPerfumeriaConfigV1`).

## 3. Escenario fijo (PERFUMERÍA)

- 4 vías (LANES `1..4`).
- 2 bultos por media capa (`boxesPerHalfLayer`).
- 24 bultos por palé (`boxesPerPallet`).
- 12 medias capas por palé (`HALF_LAYERS_PER_PALLET`).

## 4. Configuración del usuario

- **Periodo a simular**: minutos, entero ≥ 1.
- **Tiempo recoger 2 bultos y bajar a palé (s)**: 1 valor por vía.
- **Tiempo cambio entre vías (s)**: matriz 4×4; diagonal = 0 y deshabilitada.
- **Tiempo retirada/colocación de palé por vía (s)**: 1 valor por vía.
- **Tiempo entre llegadas de bulto a mesa por vía (s)**: 1 valor por vía.
- **Tiempo entre llegadas de caja de palé, es decir entre batches de 24 bultos**: será un valor global único. Convive con el tiempo bulto a bulto. Por defecto a 30 segundos.

Valores por defecto (`DEFAULT_CONFIG`): 60 min, pickDrop 10s, palletChange 18s,
arrival 2s, transición [[0,4,6,7],[4,0,4,6],[6,4,0,4],[7,6,4,0]].

La configuración del usuario no aparecerá en la página principal, si no en una auxiliar. Habrá un botón en la página principal para acceder a la página de configuración. Esto se hará con vistas separadas en la misma SPA.

### Validación

- Periodo > 0; en caso contrario, no simula y avisa.
- Todos los tiempos numéricos ≥ 0; valores inválidos no simulan.
- En modo silencioso (autoguardado) no muestra alertas.

## 5. Persistencia

- Autoguardado en cada cambio de formulario; estado mostrado en `#persistState`.
- Carga configuración guardada al iniciar; cae a defaults si falta o corrupta.
- Botón **Restablecer** vuelve a defaults y guarda.

## 6. Algoritmos de simulación

Simulación discreta por eventos hasta `simulationMinutes*60` segundos. En la interfaz, al lado del selector de algoritmo, se incluirá un botón de información que mostrará una descripción del algoritmo.

Los bultos llegan siempre de 24 en 24. No se piden otros 24 bultos para la línea hasta que se finalice un palé. Entonces el sistema tendrá un buffer de 24 cajas en una línea antes de llegar a la mesa de entrada, de tal manera que convivirán los parámetros de tiempo entre bultos y tiempo entre batches.

Una vez en el buffer previo a la mesa, los bultos pasan instantáneamente a la mesa.

La colocación de madera la ejecuta el robot, por lo tanto, no puede hacer ninguna otra tarea, mientras coloca la madera.

- **2 VÍAS Estricto**: pares fijos `[1,2]` y `[3,4]`; alterna vía dentro del par;
  cambia de par cuando ambas vías completan un palé. Si no hay cajas para recoger, espera. La colocación de madera (tiempo retirada y colocación de palé)  se hace prioritaria tras finalizar un palé.
- **4 VÍAS**: round-robin; siguiente vía con cola suficiente desde la actual. Si no hay cajas para recoger, pasa al siguiente puesto. La colocación de madera (tiempo retirada y colocación de palé) se ha prioritaria tras finalizar un palé.
- **1 VÍA**: Se forma el palé de una via, se espera a que haya bultos si no hay. Solo cambia de vía cuando el palé está finalizado. Cada madera se coloca cuando hay un palé finalizado.
- Cola FIFO por vía limitada a un palé (24 bultos); llegadas cada `arrival` s.
- Cada operación: transición + recoger/bajar; al completar palé, cambio de palé.
- Cuenta palés completos por vía y total.

## 7. Resultados

La pantalla de resultados debe permitir comparar los algoritmos simulados tanto desde el punto de vista de producción total como desde el comportamiento temporal del robot y de cada vía.

### 7.1. Resumen comparativo de producción

Se mostrarán tarjetas comparativas por algoritmo con:

* **Total de palés completos**: número total de palés finalizados durante el periodo simulado.
* **Barra proporcional de producción**: representación visual proporcional entre algoritmos, tomando como referencia el algoritmo con mayor número de palés completos.
* **Palés/hora**: total de palés completos dividido entre las horas simuladas.
* **Tiempo medio entre palés del sistema**: tiempo medio global entre palés completados, calculado como:

```text
periodo simulado / total de palés completos
```

Este KPI mide el ritmo agregado del sistema, no el tiempo individual de formación de un palé.

### 7.2. Tabla por vía

Se mostrará una tabla por vía y algoritmo con los siguientes campos:

* **Vía**.
* **Palés completos**: número de palés finalizados en la vía.
* **Bultos en FIFO**: bultos pendientes en el buffer/FIFO de la vía al finalizar la simulación.
* **Bultos en mesa**: bultos disponibles en mesa pendientes de bajar al palé.
* **Medias capas en curso**: bultos ya colocados en el palé actual, sin haber completado todavía el palé.
* **Palés equivalentes en curso**: trabajo pendiente o parcialmente avanzado expresado en palés equivalentes, calculado a partir de los bultos pendientes o ya colocados sobre palés incompletos.

Esta tabla debe ayudar a interpretar el efecto del corte temporal de la simulación. Dos algoritmos pueden terminar con un número parecido de palés completos, pero dejar distinto volumen de trabajo en curso.

### 7.3. Tarjeta comparativa de tiempos de formación

Se añadirá una tarjeta comparativa por algoritmo dedicada a los tiempos de formación de palé.

Dentro de esta tarjeta, cada KPI debe mostrarse en un cuadrito o tarjeta independiente. Debajo de los KPIs se mostrará el histograma de tiempos de formación de palé.

Añade tooltip en la caja de cada KPI indicando su definición.

Los KPIs serán:

* **Tiempo medio palé**: tiempo medio de formación de palé.
  Se mide desde el momento en el que se hace la primera recogida de 2 bultos disponibles en mesa para el palé actual y el palé puede recibirlos, hasta el instante en que el palé queda completo.

  Este tiempo incluye las esperas provocadas por la estrategia del algoritmo si, estando ya la vía lista para bajar bultos, el robot atiende otra vía antes de completar ese palé.

  No incluye la retirada ni la colocación posterior de madera del propio palé una vez completado.
* **Tiempo de ocupación de vía**: Se mide desde que existe una madera colocada hasta que se completa el palé.
* **Tiempo de espera medio hasta inicio**: Desde que hay madera y 2 bultos disponibles, hasta la primera recogida.
* **Desv. típica.**: desviación típica de los tiempos de formación de palé, usando exactamente la misma definición que el KPI **Tiempo medio palé**.

* **P90 tiempo palé**: percentil 90 de los tiempos de formación de palé. Permite detectar si hay palés que, sin ser casos extremos, tardan sensiblemente más que la media.

* **P95 tiempo palé**: percentil 95 de los tiempos de formación de palé. Permite observar la cola alta de la distribución.

* **Tiempo medio de transición por palé**: tiempo medio no productivo asociado a cambios de contexto del robot, calculado como:

```text
tiempo total de cambios entre vías + tiempo total de retirada/colocación que bloquea al robot
/
total de palés completos
```

* **Tiempo de espera total**: suma del tiempo en que el robot está disponible pero no puede bajar bultos porque la vía objetivo no tiene al menos 2 bultos disponibles, porque el algoritmo le obliga a esperar, o porque no hay ninguna vía servible en ese instante.

  No incluye tiempo de bajada de bultos, cambios entre vías, ni retirada/colocación de palé.

### 7.4. Histograma de tiempos de formación de palé

Debajo de los KPIs de la tarjeta de tiempos se mostrará un histograma por algoritmo con los tiempos de formación de palé.

El histograma debe usar exactamente la misma definición que el KPI **Tiempo medio palé**:

```text
desde que la vía tiene al menos 2 bultos disponibles en mesa para bajar
hasta que el palé queda completo
```

El objetivo del histograma es mostrar si los tiempos de formación son homogéneos o si aparecen varios grupos/modos de comportamiento provocados por la estrategia del algoritmo, los cambios de vía o los bloqueos por retirada y colocación de palé.

### 7.5. Utilización del robot

Se mostrará un desglose del tiempo del robot por algoritmo, preferiblemente mediante una barra apilada o una tarjeta resumen, con los siguientes conceptos:

* **Tiempo productivo**: tiempo dedicado a bajar bultos al palé.
* **Tiempo de transición**: tiempo dedicado a cambios entre vías.
* **Tiempo de retirada/colocación**: tiempo en el que el robot queda bloqueado por retirada de palé completo y colocación de nueva madera.
* **Tiempo de espera**: tiempo en el que el robot está disponible pero no puede producir por restricciones del algoritmo o por falta de bultos bajables.

Además del tiempo absoluto, se mostrará el porcentaje de cada concepto sobre el periodo total simulado.

### 7.6. Balance entre vías

Se mostrará un indicador de balance por algoritmo para detectar si la producción queda repartida de forma homogénea entre vías.

Los KPIs serán:

* **Desbalance de vías**:

```text
máximo de palés completos por vía - mínimo de palés completos por vía
```

* **Desviación típica de palés por vía**: desviación típica del número de palés completos entre las vías.

Estos KPIs ayudan a detectar algoritmos que concentran la producción en unas vías y dejan otras más retrasadas.

### 7.7. Caja comparativa entre algoritmos

Se mostrará una caja comparativa final con:

* **Delta de palés completos** entre algoritmos.
* **Delta de palés/hora**.
* **Delta de tiempo medio de formación de palé**.
* **Delta de tiempo medio entre palés del sistema**.
* **Delta de tiempo de espera total**.
* **Delta de utilización productiva del robot**.
* **Periodo simulado**.
* **Escenario de parámetros utilizado**.

Esta caja debe servir como resumen ejecutivo de la comparación, evitando interpretar únicamente el tiempo medio de formación de palé como medida de productividad global.

### 7.8. Formato de tiempos

Todos los tiempos deben mostrarse en formato legible, preferiblemente:

```text
mm:ss
```

Para valores largos, se podrá usar:

```text
hh:mm:ss
```

Los cálculos internos podrán realizarse en segundos, pero la visualización deberá ser consistente en toda la pantalla.


## 8. Reproductor 3D

- Selección de algoritmo, velocidad (x8/x16/x32/x64), play/pausa/reset, timeline.
- Robot articulado (IK 2 segmentos), 4 palés con medias capas frontal/posterior.
- Reproduce eventos: mover, recoger/bajar, cambio de palé; estado y reloj.
- Fallback con mensaje si Three.js no carga.

## 9. No funcionales

- Responsive; resize del visor; sin backend; idioma español.
