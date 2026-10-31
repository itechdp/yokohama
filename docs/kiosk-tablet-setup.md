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
| Admin menu | 7 quick taps in the top-left corner (120 dp square, any 7 within 3 s), then the PIN. Tap just below the system status bar (see "7-tap gesture") |
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
2. Check the menu shows "Kiosk mode is ON" with Change Wi-Fi / Mobile Data / Exit kiosk mode.
3. Tap CLOSE.

### 7b. Other-apps test (operators can only reach YOKOHAMA)

Run after step 7 and again after the reboot. Every launch must fail with error 101 and
`mResumedActivity` must stay YOKOHAMA (`mLockTaskModeState=LOCKED`):

```bash
for a in android.settings.SETTINGS android.settings.WIFI_SETTINGS android.settings.BLUETOOTH_SETTINGS \
         android.settings.APPLICATION_SETTINGS android.intent.action.DIAL; do adb shell am start -a $a; done
adb shell am start -n com.android.chrome/com.google.android.apps.chrome.Main
adb shell am start -a android.intent.action.VIEW -d https://example.com
adb shell monkey -p com.google.android.youtube -c android.intent.category.LAUNCHER 1   # any other installed app
for k in HOME APP_SWITCH BACK MENU SEARCH ASSIST CAMERA CALL CONTACTS CALENDAR EXPLORER; do adb shell input keyevent KEYCODE_$k; done
adb shell input keyevent --longpress KEYCODE_HOME
adb shell input swipe 400 2 400 700 300      # status bar; also swipe from the right edge and the bottom
```

