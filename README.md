# Adivina Quien

## 1. Nombre del proyecto

**Adivina Quien** es una aplicacion web multijugador en tiempo real inspirada en el juego de mesa clasico, desarrollada como proyecto academico con Python, Flask y Flask-SocketIO.

## 2. Descripcion general

El proyecto implementa una version web del juego "Adivina Quien" para dos jugadores. Cada jugador recibe un personaje secreto y debe hacer preguntas de respuesta "si" o "no" para descubrir el personaje del rival.

La aplicacion esta disenada para cumplir requisitos academicos importantes: comunicacion por sockets, uso de hilos, emparejamiento automatico, emparejamiento privado por QR, multiples partidas simultaneas, estado guardado en el servidor e interfaz web visual e interactiva.

## 3. Tecnologias utilizadas

- **Python**: lenguaje principal del servidor.
- **Flask**: framework web para servir la pagina principal.
- **Flask-SocketIO**: comunicacion en tiempo real entre servidor y clientes.
- **threading**: manejo de concurrencia, locks e hilos por partida.
- **HTML5**: estructura de la interfaz.
- **CSS3**: estilos, responsive design, temas visuales y animaciones.
- **JavaScript**: interaccion del cliente con Socket.IO.
- **qrcode.js**: generacion visual del codigo QR desde una URL de invitacion.
- **unittest**: pruebas automatizadas del comportamiento multijugador.

## 4. Requisitos del sistema

- Python 3.10 o superior.
- Navegador moderno con soporte para JavaScript.
- Conexion local a `http://localhost:5000`.
- Para probar QR desde otro dispositivo, ambos equipos deben estar en la misma red WiFi.
- Dependencias instaladas desde `requirements.txt`.

## 5. Uso de sockets

El proyecto usa **Flask-SocketIO** para permitir comunicacion bidireccional en tiempo real.

El servidor maneja eventos como:

- `connect`: registra la conexion del jugador, pero no lo mete en ninguna cola.
- `join_public_queue`: agrega al jugador a la cola publica despues de elegir ese modo.
- `disconnect`: detecta abandono de partida.
- `cancel_matchmaking`: saca al jugador de la cola publica o elimina su sala privada si vuelve al menu.
- `create_private_room`: crea una sala privada para invitacion por QR.
- `join_private_room`: une a un jugador a una sala privada existente.
- `ask_question`: recibe una pregunta del jugador actual.
- `guess_character`: recibe un intento de adivinar personaje.
- `request_state`: permite pedir el estado actualizado.

El cliente recibe eventos como:

- `connected`
- `queue_status`
- `private_room_detected`
- `private_room_created`
- `game_started`
- `state_update`
- `action_result`
- `error_message`
- `opponent_left`

Esto permite que los cambios del juego se reflejen inmediatamente en ambos navegadores sin recargar la pagina.

## 6. Uso de hilos

El servidor utiliza el modulo `threading` de Python.

Se usa `threading.Lock` para proteger estructuras compartidas:

- `waiting_players`
- `private_rooms`
- `active_games`
- `player_to_game`

Tambien se crea un `threading.Thread` por cada partida nueva. Este hilo funciona como trabajador de ciclo de vida de la partida y evidencia el uso de concurrencia para administrar varias sesiones de juego al mismo tiempo.

Cada `GameSession` tambien posee su propio `lock`, lo que evita que dos acciones simultaneas alteren el turno, historial o ganador de forma inconsistente.

## 7. Emparejamiento de jugadores

El proyecto tiene dos formas de emparejamiento: automatico y privado por QR. Ambas se administran en el servidor y terminan creando una `GameSession` normal.

### Emparejamiento publico

Cuando un cliente entra a la pagina sin parametro `room`, primero ve el menu **Elige modo de juego**. El servidor no lo agrega automaticamente a ninguna cola.

El jugador solo entra a `waiting_players` cuando presiona **Partida publica**. En ese momento el cliente emite `join_public_queue`.

El emparejamiento publico funciona asi:

1. El primer jugador que elige partida publica queda en espera.
2. El segundo jugador que tambien elige partida publica se empareja con el primero.
3. El servidor crea una nueva instancia de `GameSession`.
4. Ambos jugadores se unen a una sala Socket.IO identificada por el `game_id`.
5. El servidor envia a cada jugador su estado privado.

El cliente no decide con quien juega. Todo el emparejamiento ocurre en el servidor.

### Emparejamiento por QR

El modo QR es una opcion adicional y no reemplaza el emparejamiento automatico.

El flujo funciona asi:

1. El Jugador A presiona **Crear partida por QR**.
2. El cliente emite `create_private_room`.
3. El servidor genera un codigo unico, por ejemplo `ABC123`.
4. El servidor guarda la sala en `private_rooms`.
5. El servidor responde con una URL como `http://IP-LOCAL:5000/?room=ABC123`.
6. El cliente muestra el codigo, el enlace y el QR.
7. El Jugador B abre ese enlace desde otro dispositivo o pestana.
8. El cliente de Jugador B emite `join_private_room`.
9. El servidor valida la sala, elimina la sala privada y crea una `GameSession`.

