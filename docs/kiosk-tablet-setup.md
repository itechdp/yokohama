# Kiosk tablet setup - runbook

Locks an Android tablet so it only runs the YOKOHAMA app. Follow this when a new tablet is
connected and the user asks to "turn on kiosk mode". Verified end to end on tablet #1
(Slate, Android 10) on 2026-10-18 - see "Provisioned tablets" at the bottom.

Code: `android/app/src/main/java/com/itechdp/yokohama/` (`Kiosk*.java`, `AdminReceiver.java`,
`MainActivity.java`) and `android/app/src/main/AndroidManifest.xml`.

## Quick reference

| | |
|---|---|
| App package | `com.itechdp.yokohama` |
| Device-owner component | `com.itechdp.yokohama/.AdminReceiver` |
| Admin menu | 7 quick taps in the top-left corner (100 dp square, within 3 s), then the PIN |
| Admin PIN | `3007` (`ADMIN_PIN` in `KioskAdmin.java`) |
| APK | `android/app/build/outputs/apk/release/app-release.apk` |
| Release cert SHA-256 | `403d594d4ed2b6dfb81bf1beeee4cc759f7ba76d620c4e4cdd0480b7b9972b05` |
| Website part | Loaded live from `https://yokohama-rho.vercel.app` (`capacitor.config.ts`) |

## How it works

One ADB command makes the app the tablet's **device owner**. Android only allows this when
the tablet has no accounts. As device owner the app runs itself in **lock task mode**: no home
screen, recents, status bar, Settings or other apps. It also registers itself as the launcher,
so it opens on boot. It blocks Safe Mode, factory reset from Settings and adding users, and
pre-grants the camera for the QR scanner.

A hidden native admin menu changes Wi-Fi without leaving the lock, or turns the lock off and
on. The menu works with no internet because it isn't part of the website. The lock survives
reboots and app updates.

## Runbook: "turn on kiosk mode" on a new tablet

Connect ONE tablet at a time. Cheap tablets often share the serial `0123456789ABCDEF`.

### 0. What the user must do on the tablet (Claude can't)

1. Brand-new tablet: finish the setup wizard **without** signing in to Google (skip it).
   Already set up: accounts get removed in step 2.
2. Settings → About tablet → tap **Build number** 7 times (Xiaomi: MIUI/HyperOS version).
   Then Developer options (under System) → turn on **USB debugging**.
3. Plug it into the Mac with a **data** cable, straight into the Mac (no hub).
   - On the Mac, answer "Allow accessory to connect?" with Allow. The setting is in System
     Settings → Privacy & Security → Accessories.
   - On the tablet, answer "Allow USB debugging?" by ticking "Always allow", then OK.
4. Connect the tablet to the site's Wi-Fi now. It's easier than doing it from the admin menu
   later.

### 1. Connect

```bash
adb devices -l        # want: <serial>   device   ... model:<model>
```

- **Empty list:** run `ioreg -p IOUSB -w0`. If the tablet isn't listed there either, macOS
  doesn't see it at all. The cause is a charge-only cable, a hub, or a denied accessory
  prompt. macOS needs no ADB driver.
- **`unauthorized`:** accept the prompt on the tablet.

### 2. Preflight

```bash
adb shell getprop ro.build.version.release                     # Android version (tested: 10)
adb shell dumpsys account | grep -E "Accounts:|Account \{"     # must be "Accounts: 0"
adb shell pm list users                                        # must be only user 0
adb shell dumpsys device_policy | grep -A1 "Device Owner"      # must print nothing
adb shell pm list packages | grep -iE "yokohama|kiosk|fully"
```

- **Accounts > 0:** open the screen with `adb shell am start -a android.settings.SYNC_SETTINGS`
  and ask the user to remove each account (account → Remove account). Tell them the Play
  Store stops working on that tablet; updates go through ADB.
