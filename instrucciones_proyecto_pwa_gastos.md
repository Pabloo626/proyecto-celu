# Prompt y archivos para continuar el proyecto (PWA Gastos en Pareja)

## Prompt listo para copiar/pegar en un chat nuevo

Hola. Estoy desarrollando una **PWA de “gastos en pareja”** en **React + Vite**, publicada en **GitHub Pages**, con datos guardados en **Google Sheets** vía **Google Apps Script (Code.gs)**.  
La app tiene **gastos e ingresos**, **perfiles (pablo/maria_ignacia)**, filtros por **mes**, y un **modo debug** para **importar JSON** y **reemplazar la nube**.

Necesito que trabajes sobre mi **código actual** **SIN cambiar el stack**.  
Requisitos:

- Frontend: React + Vite + `vite-plugin-pwa`
- Hosting: GitHub Pages (base path `/proyecto-celu/`)
- Backend: Google Apps Script como API + Google Sheets como BD
- Autenticación simple por token (en env/secrets)

Te adjunto los archivos clave. Quiero que me propongas **cambios concretos con código listo para pegar**, y **pasos de prueba** (local + GitHub Pages).

---

## Archivos que deberías enviar (mínimos)

1. `src/App.jsx` — lógica UI principal  
2. `src/api.js` — comunicación con Apps Script (fetch GET/POST)  
3. `src/main.jsx` — punto de entrada + registro PWA/service worker  
4. `vite.config.js` — base GitHub Pages + configuración PWA  
5. `src/styles.css` — estilos (incluye modo oscuro si existe)  
6. `Code.gs` — Apps Script (backend/API)  
7. **Estructura de tu Google Sheet** (captura o texto de headers), por ejemplo:  
   `id | type | amount | category | profile | date | note | split | createdAt`

---

## Archivos opcionales (si aplica)

- `package.json` — para ver dependencias exactas (especialmente PWA)  
- `.github/workflows/deploy.yml` — si están tocando GitHub Actions/Pages  
- Carpeta `public/` — íconos PWA (`pwa-192.png`, `pwa-512.png`, `apple-touch-icon.png`, etc.)

---

## Contexto rápido (texto) que conviene pegar siempre

Pega estas 6 cosas al inicio del chat:

1. URL de la app (GitHub Pages): `https://TUUSUARIO.github.io/proyecto-celu/`  
2. URL de Apps Script: `https://script.google.com/macros/s/.../exec`  
3. Token: “lo tengo, no lo publiques” (o uno de ejemplo)  
4. Perfiles: `pablo`, `maria_ignacia`  
5. Categorías actuales (gastos + ingresos)  
6. Qué quieres hacer ahora (feature o bug) + qué está funcionando y qué no

---

## Consejo práctico

Si no quieres enviar todo de golpe, parte con:

- `src/App.jsx`  
- `src/api.js`  
- `Code.gs`  
- `vite.config.js`  

Con eso ya se puede avanzar mucho, y luego agregas `styles.css` y el resto si hace falta.
