# Guía de conexión — Panel de administración ADCV

Esto conecta la web a un sistema donde puedes publicar noticias desde el
móvil, sin FileZilla, sin FTP y sin tocar código. Se hace UNA vez.

## Qué vas a tener al terminar
- Un panel en `nueva.adcolmenarviejo.es/admin` donde escribes una noticia,
  le pones foto, y le das a "Publicar" — en menos de un minuto está en la web.
- Cada cambio que YO haga en el código también se publicará solo, sin FTP.

---

## Paso 1 — Crear cuenta en GitHub (gratis)

1. Ve a https://github.com/signup y crea una cuenta (con el email que prefieras).
2. Una vez dentro, pulsa el botón verde **"New"** para crear un repositorio nuevo.
3. Nómbralo, por ejemplo, `adcv-web`. Puede ser **privado** o público, tú eliges.
4. Dale a **"Create repository"**.
5. En la página del repositorio recién creado, verás un botón que dice
   **"uploading an existing file"** (o similar) — pulsa ahí.
6. Descomprime en tu ordenador el archivo `adcv-eleventy.zip` que te he dado.
7. Arrastra **todo el contenido de dentro** de la carpeta `adcv-eleventy`
   (no la carpeta en sí) a esa pantalla de GitHub.
8. Baja del todo y dale a **"Commit changes"**.

## Paso 2 — Crear cuenta en Netlify y conectar el repositorio

1. Ve a https://app.netlify.com/signup y crea una cuenta — lo más fácil es
   entrar con el mismo GitHub del paso anterior ("Sign up with GitHub").
2. Una vez dentro, pulsa **"Add new site"** → **"Import an existing project"**.
3. Elige **GitHub**, y selecciona el repositorio `adcv-web` que creaste.
4. Netlify debería detectar solo la configuración (viene ya escrita en
   `netlify.toml`: comando `npm run build`, carpeta `_site`). Si te pide
   confirmarlo, déjalo tal cual.
5. Dale a **"Deploy site"**. Tarda 1-2 minutos la primera vez.
6. Si todo va bien, Netlify te da una URL provisional tipo
   `algo-random.netlify.app` — entra y comprueba que la web se ve bien.
   **Si da error, copia el mensaje de "Deploy log" y pégamelo — lo arreglo.**

## Paso 3 — Activar el panel de administración (Identity + Git Gateway)

1. Dentro de tu sitio en Netlify, ve a **Site configuration → Identity**.
2. Pulsa **"Enable Identity"**.
3. Baja a **"Registration"** y ponlo en **"Invite only"** (así solo entra
   quien tú invites, no cualquiera de internet).
4. Ve a **Identity → Services → Git Gateway** y pulsa **"Enable Git Gateway"**.
5. Vuelve a **Identity** (arriba) y pulsa **"Invite users"** — ponte tu
   propio email. Te llegará un correo para activar tu cuenta del panel.

## Paso 4 — Apuntar tu dominio

1. En Netlify: **Site configuration → Domain management → Add a domain**.
2. Escribe `nueva.adcolmenarviejo.es` (o el dominio que decidas usar).
3. Netlify te dará instrucciones de qué registro DNS crear en IONOS
   (normalmente un registro tipo **CNAME** apuntando a tu-sitio.netlify.app).
4. Vas a IONOS → el mismo sitio donde tocamos el DNS antes → y creas ese
   registro. **Avísame antes de tocarlo y te confirmo exactamente qué poner**,
   después de lo de hoy prefiero comprobarlo contigo paso a paso.

## Paso 5 — ¡Publicar tu primera noticia desde el panel!

1. Entra a `nueva.adcolmenarviejo.es/admin` (una vez el DNS esté propagado).
2. Inicia sesión con el email que invitaste en el Paso 3.
3. Pulsa **"Noticias" → "New Noticia"**.
4. Rellena título, categoría, fecha, foto y texto.
5. Dale a **"Publish"**.
6. Espera ~1 minuto (Netlify recompila la web sola) y refresca la web —
   ahí está tu noticia, sin FTP, sin FileZilla.

---

## Si algo falla

- **El "Deploy" de Netlify da error**: cópiame el log de error, seguramente
  es algo pequeño en la configuración que arreglo en segundos.
- **No te deja entrar al panel `/admin`**: revisa que Identity y Git Gateway
  estén activados (Paso 3) y que tu email esté invitado.
- **El dominio no carga**: dale tiempo de propagación (igual que con IONOS
  hoy) y verifica el registro CNAME.

No hay prisa — esto se queda preparado y lo conectamos cuando tengas un
rato tranquilo, sin las prisas de hoy con IONOS.

---

## Paso extra — Resultados automáticos desde la RFFM (nuevo)

Esta parte hace que las páginas de Resultados se rellenen solas cada
lunes con los datos reales de rffm.es, sin que nadie tenga que salir de
la web ni escribir nada a mano.

**Aviso importante:** esto es más experimental que el resto. Lo he
construido sin poder ver en directo cómo la RFFM organiza sus datos
internamente (su web no me deja verla sin ejecutar JavaScript, y mi
entorno no puede hacerlo). Es muy probable que, la primera vez que se
ejecute de verdad en Netlify, **no salga perfecto a la primera** — si
pasa, mándame lo que veas (una captura de la sección de Resultados, o
el "Deploy log" de Netlify) y lo ajusto. Mientras tanto, si algo falla,
la web no se rompe: simplemente no actualiza esa sección hasta que lo
arreglemos.

### 1. Crear el "Build Hook" en Netlify

1. En tu sitio de Netlify: **Site configuration → Build & deploy → Build hooks**.
2. Pulsa **"Add build hook"**, ponle un nombre (ej. "Actualización semanal RFFM").
3. Copia la URL que te da (empieza por `https://api.netlify.com/build_hooks/...`).

### 2. Guardar esa URL en GitHub (como secreto, no visible para nadie)

1. En tu repositorio de GitHub, ve a **Settings → Secrets and variables → Actions**.
2. Pulsa **"New repository secret"**.
3. Nombre: `NETLIFY_BUILD_HOOK`
4. Valor: pega la URL que copiaste en el paso anterior.
5. Guarda.

Con esto, cada lunes por la mañana GitHub avisará a Netlify para que
recompile la web, y al recompilar se ejecuta automáticamente el
"visitante invisible" que va a buscar los datos actualizados a la RFFM.

### 3. Probarlo sin esperar a que llegue el lunes

1. Ve a la pestaña **"Actions"** de tu repositorio en GitHub.
2. Selecciona **"Actualización semanal de resultados (RFFM)"** en la lista de la izquierda.
3. Pulsa **"Run workflow"** → **"Run workflow"** (botón verde) para lanzarlo ahora mismo.
4. Ve a Netlify → tu sitio → pestaña **"Deploys"** — deberías ver un despliegue nuevo en marcha.
5. Cuando termine (puede tardar 2-4 minutos, más que el resto por el navegador invisible),
   entra en `nueva.adcolmenarviejo.es/resultados.html` y comprueba si aparecen datos reales.

**Si no aparece nada o se ve raro**, no pasa nada — mándame captura y seguimos afinándolo juntos.