- **Another kiosk/MDM app** (e.g. Fully Single App Kiosk, `com.fullykiosk.singleapp`): ask the
  user, then run `adb uninstall <package>`. If it is itself the device owner, it must be
  released from its own settings, or the tablet factory-reset (back to step 0).
- **Android older than 10:** untested, see Limits.

### 3. Build the APK

Only needed if `android/` changed since the last build, or there is no APK. See "Building the
APK". It takes about a minute, so rebuild when unsure.

### 4. Install

YOKOHAMA not installed:

```bash
adb install android/app/build/outputs/apk/release/app-release.apk
```

YOKOHAMA already installed: check which key signed it.

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
P=$(adb shell pm path com.itechdp.yokohama | head -1 | cut -d: -f2 | tr -d '\r')
adb pull "$P" <scratchpad>/installed.apk
/opt/homebrew/share/android-commandlinetools/build-tools/36.0.0/apksigner verify --print-certs <scratchpad>/installed.apk | grep SHA-256
```

- **Digest matches the release cert:** run `adb install -r <apk>`. Staff stay logged in.
- **Different digest:** this is the case for `Crown-debug.apk` and `CrownPvtLtd.apk` in the
  repo root, which are signed with other keys. Run `adb uninstall com.itechdp.yokohama`, then
  `adb install <apk>`. Staff log in again; their data is in Supabase.

### 5. Make YOKOHAMA the device owner

```bash
adb shell dpm set-device-owner com.itechdp.yokohama/.AdminReceiver
# want: Success: Device owner set to package ComponentInfo{com.itechdp.yokohama/com.itechdp.yokohama.AdminReceiver}
adb shell am start -n com.itechdp.yokohama/.MainActivity
```

### 6. Verify (all must pass)

```bash
adb shell dumpsys activity activities | grep -E "mResumedActivity|mLockTaskModeState"
#   mResumedActivity ... com.itechdp.yokohama/...   and   mLockTaskModeState=LOCKED
adb shell cmd package resolve-activity --brief -c android.intent.category.HOME -a android.intent.action.MAIN | tail -1
#   com.itechdp.yokohama/.KioskHome
adb shell dumpsys user | grep -iE "no_safe_boot|no_factory_reset|no_add_user"
#   all three listed
adb shell dumpsys package com.itechdp.yokohama | grep "android.permission.CAMERA: granted"
#   granted=true
adb shell input keyevent KEYCODE_HOME; adb shell input keyevent KEYCODE_APP_SWITCH
adb shell am start -a android.settings.SETTINGS
#   "Error: Activity not started, unknown error code 101"   (101 = blocked by the lock = good)
adb shell dumpsys activity activities | grep mResumedActivity      # still YOKOHAMA
```

### 7. Test the admin menu

One `input tap` takes about 0.7 s, so seven in a row take longer than the 3 s window. Send
them in parallel instead:

```bash
adb shell 'for i in 1 2 3 4 5 6 7; do input tap 40 40 & sleep 0.15; done; wait'
adb exec-out screencap -p > <scratchpad>/pin.png     # Read it: the "Admin" PIN dialog
adb shell input text 3007
```

1. Take a fresh screenshot and tap **OK** at the position it shows. Don't press Enter; that
   moves focus to Cancel.
   - The tablet rotates, so the position changes. On the Slate (800x1280), OK was at about
     (639, 455-479) in portrait and (911, 239) in landscape.
2. Check the menu shows "Kiosk mode is ON" with Change Wi-Fi / Exit kiosk mode.
3. Tap CLOSE.

### 8. Reboot test

```bash
adb reboot && adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; do sleep 3; done; sleep 20
adb shell dumpsys activity activities | grep -E "mResumedActivity|mLockTaskModeState"
#   com.itechdp.yokohama/.KioskHome ...   and   mLockTaskModeState=LOCKED
```

### 9. Finish

- Tell the user it's locked, plus the gesture and PIN.
- Add a row to "Provisioned tablets" below.

## Day-to-day use

Admin menu: 7 quick taps in the top-left corner, then the PIN.

- **Change Wi-Fi:** opens the Wi-Fi pop-up over the app and the lock stays on. Pick a network,
  tap Done, and YOKOHAMA comes back with Settings blocked again. As a safety net, Settings
  is closed after 3 minutes.
- **Exit kiosk mode:** the lock is off, the normal launcher is back and the restrictions are
  lifted. The app stays device owner.
- **Start kiosk mode:** open YOKOHAMA, then admin menu → Start kiosk mode.
- **No internet:** the website part shows "Webpage not available", but the admin menu still
  works. Once Android reports the network as validated (really online), the app reloads by
  itself. It only reloads when the app had failed to load, never in the middle of someone's
  work.

## Updating tablets

- **Website changes (`src/`):** deploy to Vercel. Tablets pick them up on the next load; no
  APK is needed.
- **Native changes (`android/`) or a new PIN:** rebuild, then run `adb install -r <apk>` on
  every tablet. The app reopens itself, locked, after the update.
  - The APK must be signed with the release key. A device-owner app can't be updated by an
    APK with another key, and it can't be uninstalled until it's released (below).
- **PIN:** edit `ADMIN_PIN` in `KioskAdmin.java`, rebuild, and install on every tablet. Each
  tablet keeps the PIN that was in the APK it has.

## Removing kiosk mode completely

Use this to uninstall the app or hand the tablet back.

```bash
adb shell am broadcast -a com.itechdp.yokohama.KIOSK_REMOVE -p com.itechdp.yokohama
adb shell dumpsys device_policy | grep -A1 "Device Owner"      # want: prints nothing
```

Only ADB can send this: the receiver requires the DUMP permission, which only the shell
holds. **Not yet tested on a device.** Verify it the first time it's needed and update this
doc. After it works, `adb uninstall com.itechdp.yokohama` is possible. To lock the tablet
again, repeat steps 5-8.

## Building the APK (this Mac)

Set up on 2026-10-18:
- Java 21 (Homebrew `openjdk@21`).
- Android SDK in `/opt/homebrew/share/android-commandlinetools`: platform 36 and build-tools
  36.0.0, plus 35.0.0, which Gradle added itself.

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
cd android && ./gradlew assembleRelease
```

