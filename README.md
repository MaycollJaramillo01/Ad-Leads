# AdLeads: anunciantes de la Biblioteca de anuncios de Meta

App local que busca en la Biblioteca de anuncios de Meta (Facebook e Instagram), guarda cada anunciante en una base de datos propia y le añade el email, teléfono, dirección, web e Instagram que publica su página. Desde ahí se filtran, se marcan como leads y se exportan a CSV (abre bien en Excel).

## Pantallas

- **Nueva búsqueda** (`/`): palabra clave, frase exacta o una URL de la Ads Library o de una página de Facebook. Uno o varios países, con atajos por región (Latinoamérica, habla hispana, Norteamérica, habla inglesa, Europa) o "Todos los países". Filtros de anuncios activos o inactivos, formato y fecha de publicación, límite por país y estimación de costo antes de lanzar. Abajo, las búsquedas recientes con su progreso en vivo.
- **Historial** (`/busquedas`): todas las búsquedas con su estado, anuncios, anunciantes, porcentaje con email y costo real. Se pueden filtrar, ordenar, repetir o borrar.
- **Detalle de búsqueda** (`/busquedas/:id`): progreso en vivo, opción de cancelar, cifras, parámetros usados y la tabla de anunciantes que encontró.
- **Anunciantes** (`/anunciantes`): la base completa sin duplicados.
  - Filtros por texto, país, búsqueda, estado y datos de contacto (con email, con teléfono o sin contacto).
  - Orden por columna, paginación y selección múltiple para cambiar el estado de varios a la vez.
  - Exporta a CSV todo lo filtrado o solo lo seleccionado.
  - Al hacer clic en un anunciante se abre su ficha con contacto, estado del lead (nuevo, contactado, interesado, cliente, descartado), notas, anuncios con imagen y las búsquedas donde apareció.

Los filtros quedan en la URL, así que una vista filtrada se puede guardar o compartir.

## Uso

Requiere Node 22.13 o superior (usa `node:sqlite`).

```bash
npm install
cp .env.example .env   # y pon tu APIFY_TOKEN
npm run dev            # http://localhost:4321
```

Producción:

```bash
npm run build
npm start              # lee .env
```

`npm run check` prueba la capa de datos sin gastar en Apify: mapeo, deduplicación, caché, filtros, orden, CSV y borrado.

## Cómo funciona

1. Cada búsqueda se guarda en SQLite (`data/scraper.db`; se puede cambiar con `DB_PATH`) y entra en una cola que procesa una a la vez en segundo plano.
2. **Paso 1, anuncios:** `apify/facebook-ads-scraper` recibe una URL de la Ads Library por país. Cada anuncio se guarda y se agrupa por página anunciante.
3. **Paso 2, contactos:** `apify/facebook-pages-scraper` visita las páginas de esos anunciantes y extrae lo que publican en "Información".
4. Si cierras el navegador, la búsqueda sigue. Si reinicias el servidor, retoma la ejecución de Apify donde iba. Al cancelar se detiene la ejecución en Apify y se conserva lo ya extraído.

El token de Apify solo vive en el servidor (`.env`) y nunca llega al navegador.

## Costos (Apify)

- ~$0.006 por anuncio
- ~$0.012 por página de anunciante enriquecida

Una página enriquecida en los últimos 30 días no se vuelve a pagar: se reutilizan sus datos. El costo que muestra la app es el que Apify reporta de cada ejecución, no una estimación.

Ejemplo real: "dentista" en México y Colombia, 5 anuncios por país, dio 10 anuncios, 8 anunciantes (6 con email) y costó $0.11.

## Límites

- Solo aparecen los contactos que cada página publica. Muchas marcas grandes no ponen email.
- Máximo 2000 anuncios por país y 40 países por búsqueda.
- La cola procesa las búsquedas de una en una para no superar la concurrencia del plan de Apify.
- Es una app local de un solo usuario y no tiene inicio de sesión. No la expongas a internet tal cual.