Una sala QR acepta solo dos jugadores. Si la sala no existe, ya fue usada o esta llena, el servidor responde con un error claro.

Si un jugador que estaba en cola publica decide crear una sala privada, el servidor lo retira primero de `waiting_players`. Si un creador de sala QR vuelve al menu o se desconecta antes de que entre el invitado, la sala se elimina de `private_rooms`.

## 8. Multiples partidas simultaneas

El servidor puede manejar varias partidas al mismo tiempo usando:

- `active_games`: diccionario que guarda cada partida por su `game_id`.
- `player_to_game`: indice que relaciona cada jugador con su partida.
- `private_rooms`: salas QR que todavia esperan al segundo jugador.
- Salas de Socket.IO: cada partida usa su propio room.

Por ejemplo, si se abren 4 pestanas:

- Si las cuatro eligen **Partida publica**, Jugador 1 y Jugador 2 quedan en una partida, y Jugador 3 y Jugador 4 en otra.
- Si se crean dos salas QR, cada enlace QR empareja solo al creador con su invitado.

Las acciones de una partida solo se emiten al room de esa partida. Por eso, el historial, turnos, ganador, tablero y mensajes de una partida no afectan a otra.

Las partidas creadas por QR y las partidas creadas automaticamente comparten la misma clase `GameSession`, pero no comparten cola ni sala de espera. Esto evita que un jugador de una sala QR sea emparejado accidentalmente con un jugador automatico.

## 9. Mecanica de juego

Cada partida se desarrolla entre dos jugadores:

1. Ambos reciben el mismo tablero de personajes.
2. Cada jugador recibe un personaje secreto diferente.
3. El Jugador 1 comienza el turno.
4. En su turno, un jugador puede:
   - Hacer una pregunta sobre una caracteristica.
   - Intentar adivinar el personaje del rival.
5. Si hace una pregunta valida, el servidor responde si la caracteristica coincide o no con el personaje secreto del rival.
6. Si intenta adivinar y acierta, la partida termina y se declara ganador.
7. Si se equivoca, el turno pasa al rival.

Las preguntas se basan en atributos como:

- genero
- gafas
- sombrero
- barba
- bigote
- cabello largo
- color de cabello
- accesorio

## 10. Estado guardado en el servidor

El estado real del juego se guarda en la clase `GameSession`, dentro del servidor.

Cada partida mantiene:

- Jugadores.
- Tablero aleatorio.
- Personaje secreto de cada jugador.
- Turno actual.
- Historial de acciones.
- Estado de partida: `waiting`, `active` o `finished`.
- Ganador.

El cliente solo muestra la informacion que recibe del servidor. No decide turnos, respuestas, ganador ni estado final.

## 11. Consistencia entre partidas

La consistencia se protege con tres mecanismos:

1. **Locks globales**: `state_lock` protege la cola automatica, salas QR, partidas activas y relacion jugador-partida.
2. **Locks por partida**: cada `GameSession` protege sus propias acciones internas.
3. **Rooms de Socket.IO**: los eventos de una partida se emiten solo a los jugadores de esa partida.

Ademas, el servidor valida:

- Que el jugador pertenezca a una partida.
- Que la partida este activa.
- Que sea el turno del jugador.
- Que la pregunta use un atributo valido.
- Que el personaje adivinado exista en el tablero.
- Que no se juegue despues de terminar la partida.
- Que una sala QR exista antes de unirse.
- Que una sala QR no acepte mas de dos jugadores.

## 12. Interfaz web

La interfaz web esta construida con HTML, CSS y JavaScript puro.

Incluye:

- Encabezado con titulo y descripcion.
- Menu inicial para elegir **Partida publica** o **Partida privada**.
- Estado de conexion.
- Estado de emparejamiento.
- Boton para crear partida por QR.
- Panel con codigo de sala, enlace de invitacion y QR.
- Indicador de turno.
- Tarjeta del personaje secreto.
- Tablero responsive de personajes.
- Panel para hacer preguntas.
- Panel para adivinar personaje.
- Historial de acciones.
- Modal final de victoria o derrota.

El objetivo visual es que la aplicacion se sienta como un juego web moderno, claro y atractivo.

## 13. Identidad visual de jugadores

Cada jugador recibe un numero enviado por el servidor:

- **Jugador 1**: clase visual `player-one`.
- **Jugador 2**: clase visual `player-two`.

La identidad visual se aplica al `body` del documento:

- Jugador 1 usa estilo rojo y amarillo.
- Jugador 2 usa estilo azul y amarillo.

Esto permite diferenciar bordes, botones, luces, paneles e indicadores de turno. La identidad visual depende del estado enviado por el servidor, no de una decision del cliente.

## 14. Animaciones e interacciones visuales

La interfaz incluye animaciones CSS para mejorar la experiencia:

- `fade-in`: aparicion suave.
- `slide-up`: entrada de elementos del historial.
- `pulse`: turno activo.
- `shake`: errores o acciones invalidas.
- `bounce`: seleccion de personaje.
- `glow`: iluminacion de paneles o cartas.
- `victory-animation`: resultado de victoria.
- `defeat-animation`: resultado de derrota.