- Gradle was run with the sandbox disabled; it needs the network and `~/.gradle`.
- Signing is automatic: `android/keystore.properties` points to
  `android/yokohama-release-key.jks`.
- **Fresh clone:** create `android/local.properties` with
  `sdk.dir=/opt/homebrew/share/android-commandlinetools`. Then run `npm install`,
  `npm run build` and `npx cap sync android`. The last one generates
  `android/capacitor-cordova-android-plugins/`. Both that folder and `local.properties` are
  gitignored.
- **Gradle download:** Gradle 8.14.3 is cached in `~/.gradle/wrapper/dists/`. If that cache is
  ever cleared, the download will time out: one GitHub download server (185.199.109.133) is
  unreachable from this network, and Java keeps picking it. Fix:
  1. Delete the `.part` file in `~/.gradle/wrapper/dists/gradle-8.14.3-all/<hash>/`.
  2. Download the zip there with curl:
     `curl -L --resolve release-assets.githubusercontent.com:443:185.199.108.133 -o <that dir>/gradle-8.14.3-all.zip https://services.gradle.org/distributions/gradle-8.14.3-all.zip`
  3. Build again.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `dpm set-device-owner`: "...already some accounts on the device" | An account is signed in | Remove all accounts (step 2) |
| `dpm set-device-owner`: "...already several users on the device" | Extra user or guest | Remove it in Settings → System → Multiple users |
| `dpm set-device-owner`: "...device owner is already set" | Another kiosk/MDM app owns the tablet | Release it in that app, or factory reset and start at step 0 |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | Installed app signed with another key | Not device owner yet: uninstall, then install. Device owner: `KIOSK_REMOVE` first |
| `DELETE_FAILED_DEVICE_POLICY_MANAGER` on uninstall | App is device owner | `KIOSK_REMOVE` first |
| `unknown error code 101` when starting an activity | The lock blocked it | Expected |
| PIN dialog doesn't appear when testing over ADB | Taps too slow | Parallel taps (step 7) |
| Home key ignored for a few seconds | Happens right after `am force-stop` | Avoid force-stop; use `adb shell am start -a android.intent.action.MAIN -c android.intent.category.HOME` |
| "Webpage not available" | No internet | Admin menu → Change Wi-Fi; the app reloads by itself once online |
| Tablet doesn't rejoin Wi-Fi by itself | Weak signal (tablet #1: -83 to -86 dBm) | Rejoin via Change Wi-Fi; move it nearer the router |
| Two tablets with the same serial | Cheap tablets share `0123456789ABCDEF` | Connect one at a time, or use `adb -t <transport_id>` from `adb devices -l` |

