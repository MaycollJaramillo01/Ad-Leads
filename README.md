# AdLeads: anunciantes de la Biblioteca de anuncios de Meta

Busca en la Biblioteca de anuncios de Meta (Facebook e Instagram), guarda cada anunciante en una base de datos propia y le añade el email, teléfono, dirección, web e Instagram que publica su página. Desde ahí se filtran, se marcan como leads y se exportan a CSV (abre bien en Excel). Funciona en local o publicada en Vercel.

## Pantallas

- **Nueva búsqueda** (`/`): palabra clave, frase exacta o una URL de la Ads Library o de una página de Facebook. Uno o varios países, con atajos por región (Latinoamérica, habla hispana, Norteamérica, habla inglesa, Europa) o "Todos los países". Filtros de anuncios activos o inactivos, formato, idioma del anuncio y fecha de publicación, límite por país y costo máximo estimado antes de lanzar. Opción de traer la fecha de creación de cada página. Abajo, las búsquedas recientes con su progreso en vivo.
- **Historial** (`/busquedas`): todas las búsquedas con su estado, anuncios, anunciantes, porcentaje con email y costo real. Se pueden filtrar, ordenar, repetir, borrar o volver a descargar en CSV, solo con los anunciantes que tengan correo, teléfono o ambos.
- **Detalle de búsqueda** (`/busquedas/:id`): progreso en vivo, opción de cancelar, cifras, parámetros usados y la tabla de anunciantes que encontró. Si llegan menos anuncios de los pedidos, explica por país cuántos devolvió Apify y por qué se detuvo.
- **Anunciantes** (`/anunciantes`): la base completa sin duplicados.
  - Filtros por texto, país, búsqueda, estado, contacto (casillas Correo y Teléfono; marcar las dos exige ambos) y fecha de creación de la página.
  - Orden por columna, paginación y selección múltiple para cambiar el estado de varios a la vez.
  - Exporta a CSV todo lo filtrado o solo lo seleccionado.
  - Al hacer clic en un anunciante se abre su ficha con contacto, estado del lead (nuevo, contactado, interesado, cliente, descartado), notas, anuncios con imagen y las búsquedas donde apareció.
- **Páginas nuevas** (`/paginas-nuevas`): anunciantes cuya página de Facebook se creó en la última semana, el último mes o los últimos 3 meses, con los mismos filtros y exportación. Solo incluye páginas cuya fecha se conoce: las de búsquedas con "Fecha de creación de la página" activado.

Los filtros quedan en la URL, así que una vista filtrada se puede guardar o compartir.

## Uso local

Requiere Node 22.18 o superior.

```bash
npm install
cp .env.example .env   # y pon tu APIFY_TOKEN
npm run dev            # http://localhost:4321
```

Sin `APP_PASSWORD` en `.env` no pide contraseña, pensado para usarla solo en tu equipo. Los datos quedan en `data/scraper.db` (se puede cambiar con `DB_PATH`).

Servidor propio:

```bash
npm run build
npm start              # lee .env
```

`npm run check` prueba la capa de datos sin gastar en Apify: mapeo de lo que devuelven los actores, deduplicación, caché de contactos, filtros, orden, CSV y borrado.

## Publicar en Vercel

El repositorio está conectado al proyecto de Vercel: cada push a `main` se publica solo.

1. **Base de datos:** en Vercel, Storage → Turso (integración del Marketplace). Crea `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` en el proyecto. Las tablas se crean solas en la primera petición.
2. **Variables de entorno** (Settings → Environment Variables):

| Variable | Para qué |
|---|---|
| `APIFY_TOKEN` | Token de tu cuenta de Apify. Solo vive en el servidor. |
| `APP_PASSWORD` | Contraseña para entrar. Obligatoria en internet. |
| `APP_URL` | Opcional. La URL pública si usas un dominio propio; por defecto se usa la de producción de Vercel. |

## Cómo funciona

1. Cada búsqueda se guarda en la base (SQLite en local, Turso en Vercel) y avanza en pasos cortos que retoman donde se quedaron. Las búsquedas se procesan de una en una, por orden de llegada.
2. **Paso 1, anuncios:** `curious_coder/facebook-ads-library-scraper` recibe una URL de la Ads Library por país, una ejecución por país, cada una con su tope exacto. Cada anuncio se guarda y se agrupa por página anunciante.
3. **Paso 2, contactos:** `saswave/facebook-company-page-scraper` visita la página de cada anunciante nuevo y extrae lo que publica en "Información".
   - **Paso 3, fecha de creación (opcional):** `premiumscraper/facebook-page-transparency-scraper` lee la "Transparencia de la página" y guarda cuándo se creó. Una página con fecha no se vuelve a consultar.
   - Cada ejecución lleva su propio tope de resultados y de costo (`maxItems`, `maxTotalChargeUsd`). Sin ellos, Apify aplica el "costo máximo por ejecución" de la cuenta, y una búsqueda grande podía terminar como exitosa con la mitad de los anuncios.
   - Si un país falla, la búsqueda sigue con los demás. El detalle muestra por país cuántos anuncios llegaron y por qué se detuvo.
4. **No hace falta tener la pestaña abierta.** En local, un temporizador revisa cada 5 segundos. En Vercel, Apify avisa a `/api/apify-webhook` cuando termina cada ejecución, y la app sigue con el paso siguiente.
5. Al cancelar se detiene la ejecución en Apify y se conserva lo ya extraído.

## Costos (Apify, plan Free)

- $0.00075 por anuncio ($0.75 por cada 1,000).
- $0.004 por página de anunciante ($4 por cada 1,000). Una página consultada en los últimos 30 días no se vuelve a pagar: se reutilizan sus datos.
- Unos $0.009 por fecha de creación de página ($9 por cada 1,000), solo si se activa: $0.003 del actor más proxy y cómputo que ese actor cobra aparte (se corre con 1 GB para que el cómputo sea mínimo).
- Mínimo 10 anuncios por país: el actor no acepta menos.
- El límite por país es un máximo. Si la Biblioteca de anuncios muestra menos anuncios con esos filtros, llegan menos. Su "~N resultados" es una estimación que incluye anuncios que no lista.

El costo que muestra cada búsqueda es el que cobra Apify, no una estimación. Apify termina de facturar una ejecución unos segundos después de que acaba, así que el costo queda como provisional hasta 1 o 2 minutos después de terminar la búsqueda.

Ejemplo real: "dentista" en México y Colombia, 10 anuncios de 8 anunciantes. Con los actores oficiales de Apify costó $0.154; con los actuales cuesta unos $0.04 y trae los mismos emails, teléfonos y direcciones.

## Límites

- Solo aparecen los contactos que cada página publica. Muchas marcas grandes no ponen email.
- Máximo 2000 anuncios por país y 40 países por búsqueda.
- Una sola contraseña compartida, sin cuentas de usuario.
