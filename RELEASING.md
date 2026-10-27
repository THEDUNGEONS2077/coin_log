# Releasing coin_log

This covers how release builds are signed, built, checked and published. It's quest_log's process, with coin_log's own key.

## Signing key (critical)

Android only installs an update over an existing app if **both are signed with the same key**. If the key is lost, updating means uninstalling first, and **uninstalling deletes the budget**.

- **Keystore:** `~/.coin_log/release.keystore` (alias `coinlog`). It lives **outside the repo** and is never committed.
- **Passwords:** stored in `~/.gradle/gradle.properties`, which is never committed:
  ```properties
  COINLOG_STORE_FILE=/home/<user>/.coin_log/release.keystore
  COINLOG_STORE_PASSWORD=...
  COINLOG_KEY_ALIAS=coinlog
  COINLOG_KEY_PASSWORD=...
  ```
- **Backups:** keep the keystore file **and** its password in two places, for example a password manager and an encrypted USB drive.
- `plugins/withReleaseSigning.js` reads these properties. If any is missing, the release build **fails** rather than producing a debug-signed APK.
- **Certificate fingerprint (SHA-256):** `9C:6B:6E:32:84:0F:81:34:CF:61:88:B9:26:AC:A5:8B:D8:12:BB:E3:E8:91:DD:98:86:99:96:44:6B:A8:82:F0` (also in INSTALL.md and `scripts/release-android.sh`).

### Restoring on a new computer
1. Set up the toolchain (see `CLAUDE.md` → Environment).
2. Copy the keystore back to `~/.coin_log/release.keystore`.
3. Recreate the four `COINLOG_*` lines in `~/.gradle/gradle.properties`.
4. Build a release and check that the fingerprint matches: `apksigner verify --print-certs <apk>`.

## Releasing a version
1. Bump `version.json`: `versionName` (semver) and `versionCode` (**must increase**, or the phone refuses the update).
2. Add a `## <versionName> (build <versionCode>)` section to `CHANGELOG.md`. It becomes the release notes and the in-app **What's new** (`npm run changelog` regenerates `assets/changelog.json`, and a test fails if you forget).
3. Commit and push, then run:
   ```bash
   scripts/release-android.sh                       # draft release: review it on GitHub, then publish
   scripts/release-android.sh --prerelease --publish  # a test build, published straight away
   scripts/release-android.sh --verify-only          # build + every check, publish nothing
   ```
   The script stops, and publishes nothing, unless every check passes:
   - the tree is clean and pushed, the tag is new, and `versionCode` is above every released build
   - `npm run check` passes (types, lint, tests)
   - the APK is signed with the release key (its fingerprint matches)
   - the permissions exactly match the allow-list (vibration only), so a library can't sneak in INTERNET or storage access
   - the APK is arm64 only, under 25 MB, with a JS bundle under 4 MB
4. Install from: `https://github.com/THEDUNGEONS2077/coin_log/releases/latest` (pre-releases are listed on the releases page).

## Versioning
- `version.json` is the single source of truth. `versionCode` **must increase** for every build that's installed.
- Add a matching section to `CHANGELOG.md` for every version.
