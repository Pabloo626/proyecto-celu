Hola. Estoy desarrollando una PWA instalable (iPhone/Android) para registrar gastos e ingresos en pareja.

Stack:

* Frontend: React + Vite
* PWA: vite-plugin-pwa
* Hosting: GitHub Pages (base path /proyecto-celu/)
* Backend/API: Google Apps Script (Code.gs) expuesto como Web App en una URL /exec
* Base de datos: Google Sheets con dos hojas: Entries (movimientos) y Config (categorías y porcentajes)

Funcionamiento actual:

* La app guarda y lee datos desde Google Sheets mediante Apps Script.
* Hay perfiles: pablo y maria_ignacia.
* Movimientos: expense e income.
* Existe un endpoint de configuración ya funcionando:

  * GET ?path=getConfig&token=... devuelve expenseCategories, incomeCategories y budgets (porcentajes 0..100).
* El token existe y se usa como variable de entorno; no lo publiques.

Reglas:

* Todo cambio que afecte a ambos usuarios debe quedar en la nube (Google Sheets/Config), no solo local.
* Quiero cambios concretos con código listo para copiar y pegar y pasos de prueba (local y en GitHub Pages).

Te adjunto estos archivos:

1. src/App.jsx
2. src/api.js
3. src/main.jsx
4. vite.config.js
5. src/styles.css
6. Code.gs

Lo que quiero hacer ahora:
(Escribo aquí el cambio, mejora o bug)
Objetivo:
Cómo debería verse:
Criterios de listo:

Por favor analiza el código y dime exactamente qué editar o agregar en frontend, Apps Script y Google Sheets si aplica.
