# Contexto del proyecto — Gastos 2026 (Sebas & Male)

## Qué es esto
App de finanzas personales para Sebas y Male. Single-page app en HTML/JS puro con Firebase (Firestore + Auth) y Netlify Functions. Sin frameworks frontend.

## Stack
- Frontend: HTML + CSS + Vanilla JS (todo en `index.html`)
- Backend: Firebase Firestore (realtime), Firebase Auth (Google SSO)
- Functions: Netlify Functions (`/.netlify/functions/`)
  - `sync-sheets` → sincroniza con Google Sheets (`Cargas_App`)
  - `claude` → agente financiero IA (llama a Anthropic API)
- Deploy: Netlify (repo: github.com/sjpouiller/gastos-2026)

## Usuarios autorizados
- sjpouiller@gmail.com (Sebas)
- malelanusse@odiseaswimwear.com.ar (Male)

## Categorías reales
- **Gasto fijo**: ABL/ARBA, Agua envasada, Colegio, CUBA, Cuotas préstamos, Cuotas tarjetas de crédito, Empleada doméstica, Expensas, Impuestos, Internet, Jardinero/Piletero, Obra social/Prepaga, Psicólogo, Seguro auto, Seguro hogar, Servicios (Agua/Gas/Luz/Movistar/Streaming), Otros fijos
- **Gasto variable**: Almuerzos, Bienestar, Cafe, Carniceria, Colegios/útiles, Comida con amigos, Cosas casa, Delivery, Estacionamiento, Farmacia, Gimnasio, Kiosco, Librería, Limpieza, Mantenimiento auto, Nafta, Otros, Peajes, Regalos, Ropa, Salidas a comer, Salidas con los chicos, Supermercado, Suscripciones, Uber/Taxi, Vacaciones, Verduleria, Viajes
- **Ingreso**: Aguinaldo, Freelance, Lanusses, Otros ingresos, Sueldo, Sueldo USD, Venta USD, Venta activos
- **Ahorro**: Ahorro general, Compra USD, Fondo emergencia, Inversiones

## Formas de pago
Transferencia, Efectivo, Tarjeta Credito - VISA Sebas, Tarjeta Credito - MASTER Sebas, Tarjeta Credito - VISA Male, Tarjeta Credito - MASTER Male, Tarjeta Debito, Tarjeta Credito CUOTAS

---

## LISTA DE PENDIENTES (MoSCoW + dificultad)

### 🔴 MUST HAVE — Críticos (arrancar por acá)

1. **Fix emails — PERMISSION_DENIED Firebase** · dif: media
2. **Sync Google Sheets — fix error protección en `Cargas_App`** · dif: media
3. **Bug — Planificador muestra $0**: scope de `anioSel` no accesible desde HTML. Fix: exponer `anioSel` como variable global + forzar re-render del planificador después de que Firebase carga los datos · dif: baja
4. **Agente financiero — ajustar prompt**: no toma ingresos proyectados ni gastos fijos correctamente. Asegurar que lea todos los datos antes de responder · dif: media
5. **Al abrir la app, mostrar el mes en curso** (no el acumulado anual) · dif: baja
6. **Bug — Venta de USD no descuenta pesos de Compra USD**: la compra suma pesos + USD ok, pero la venta solo resta USD y deja los pesos intactos. Fix: espejo simétrico de la lógica de compra · dif: media

### 🟡 SHOULD HAVE — Importantes

7. **Agregar categoría "Cuotas tarjetas de crédito"** — Gastos fijos · dif: baja
8. **Agregar categoría "Psicólogo"** — Gastos fijos · dif: baja
9. **Agregar categoría "Librería"** — Gastos variables · dif: baja
10. **Campo de comentario en carga de gastos** — visible en el movimiento cargado · dif: baja
11. **Favicon — agregar emoji 💰** en pestaña y favoritos · dif: baja
12. **Navegación — reducir bottom nav a 3 items**: Resumen · ➕ Cargar · Movimientos. Cashflow, Presupuesto, Configuración e Inversiones van al drawer · dif: baja
13. **Banners clickeables en inicio**: detalle ingresos (Sebas/Male vs mes ant.), gastos fijos/variables (top 10 + delta $) y saldo neto · dif: media
14. **Configuración — gestión de categorías desde la UI** (agregar, renombrar, eliminar) · dif: media
15. **Configuración — ingresos proyectados por mes** (para que agente y planificador los tomen bien) · dif: media
16. **Exportar datos — PDF, CSV y Excel (.xlsx)**: web descarga directo, mobile usa Web Share API · dif: baja
17. **Botón exportar contextual en cada módulo** (Resumen, Movimientos, Cashflow) · dif: baja
18. **Movimientos — mostrar últimos 2 meses por default** con scroll continuo. Botón "Ver historial completo" tipo extracto bancario · dif: baja
19. **Carga en cuotas**: al cargar en cuotas, generar N movimientos automáticos (1 por mes) en Firebase. Cada cuota hereda tipo y categoría de la compra original. Para cuotas importadas de resúmenes → Gasto variable / Cuotas tarjetas de crédito · dif: media
20. **Presupuesto — sacar tab Planificar**, dejar solo Seguimiento y Editar · dif: baja
21. **Objetivos de ahorro — fusionar con Planificar**: sección superior metas de ahorro, sección inferior "Gastos futuros" para compromisos grandes. Margen mensual visible · dif: media
22. **Saldo USD — mostrar equivalente en ARS al precio de COMPRA blue** vía dolarapi.com. Mostrar cotización del día + variación vs día anterior · dif: baja
23. **Resumen — card Ahorro**: línea "Ahorros totales" accordion (colapsado por default), que consolide pesos + USD a blue · dif: baja
24. **Presupuesto — sugerencia del agente**: propone límites por categoría para llegar al objetivo de ahorro · dif: media
25. **Presupuesto — alertas progresivas**: al llegar al 80% de una categoría a mitad de mes, notificación con monto restante · dif: media