The power-menu long-press (Power off / Restart / Screenshot / Emergency) is allowed on purpose.
The Emergency button opened nothing on the Slate (no dialer, lock held, tested tablet #7).
Tablet #7 results: all of the above blocked, before and after reboot.

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

## 7-tap gesture

`KioskAdmin.onTouch`: the PIN screen opens when any 7 taps in the 120 dp top-left square fall
inside 3 seconds. The window slides (a slow tap no longer restarts the count), taps elsewhere are
ignored rather than resetting it, and a second PIN dialog can't stack. 6 taps, 7 taps spread over
more than 3 s, and taps outside the square do nothing.

**Dead zone:** the system status bar is a real window drawn over the app (Slate: top 32 px;
vivo: ~73 px) and swallows taps there before the app sees them. `setStatusBarDisabled` does not
remove it (tested on the Slate). Tap just under it, where the status strip starts. Tested on the
Slate: 7 taps at 0.15, 0.3, 0.4 and 0.45 s spacing all open it; (3,3) inside the dead zone never does.

## Status strip

A slim native bar at the top of the app (`KioskStatusBar.java`) shows Wi-Fi signal bars, network
name and dBm ("no internet" when not validated, "off" / "not connected" otherwise), and battery
percentage with charging / not charging / full. It updates live and works with no internet.
The network name needs location permission, which `Kiosk.applyPolicies` pre-grants as device
owner. The bars are drawn, not font glyphs: the Slate's font shows glyph bars as a solid block.

Test it over ADB: `adb shell dumpsys battery set level 42` / `set status 3` (not charging) /
`set status 5` (full), then `dumpsys battery reset`; `adb shell svc wifi disable` / `enable`.
Wake the screen first (`input keyevent KEYCODE_WAKEUP`) or screenshots come out blank.

## Day-to-day use

Admin menu: 7 quick taps in the top-left corner, then the PIN.

- **Change Wi-Fi:** opens the Wi-Fi pop-up over the app and the lock stays on. Tapping a secured
  network opens its password dialog and keyboard inside the lock (tested, wrong password shows
  "Check password and try again"). The list reorders as scans finish, so check before tapping. Pick a network,
  tap Done, and YOKOHAMA comes back with Settings blocked again. As a safety net, Settings
  is closed after 3 minutes.
- **Mobile Data:** the admin menu row and the status strip (green ON / red OFF / amber "?" /
  "no SIM") show the real SIM data switch, read per SIM from the telephony stack
  (`MobileData.java`, needs `READ_PHONE_STATE`, which the device owner grants itself). Dual-SIM
  shows each SIM and which one carries data. The state is never guessed: unreadable shows "?".
  The menu re-reads it on every open and the strip updates live. Android lets no app, even a
  device owner, change the switch (tested on Android 10: `setDataEnabled`, `WRITE_SECURE_SETTINGS`
  and `setGlobalSetting` are all refused), so tapping the row opens the system Internet panel in
  the temporary Settings window (3-minute re-lock). Flip "Mobile data" there, tap Done.
  Tested on tablet #11 (Slate, Android 10, Jio SIM in slot 1): OFF/ON via the panel and via
  `svc data`, strip and menu follow, lock and restrictions restored. Dual-SIM and the Vivo are not tested yet.
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
| `KioskStatusBar.java` | Top strip: Wi-Fi signal/name, battery %, charging. Attached in `MainActivity.onCreate`, live while resumed |
| `AdminReceiver.java` | The device-admin component that becomes device owner; applies policies when enabled |
| `KioskRelaunchReceiver.java` | Reopens the app after an update (`MY_PACKAGE_REPLACED`), so the lock isn't dropped |
| `KioskRemoveReceiver.java` | ADB-only `KIOSK_REMOVE` broadcast: clears everything and gives up device owner |
| `AndroidManifest.xml` | `lockTaskMode="if_whitelisted"`, the `.KioskHome` launcher alias (disabled until kiosk mode is on), the receivers, `ACCESS_NETWORK_STATE` |
| `res/xml/device_admin.xml` | Device-admin metadata |

An earlier screen-pinning kiosk was removed in `50f339d`. Don't bring back `KioskLockPlugin`,
`useKioskLock` or the Exit PIN. `supabase/migrations/exit_pin_setting.sql` is still applied
to the database but unused.

## Android 14+ notes (tested on vivo V2556, Android 16)

- **Wi-Fi:** the small Wi-Fi panel lists networks but tapping a secured one does nothing under the
  lock, so `Kiosk.openWifi` opens the full Wi-Fi settings screen on Android 14+. Password page,
  keyboard and Join work. The window also allows the Wi-Fi dialog packages and the keyboard.
  Android 10-13 still use the panel (verified on Android 10).
- **Re-lock timer:** each "Change Wi-Fi" used to start its own 3-minute timer, so an older one could
  close a newer Wi-Fi window mid-password. Only the newest timer runs now.
- **Status strip:** Android 15+ draws edge to edge, so the strip is moved below the system status
  bar by the inset (`KioskStatusBar`). The 7-tap corner gesture: the top ~73 px is the system
  status bar and swallows taps, so tap lower in the corner (e.g. y=110 on a 720x1600 screen).
- **Screenshots:** `adb exec-out screencap` fails on secure pages (PIN dialog, password page).
  Use `adb shell uiautomator dump` and read the text/bounds instead.
- **Lock screen:** after the screen sleeps the normal swipe-up lock screen returns (no PIN set).
  Its phone shortcut and notifications open nothing under the lock. For testing, keep the display
  on with `adb shell svc power stayon usb`, then restore with `svc power stayon false`.
- **Power menu:** the power-button long-press showed no menu on these phones.
- **Other apps:** Chrome, Play Store, Gmail, Maps, Photos, Messages, Contacts/dialer, camera and
  web links are all refused (error 101), before and after reboot.
- **Cleaning up Wi-Fi test entries:** a wrong-password attempt leaves a saved entry for that
  network. `adb shell cmd wifi list-networks` lists IDs; read the SSID next to the ID *before*
  `cmd wifi forget-network <id>`. IDs are not in saved order, and forgetting the wrong one
  deletes the real Wi-Fi password.
- **Status strip text:** the network name shortens with an ellipsis first; signal (dBm) and
  battery text always stay whole (12 sp, tested at 720 px width with "100% not charging").
- **USB hub:** the hub drops devices briefly; re-run `adb devices -l` and use `adb -s <serial>`.

## Limits

- Factory reset from recovery mode (hardware buttons) can't be blocked on Android 10. It
  wipes the tablet; start again at step 0.
- Only Android 10 is tested. The Wi-Fi pop-up needs Android 10+; older versions open the full
  Wi-Fi settings instead. Controlling lock-task features needs Android 9+.
- Opening or sharing exported files (PDF/Excel) in another app is probably blocked, because
  only YOKOHAMA may run. Not tested. If it's needed, add that app's package to
  `setLockTaskPackages` in `Kiosk.applyPolicies`.
- The 3-minute auto-close of Settings after Change Wi-Fi is not tested end to end. While the
  Wi-Fi window is open, Settings can be started over ADB; the allowlist resets when the app resumes.
- Connecting to a phone hotspot and a correct password were not tested (no hotspot or password
  available). A hotspot is an ordinary secured network in the panel. "See more" (full Wi-Fi
  list, needed for hidden networks) opens inside the lock, and its back arrow returns to the
  app (tested on tablet #5, 2026-10-26).
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
| 2 | 2026-10-26 | Slate | 10 (API 29) | 0123456789ABCDEF | Provisioned from clean state (0 accounts, no device owner, app not installed). Steps 1-8 passed. No Wi-Fi at the time, so "Webpage not available" until Wi-Fi is set via the admin menu. Same serial as #1, possibly the same unit re-provisioned |
| 3 | 2026-10-26 | Slate | 10 (API 29) | 0123456789ABCDEF | Second unit, same session; clean state (0 accounts, no device owner, app not installed). Steps 1-8 passed. Had internet at provisioning; app loaded the login page |
| 4 | 2026-10-26 | Slate | 10 (API 29) | 0123456789ABCDEF | Third unit this session; clean state. Steps 1-8 passed. On Wi-Fi "SENTIMENT AI 5G". Screen timeout during a pause blanked the screenshot; `adb shell input keyevent KEYCODE_WAKEUP` before re-testing |
| 5 | 2026-10-26 | Slate | 10 (API 29) | 0123456789ABCDEF | Behind a USB hub (also a LAN adapter). Already device owner with the old app; updated to the status-strip APK. Strip, battery states, Wi-Fi panel, password dialog, reconnect, Settings block, reboot all passed |
| 6 | 2026-10-26 | Slate | 10 (API 29) | 0123456789ABCDEF | Another unit (Wi-Fi MAC 7a:0a:fa:39:73:5c), already device owner with an older app; updated to the status-strip APK. Same tests passed. Boots in landscape; strip fits |
| 7 | 2026-10-26 | Slate | 10 (API 29) | 0123456789ABCDEF | Clean unit (Wi-Fi MAC ce:d7:3f:7e:77:06), behind a hub. Full runbook plus the "other apps" test below passed |
| 8 | 2026-10-26 | vivo V2556 | 16 (API 36) | 10BG7A1LH2003GH | Distinct serial (use `adb -s`). Clean; set up in a hub next to #9. All runbook steps, other-apps test, status strip, Wi-Fi flow (password, wrong-key rejected) and reboot passed. No Wi-Fi saved yet |
| 9 | 2026-10-26 | vivo V2556 | 16 (API 36) | 10BG7B16TK003GL | Same as #8 |
| 10 | 2026-10-26 | vivo V2556 | 16 (API 36) | 10BG6616G1002HB | Clean unit. All steps, other-apps test, Wi-Fi flow (wrong key rejected) and reboot passed. **Its saved office Wi-Fi (SENTIMENT AI 5G) was forgotten by mistake while cleaning up a test entry; re-enter that password via Change Wi-Fi.** A saved "OnePlus Nord CE3 5G" hotspot was not in range, so hotspot connect is still untested |

Tablets #4 and #5 were updated with the status-strip APK on 2026-10-26 (`adb install -r`). Other tablets need the same update. Through a USB hub, `adb devices -l` lists only Android devices; use `ioreg -p IOUSB -w0` to tell a tablet from other hub devices (e.g. a LAN adapter).
