# Installing coin_log

coin_log is an Android app that isn't on the Play Store. Builds are published as GitHub releases.

1. On the phone, open https://github.com/THEDUNGEONS2077/coin_log/releases and download the newest `coin_log-vX.Y.Z.apk`.
2. Open the downloaded file. Android asks to allow installs from your browser the first time: allow it, then install.
3. Updates install over the old version and keep your budget, as long as they're signed with the same key.

## Checking a download
Each release has a `.sha256` file next to the APK. The APK must be signed with this certificate (SHA-256):

```
9C:6B:6E:32:84:0F:81:34:CF:61:88:B9:26:AC:A5:8B:D8:12:BB:E3:E8:91:DD:98:86:99:96:44:6B:A8:82:F0
```

coin_log has no internet permission: nothing you enter ever leaves the phone. Back up from Settings → DATA before uninstalling, because uninstalling deletes the app's data.