### 🔵 COULD HAVE — Deseables

26. **Cashflow y Planificador — proyectar gastos con inflación** promedio últimos 3 meses (INDEC). Tasa editable por el usuario · dif: media
27. **Configuración — perfil de usuario** (nombre, foto) · dif: baja
28. **Configuración — perfil de inversor** (tolerancia al riesgo, horizonte, instrumentos) · dif: media
29. **Objetivos de ahorro** — crear metas con nombre, emoji, monto, fecha límite, categoría vinculada. Progreso automático · dif: media
30. **Notificaciones** — alertas configurables + recordatorios de carga inteligentes · dif: alta
31. **Onboarding first-time user** — wizard inicial · dif: alta
32. **Personalización de emojis** en el menú · dif: baja
33. **Presupuesto — modo porcentaje**: límites como % de ingresos del mes (escala automáticamente) · dif: media

### ⚪ WON'T NOW — Futuro

34. **Seguimiento de inversiones** — CEDEARs vía API · dif: alta
35. **Vista individual por usuario** (Sebas vs Male por separado) · dif: alta
36. **Exportar datos** — PDF / CSV / Excel del mes/año · dif: media
37. **Carga automática de movimientos** — Fase 1: Galicia. Fase 2: Uala, MP, Santander. Opción A: alertas email + Gmail API. Opción B: importar resumen mensual PDF/CSV · dif: alta
38. **Configuración — sección Integraciones**: conectar bancos/plataformas para carga automática · dif: alta

---

## Diseño / UX acordado (proto v3)

### Navegación
- **Bottom nav** — 3 items: Resumen · ➕ Cargar (centrado, destacado) · Movimientos
- **Drawer** (hamburguesa) — Principal: Resumen, Movimientos, Presupuesto / Análisis: Cashflow, Objetivos de ahorro / Próximamente: Inversiones / Sistema: Configuración
- **FAB 🤖** — agente siempre visible en todas las pantallas
- Títulos dinámicos en topbar con emoji por sección

### Formulario de carga
Campos: Fecha · Tipo · Categoría · Monto · Campo USD (solo para Compra/Sueldo/Venta USD) · Forma de pago · ¿Quién pagó? · Comentario (opcional)
Cuotas: aparece panel cuando se elige "Tarjeta Credito CUOTAS" → cantidad de cuotas (2/3/6/9/12/18) + mes inicio + preview en tiempo real

### Resumen
- Pills de mes funcionales
- Banners clickeables con detalle top 10
- Card Ahorro con accordion (Ahorros totales siempre visible, detalle desplegable hacia abajo)
- Compra USD muestra valuación total del saldo en USD × precio comprador blue
- Cards de Sebas y Male con % variación por ítem vs mes anterior

### Presupuesto
- Solo 2 tabs: Seguimiento y Editar
- Seguimiento incluye: alerta progresiva inteligente + sugerencia del agente con botón "Aplicar"

### Objetivos de ahorro (desde drawer)
- Sección superior: metas de ahorro con progreso visual
- Sección inferior "GASTOS FUTUROS": margen mensual + compromisos (cuotas hardcodeadas de resúmenes bancarios reales)

### Cuotas a vencer (hardcodeadas de resúmenes Abril 2026)
- Mayo 2026: $851.085 (VISA Sebas $405.324 + Master Male $137.483 + VISA Male $308.278)
- Junio 2026: $527.441
- Julio 2026: $479.270
- Agosto 2026: $346.683
- Sep/Oct 2026: $257.658
- Nov+ 2026: $567.299

---

## Orden de trabajo sugerido (Release 1)
1. Bug Planificador $0 (scope anioSel) — rápido, alto impacto
2. Mostrar mes en curso al abrir
3. Agregar categorías nuevas (Cuotas tarjetas, Psicólogo, Librería)
4. Campo comentario en carga
5. Favicon 💰
6. Bug Venta USD
7. Fix emails Firebase
8. Fix sync Google Sheets
9. Ajustar prompt del agente
