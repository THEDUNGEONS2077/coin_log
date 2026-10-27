/**
 * __tests__/config.test.ts: checks that app.config.ts produces the right
 * app for each build variant.
 *
 * These guarantees matter because they can't be fixed after the app is
 * installed: the release package ID is permanent, and the release build must
 * never keep INTERNET or ship unsigned.
 */
import { buildConfig, getVariant } from '../app.config';
import version from '../version.json';

/** The plugin entries as plain names (strings or the first item of [name, options]). */
const pluginNames = (variant: 'dev' | 'release') => (buildConfig(variant).plugins ?? []).map((p) => (Array.isArray(p) ? p[0] : p));

describe('getVariant', () => {
  it('defaults to dev so `expo start` never builds release config by accident', () => {
    expect(getVariant({})).toBe('dev');
  });

  it('rejects unknown variants', () => {
    expect(() => getVariant({ APP_VARIANT: 'prod' })).toThrow(/APP_VARIANT/);
  });
});

describe('release variant', () => {
  const cfg = buildConfig('release');

  it('uses the permanent app ID and the plain name', () => {
    expect(cfg.android?.package).toBe('com.thedungeons2077.coinlog');
    expect(cfg.ios?.bundleIdentifier).toBe('com.thedungeons2077.coinlog');
    expect(cfg.name).toBe('coin_log');
    expect(cfg.scheme).toBe('coinlog');
  });

  it('signs with the release key', () => {
    expect(pluginNames('release')).toContain('./plugins/withReleaseSigning');
  });

  it('blocks INTERNET and every unused default permission', () => {
    expect(cfg.android?.blockedPermissions).toEqual(
      expect.arrayContaining([
        'android.permission.INTERNET',
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
      ]),
    );
  });

  it('requests only vibration (no notifications, no storage)', () => {
    expect(cfg.android?.permissions).toEqual(['android.permission.VIBRATE']);
    expect(pluginNames('release')).not.toContain('expo-notifications');
  });

  it('takes its version from version.json', () => {
    expect(cfg.version).toBe(version.versionName);
    expect(cfg.android?.versionCode).toBe(version.versionCode);
  });
});

describe('dev variant', () => {
  const cfg = buildConfig('dev');

  it('installs side by side with release', () => {
    expect(cfg.android?.package).toBe('com.thedungeons2077.coinlog.dev');
    expect(cfg.name).toBe('coin_log DEV');
    expect(cfg.scheme).toBe('coinlog-dev');
    expect(cfg.icon).toContain('-dev');
  });

  it('keeps INTERNET (needed for Metro) and the debug key', () => {
    expect(buildConfig('dev').android?.blockedPermissions).toEqual([]);
    expect(pluginNames('dev')).not.toContain('./plugins/withReleaseSigning');
  });
});

describe('E2E test build (COINLOG_E2E=1)', () => {
  // Automated tests clear app data: they must run against a separate app,
  // never the real one with the user's budget.
  const withE2E = (fn: () => void) => {
    process.env.COINLOG_E2E = '1';
    try {
      fn();
    } finally {
      delete process.env.COINLOG_E2E;
    }
  };

  it('is a separate app: own package, name and scheme', () => {
    withE2E(() => {
      const cfg = buildConfig('release');
      expect(cfg.android?.package).toBe('com.thedungeons2077.coinlog.e2e');
      expect(cfg.name).toBe('coin_log E2E');
      expect(cfg.scheme).toBe('coinlog-e2e');
    });
  });

  it('never changes the real release without the flag', () => {
    expect(buildConfig('release').android?.package).toBe('com.thedungeons2077.coinlog');
  });
});
