# Empaquetado nativo iOS / Android (Capacitor)

Esta app está configurada con [Capacitor](https://capacitorjs.com/) para
generar binarios instalables (`.apk` / `.aab` para Android, `.ipa` para iOS)
y subirlos a Google Play y App Store.

El contenedor nativo carga la URL publicada de Lovable
(`https://easconnect.lovable.app`). Esto significa que **publicar desde
Lovable actualiza el contenido de la app sin recompilar el binario**. Solo
hace falta recompilar cuando cambias íconos, splash, permisos o plugins
nativos.

---

## Requisitos previos

| Plataforma | Necesitas |
|---|---|
| Android | [Android Studio](https://developer.android.com/studio) + JDK 17 |
| iOS | macOS + [Xcode](https://developer.apple.com/xcode/) + cuenta Apple Developer ($99/año) |
| Google Play | Cuenta Google Play Console ($25 pago único) |

---

## 1. Clonar el repo en tu equipo

```bash
git clone <tu-repo>
cd <repo>
bun install
```

## 2. Generar build web (placeholder)

Aunque la app carga desde la URL remota, Capacitor exige una carpeta `dist/`:

```bash
mkdir -p dist && echo "<!doctype html><title>EA Service</title>" > dist/index.html
```

## 3. Añadir las plataformas (solo la primera vez)

```bash
# Android
npx cap add android

# iOS (solo macOS)
npx cap add ios
```

## 4. Sincronizar configuración

Cada vez que cambies `capacitor.config.ts`, íconos o plugins:

```bash
npx cap sync
```

## 5. Abrir el proyecto nativo

```bash
npx cap open android   # Abre Android Studio
npx cap open ios       # Abre Xcode
```

## 6. Generar instalables

### Android (`.apk` para distribución directa, `.aab` para Play Store)

1. En Android Studio: **Build → Generate Signed Bundle / APK**.
2. Crea (o reutiliza) un *keystore* y guárdalo en lugar seguro.
3. Para Play Store elige **Android App Bundle (.aab)**.
4. Para instalación directa elige **APK** y compártelo.

### iOS (`.ipa` para TestFlight / App Store)

1. En Xcode selecciona el target y firma con tu Apple Developer Team.
2. **Product → Archive**.
3. En el Organizer: **Distribute App → App Store Connect** (o **Ad Hoc** para `.ipa` instalable).

---

## Apuntar a la preview durante desarrollo

```bash
CAP_SERVER_URL="https://id-preview--<id>.lovable.app" npx cap sync
```

## Identificadores

- **Bundle ID / Application ID:** `app.easervice.connect`
- **Nombre visible:** `EA Service Connect`

Cámbialos en `capacitor.config.ts` antes del primer `cap add` si necesitas otro
espacio de nombres (afecta los listados de las tiendas).

---

## Notas importantes

- **iOS solo se compila en macOS** (limitación de Apple).
- Los íconos y splash se generan con `@capacitor/assets`:
  ```bash
  bun add -d @capacitor/assets
  npx capacitor-assets generate --iconBackgroundColor "#0F172A" --splashBackgroundColor "#0F172A"
  ```
  Coloca `assets/icon.png` (1024×1024) y `assets/splash.png` (2732×2732) antes de ejecutarlo.
- Apple suele tardar 24–48 h en revisar; Google Play horas a 1 día.
- Cambios solo-web no requieren reenviar a las tiendas: basta con republicar en Lovable.