Tambien se aplican efectos hover, seleccion, estados correctos e incorrectos en las tarjetas del tablero.

## 15. Instalacion de dependencias

Crear y activar el entorno virtual:

```bash
python -m venv venv
venv\Scripts\activate
```

Instalar dependencias:

```bash
pip install -r requirements.txt
```

## 16. Ejecucion del servidor

Ejecutar el servidor con:

```bash
python app.py
```

Luego abrir en el navegador:

```text
http://localhost:5000
```

El servidor se ejecuta con `host="0.0.0.0"` para permitir conexiones desde otros dispositivos de la misma red. En otro dispositivo se debe abrir la IP local del computador servidor, por ejemplo:

```text
http://192.168.1.20:5000
```

## 17. Prueba con dos o mas jugadores

Para probar una partida normal:

1. Ejecutar `python app.py`.
2. Abrir `http://localhost:5000` en una pestana.
3. Abrir otra pestana con la misma URL.
4. En ambas pestanas, presionar **Partida publica**.
5. El servidor empareja los dos clientes.
6. Cada jugador recibe su personaje secreto y su numero de jugador.
7. Probar preguntas y adivinanzas desde el turno correspondiente.

Si se abre una tercera pestana y presiona **Partida publica**, quedara esperando hasta que entre una cuarta que tambien elija ese modo.

Para probar una partida por QR:

1. Abrir la pagina en el computador servidor.
2. Presionar **Crear partida por QR**.
3. Copiar el enlace o escanear el codigo QR.
4. Abrir el enlace desde otro dispositivo conectado a la misma red WiFi.
5. Verificar que ambos jugadores entran a una partida privada.

## 18. Prueba de multiples partidas con 4 pestanas

Para probar multiples partidas simultaneas:

1. Ejecutar el servidor.
2. Abrir cuatro pestanas en `http://localhost:5000`.
3. Presionar **Partida publica** en las cuatro pestanas.
4. Verificar que:
   - Pestana 1 y pestana 2 forman una partida.
   - Pestana 3 y pestana 4 forman otra partida.
   - Cada partida tiene su propio tablero, turno e historial.
   - Las acciones de una partida no aparecen en la otra.

Tambien se incluye una prueba automatizada:

```bash
python -m unittest tests.test_multiple_games
```

Esta prueba simula cuatro clientes, verifica que se creen dos partidas independientes y confirma que una accion en una partida no afecte a la otra.

La misma prueba automatizada tambien verifica:

- Dos partidas QR simultaneas.
- Una partida QR funcionando al mismo tiempo que una partida automatica.
- Que las acciones de una partida no lleguen a la otra.

## 19. Estructura de carpetas

```text
adivina-quien-web/
|-- app.py
|-- game.py
|-- characters.py
|-- requirements.txt
|-- README.md
|-- templates/
|   |-- index.html
|-- static/
|   |-- css/
|   |   |-- styles.css
|   |-- js/
|       |-- client.js
|-- tests/
    |-- test_multiple_games.py
```

Descripcion de archivos principales:

- `app.py`: servidor Flask, sockets, cola, partidas activas y eventos.
- `game.py`: clase `GameSession` y reglas principales del juego.
- `characters.py`: personajes y funcion para generar tablero aleatorio.
- `templates/index.html`: estructura visual de la pagina.
- `static/css/styles.css`: estilos, temas, responsive design y animaciones.
- `static/js/client.js`: cliente Socket.IO y renderizado visual.
- `tests/test_multiple_games.py`: prueba de multiples partidas simultaneas.

## 20. Capturas sugeridas para la entrega

Para documentar la entrega se recomienda incluir capturas de:

- Pantalla inicial esperando rival.
- Partida activa con dos pestanas abiertas.
- Vista del Jugador 1 con identidad rojo/amarillo.
- Vista del Jugador 2 con identidad azul/amarillo.
- Tablero de personajes.
- Panel del personaje secreto.
- Historial despues de una pregunta.
- Mensaje de error al intentar jugar fuera de turno.
- Modal de victoria.
- Prueba con cuatro pestanas mostrando dos partidas diferentes.
- Panel de creacion de partida por QR.
- Codigo QR visible y enlace de invitacion.
- Dos partidas QR simultaneas o una QR junto a una automatica.

## 21. Conclusion

El proyecto **Adivina Quien** demuestra una aplicacion web multijugador en tiempo real con una arquitectura centrada en el servidor. La logica importante del juego no depende del cliente, sino que se valida y ejecuta en Python mediante `GameSession`.

El uso de Flask-SocketIO permite comunicacion inmediata entre jugadores, mientras que `threading.Lock` y `threading.Thread` permiten administrar concurrencia y multiples partidas simultaneas. La interfaz web complementa la logica con una experiencia visual moderna, responsive y facil de usar.

En conjunto, el proyecto cumple los requisitos academicos de sockets, hilos, emparejamiento automatico, emparejamiento por QR, multiples partidas, estado del juego en servidor e interfaz web interactiva.
