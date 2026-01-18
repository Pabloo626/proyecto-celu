# Retomar el proyecto (PWA Gastos Pareja) — Guía rápida

Esta guía asume:
- Proyecto en tu PC (VS Code) + GitHub repo
- App publicada en GitHub Pages
- Backend: Google Apps Script (Code.gs) + Google Sheets (Entries + Config)
- Variables en `.env.local` (local) y Secrets (GitHub)

---

## 0) Qué es cada parte (en simple)

- **Frontend (tu PC + GitHub):** React/Vite (`src/App.jsx`, `src/api.js`, `src/main.jsx`, `src/styles.css`)
- **Hosting:** GitHub Pages (se actualiza con `git push` + GitHub Actions)
- **Backend/API:** Apps Script (`Code.gs`) expone la URL `/exec`
- **Base de datos:** Google Sheets (hojas `Entries` y `Config`)

---

## 1) En tu PC: abrir el proyecto y correrlo local

1) Abre VS Code en la carpeta del proyecto:
- `C:\Users\adela\Documents\proyecto-celu`

2) Instala dependencias (solo si es primera vez o cambiaste de PC):
```bash
npm install
```

3) Crea/actualiza tu archivo local **`.env.local`** en la raíz del proyecto (NO se sube a Git):
```env
VITE_API_URL=https://script.google.com/macros/s/TU_DEPLOYMENT_ID/exec
VITE_API_TOKEN=token-1234-5678
```

4) Levanta la app en local:
```bash
npm run dev
```

5) Abre en el navegador la URL que te muestra Vite (ej: `http://localhost:5173/`).

---

## 2) En GitHub: publicar cambios (deploy automático)

Cada vez que hagas cambios:

1) Prueba local:
```bash
npm run dev
```

2) Sube cambios:
```bash
git add .
git commit -m "describe el cambio"
git push
```

3) Revisa que el deploy terminó:
- GitHub → Repo → **Actions** → último workflow ✅ verde

4) Abre la app publicada:
- `https://Pabloo626.github.io/proyecto-celu/`

> Si no ves los cambios: recarga dura (Ctrl+Shift+R).  
> Las PWA cachean, a veces hay que recargar.

---

## 3) En Google Apps Script (backend): editar y redeploy

⚠️ IMPORTANTE: Cambiar `Code.gs` en Apps Script NO se hace con `git push` (a menos que uses `clasp`).

Cuando edites Apps Script:

1) Abre tu proyecto en Apps Script (el del Spreadsheet)
2) Pega/edita el código en `Code.gs`
3) Guarda
4) Deploy → **Manage deployments**
5) Edita tu deployment web app → **New version** → Deploy

Luego prueba en el navegador:
- GET meses:
  `.../exec?path=listMonths&token=TU_TOKEN`
- GET config:
  `.../exec?path=getConfig&token=TU_TOKEN`

---

## 4) Google Sheets (BD): estructura esperada

### Hoja `Entries`
Headers (fila 1):
- `id | type | amount | category | profile | date | note | split | createdAt`

### Hoja `Config`
Headers (fila 1):
- `key | value | updatedAt`

Keys típicas:
- `expenseCategories` → JSON array
- `incomeCategories` → JSON array
- `budgets` → JSON object (porcentajes 0..100)

---

## 5) Checklist de “algo no funciona”

### A) “Failed to fetch”
- Revisa que `VITE_API_URL` sea correcta
- Revisa token
- En Apps Script, asegúrate de estar usando el **deployment /exec**
- En frontend, evita enviar `Content-Type: application/json` (Apps Script suele dar problemas CORS)

### B) “Unauthorized (bad token)”
- Token no coincide entre `.env.local`, Secrets y `Code.gs`

### C) “No aparece como PWA”
- `vite.config.js` tiene `base: "/proyecto-celu/"`
- Manifest: `start_url` y `scope` deben ser `/proyecto-celu/`
- Íconos existen en `public/` y no apuntan a `/` raíz

---

## 6) Archivos clave que normalmente se tocan

- `src/App.jsx` (pantallas, lógica)
- `src/api.js` (llamadas a Apps Script, getConfig/setConfig)
- `src/styles.css` (diseño + dark mode)
- `src/main.jsx` (arranque + registerSW)
- `vite.config.js` (PWA + GitHub Pages base)
- Apps Script: `Code.gs` (rutas + Sheets)

---

## 7) Links útiles a guardar

- App (GitHub Pages): `https://Pabloo626.github.io/proyecto-celu/`
- Repo GitHub: `https://github.com/Pabloo626/proyecto-celu`
- Apps Script `/exec`: `https://script.google.com/macros/s/TU_DEPLOYMENT_ID/exec`
