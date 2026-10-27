/**
 * app.config.ts: Expo app configuration for every build variant.
 *
 * APP_VARIANT selects the variant:
 *   dev     → com.thedungeons2077.coinlog.dev, "coin_log DEV", DEV icon,
 *             JS from Metro, INTERNET kept (needed to reach Metro).
 *   release → com.thedungeons2077.coinlog, "coin_log", bundled Hermes
 *             bytecode, INTERNET removed, R8 on, signed with the release key.
 * The two install side by side, so daily dev never touches the real budget.
 *
 * Same structure as quest_log's config (the app coin_log is built from),
 * without reminders: coin_log has no notifications (PLAN D24), so it needs no
 * notification, alarm or boot permissions.
 *
 * android/ and ios/ are generated from this file by `expo prebuild` and are
 * never edited by hand; native changes go through /plugins.
 */
import type { ConfigContext, ExpoConfig } from 'expo/config';

import version from './version.json';

/** The two supported build variants. */
type Variant = 'dev' | 'release';

/**
 * Reads APP_VARIANT. Defaults to `dev` so plain `npx expo start` never
 * produces release config by accident. Unknown values fail loudly.
 */
export function getVariant(env: Record<string, string | undefined> = process.env): Variant {
  const v = env.APP_VARIANT ?? 'dev';
  if (v !== 'dev' && v !== 'release') {
    throw new Error(`APP_VARIANT must be "dev" or "release", got "${v}"`);
  }
  return v;
}

/** Base app ID. Permanent once installed; never change it (updates need the same ID). */
const APP_ID = 'com.thedungeons2077.coinlog';
const BLACK = '#000000';
/** The theme's accent yellow (theme/colors.ts). Duplicated here: this file runs in Node and can't import the theme. */
const ACCENT = '#FFD60A';

/**
 * Android permissions the app requests:
 *   VIBRATE   haptics
 * That's all: no notifications, no storage (backups go through the system
 * file pickers), no internet.
 */
export const ANDROID_PERMISSIONS = ['android.permission.VIBRATE'];

/**
 * Permissions removed from the final release manifest, even when a library
 * declares them. Checked by __tests__/config.test.ts and, on the built APK,
 * by `aapt2 dump permissions` (scripts/release-android.sh).
 */
export const RELEASE_BLOCKED_PERMISSIONS = [
  'android.permission.INTERNET',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.ACCESS_NETWORK_STATE',
  // Play install attribution: no tracking of any kind.
  'com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE',
];

/**
 * Builds the Expo config for one variant. Exported separately from the
 * default export so __tests__/config.test.ts can check each variant.
 */
export function buildConfig(variant: Variant, base: Partial<ExpoConfig> = {}): ExpoConfig {
  const isDev = variant === 'dev';
  // COINLOG_E2E=1: a release build installed as a separate test app ("coin_log E2E",
  // own package and scheme), so automated tests that clear app data can never touch
  // the real budget. Never published.
  const isE2E = !isDev && process.env.COINLOG_E2E === '1';
  const appId = isDev ? `${APP_ID}.dev` : isE2E ? `${APP_ID}.e2e` : APP_ID;
  // The dev icon set has a "DEV" label under the mark.
  const icon = (name: string) => `./assets/icon/${name}${isDev ? '-dev' : ''}.png`;

  return {
    ...base,
    name: isDev ? 'coin_log DEV' : isE2E ? 'coin_log E2E' : 'coin_log',
    slug: 'coin_log',
    // version.json is the single source of truth for versions (RELEASING.md).
    version: version.versionName,
    // The dev build uses a separate scheme so links never open the wrong install.
    scheme: isDev ? 'coinlog-dev' : isE2E ? 'coinlog-e2e' : 'coinlog',
    orientation: 'portrait',
    userInterfaceStyle: 'dark',
    backgroundColor: BLACK,
    icon: icon('icon'),

    android: {
      package: appId,
      versionCode: version.versionCode,
      adaptiveIcon: {
        foregroundImage: icon('adaptive-foreground'),
        monochromeImage: icon('monochrome'),
        backgroundColor: BLACK,
      },
      // Android back steps out of sheets and pages first; the predictive-back
      // animation would preview leaving the app instead.
      predictiveBackGestureEnabled: false,
      // Explicit allow-list. Without it, Expo adds a default set (storage,
      // SYSTEM_ALERT_WINDOW, …) that coin_log never uses.
      permissions: ANDROID_PERMISSIONS,
      // Release only: strip anything a library manifest merges back in.
      // INTERNET removal makes the app physically unable to go online; the
      // dev build keeps INTERNET for Metro and the overlay permission for the
      // dev menu.
      blockedPermissions: isDev ? [] : RELEASE_BLOCKED_PERMISSIONS,
    },

    ios: {
      // Unused for now (Android-first); kept so the IDs line up if it's ever ported.
      bundleIdentifier: appId,
      buildNumber: String(version.versionCode),
      supportsTablet: false,
    },

    plugins: [
      'expo-router',

      // Embed fonts at build time: no runtime loading, so text is styled on
      // the first frame. Family name = file name without extension.
      [
        'expo-font',
        {
          fonts: [
            './assets/fonts/JetBrainsMono-Regular.ttf',
            './assets/fonts/JetBrainsMono-Medium.ttf',
            './assets/fonts/JetBrainsMono-Bold.ttf',
          ],
        },
      ],

      // Black splash with the yellow mark; no white flash on any Android
      // version (this also configures the Android 12+ splash screen API).
      [
        'expo-splash-screen',
        {
          image: './assets/icon/splash.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: BLACK,
          dark: { image: './assets/icon/splash.png', backgroundColor: BLACK },
        },
      ],

      // Native build settings (same as quest_log, PERF budgets in RELEASING.md).
      [
        'expo-build-properties',
        {
          android: {
            // arm64 only: smaller APKs and faster builds. Covers essentially
            // every phone from recent years. COINLOG_ABIS overrides it, e.g.
            // for an x86_64 emulator build.
            buildArchs: (process.env.COINLOG_ABIS ?? 'arm64-v8a').split(','),
            // R8 code shrinking plus resource shrinking for release.
            enableMinifyInReleaseBuilds: true,
            enableShrinkResourcesInReleaseBuilds: true,
            // Store native libraries compressed in the APK: roughly 10 MB less
            // to download, at the cost of a slightly larger install.
            useLegacyPackaging: true,
          },
        },
      ],

      // Release only: sign with the local release key (RELEASING.md).
      ...(isDev ? [] : ['./plugins/withReleaseSigning']),
    ],

    // Web build: a local test harness only (the same screens in a browser,
    // driven by e2e/web); it's never deployed.
    web: {
      bundler: 'metro',
      output: 'single',
      name: 'coin_log',
      shortName: 'coin_log',
      themeColor: BLACK,
      backgroundColor: BLACK,
    },

    experiments: {
      typedRoutes: true,
    },

    extra: {
      // Shown in Settings as "v0.1.0 (build 1)".
      variant,
      versionName: version.versionName,
      versionCode: version.versionCode,
      // The notification-color check in __tests__/theme.test.ts reads ACCENT from this file.
      accent: ACCENT,
    },
  };
}

/** Entry point Expo calls when reading the config. */
export default ({ config }: ConfigContext): ExpoConfig => buildConfig(getVariant(), config);