## Code map

| File | Role |
|---|---|
| `Kiosk.java` | All lock logic: device-owner check, applying/clearing policies (lock-task allowlist, launcher alias, restrictions, camera grant), start/stop, the Wi-Fi window, full removal. On/off state lives in SharedPreferences `kiosk` / `enabled` (default on) |
| `KioskAdmin.java` | Hidden gesture, PIN dialog, admin menu. `ADMIN_PIN`, tap count, time window, corner size |
| `MainActivity.java` | Applies policies on create, re-locks on every resume, passes touches to `KioskAdmin`, reloads the WebView once the network is VALIDATED after a failed load |
| `AdminReceiver.java` | The device-admin component that becomes device owner; applies policies when enabled |
| `KioskRelaunchReceiver.java` | Reopens the app after an update (`MY_PACKAGE_REPLACED`), so the lock isn't dropped |
| `KioskRemoveReceiver.java` | ADB-only `KIOSK_REMOVE` broadcast: clears everything and gives up device owner |
| `AndroidManifest.xml` | `lockTaskMode="if_whitelisted"`, the `.KioskHome` launcher alias (disabled until kiosk mode is on), the receivers, `ACCESS_NETWORK_STATE` |
| `res/xml/device_admin.xml` | Device-admin metadata |

An earlier screen-pinning kiosk was removed in `50f339d`. Don't bring back `KioskLockPlugin`,
`useKioskLock` or the Exit PIN. `supabase/migrations/exit_pin_setting.sql` is still applied
to the database but unused.

## Limits

- Factory reset from recovery mode (hardware buttons) can't be blocked on Android 10. It
  wipes the tablet; start again at step 0.
- Only Android 10 is tested. The Wi-Fi pop-up needs Android 10+; older versions open the full
  Wi-Fi settings instead. Controlling lock-task features needs Android 9+.
- Opening or sharing exported files (PDF/Excel) in another app is probably blocked, because
  only YOKOHAMA may run. Not tested. If it's needed, add that app's package to
  `setLockTaskPackages` in `Kiosk.applyPolicies`.
- The 3-minute auto-close of Settings after Change Wi-Fi is not tested end to end.
- The PIN is readable in the source code and the APK.
- The release keystore and its passwords are committed to this repo
  (`android/keystore.properties`, `android/yokohama-release-key.jks`), so keep the repo
  private.
  - If the key is ever lost, installed tablets can't be updated. Each one would need
    `KIOSK_REMOVE`, an uninstall, a reinstall and steps 5-8.

## Provisioned tablets

| # | Date | Model | Android | Serial | Notes |
|---|---|---|---|---|---|
| 1 | 2026-10-18 | Slate | 10 (API 29) | 0123456789ABCDEF | Google account removed; Fully Single App Kiosk uninstalled; weak Wi-Fi where it was tested |
