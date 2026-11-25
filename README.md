# Cab Fare

An Android app that works out a cab fare with separate day and night rates and keeps a log of every trip with its date, time and fare.

## What it does

- **Day and night fare.** Each has its own base fare, included distance, per-km rate and waiting charge. The app picks the right one from the clock (night is 10 PM to 6 AM by default), and you can force Day or Night for a single trip.
- **Add trip button.** One tap saves the trip with the current date, time and fare. You can also set a different date and time for a trip you forgot to log.
- **Two ways to set the fare.** Calculate it from distance, waiting time and extras such as toll or parking, or just type the amount.
- **Calendar.** A month view where every date shows a small indicator: the total fare for that date, plus a dot for day-fare trips and a dot for night-fare trips. Tap a date to see its trips.
- **Add a fare to any past or present date.** Pick a date on the calendar and add a fare to it. Future dates are blocked.
- **Add fare now.** One button stamps a fare with the exact current date and time.
- **Month total popup.** Tap the month total to see the total fare for the month, the day/night split, fare by date, and the best day.
- **Trip log.** Trips are grouped by day with totals for today, this week and this month. Delete a trip (with undo) or share the whole log as CSV text.
- **Your rates.** Change every rate, the night hours, the currency symbol and rounding on the Rates tab.

Everything is stored on the phone. The app needs no internet and no permissions.

## Get the APK

Every push builds the APK on GitHub Actions.

1. Open the repository's **Actions** tab and pick the latest **Build APK** run.
2. Download the **CabFare-apk** artifact and unzip it.
3. Copy `CabFare.apk` to the phone and open it. Android asks you to allow installs from that source the first time.

### Signing key

So that a new build installs over the old one and keeps your saved trips, the workflow signs the APK with a fixed key held in two repository secrets (Settings > Secrets and variables > Actions):

- `SIGNING_KEYSTORE_BASE64`: the keystore file, base64 encoded (key alias `cabfare`)
- `SIGNING_PASSWORD`: its password

Keep a private backup of both. If the key is lost, later builds can only be installed after uninstalling the app. Without the secrets the build still works but uses a throwaway key and prints a warning.

To build on your own computer, with Android Studio or the Android SDK installed:

```
./gradlew assembleDebug
```

The APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

## Project layout

| Path | What it is |
| --- | --- |
| `app/src/main/assets/` | The app itself: `index.html`, `style.css`, `app.js` and the fare rules in `fare.js` |
| `app/src/main/java/.../MainActivity.java` | Android shell that shows the app, handles the back button and the share sheet |
| `tests/fare.test.js` | Checks for the fare rules, run with `node tests/fare.test.js` |
| `.github/workflows/build-apk.yml` | Builds the APK on every push |

## Default rates

| | Day | Night |
| --- | --- | --- |
| Base fare | ₹50 | ₹65 |
| Distance included | 2 km | 2 km |
| Per km after that | ₹15 | ₹19 |
| Waiting, per minute | ₹1.50 | ₹2 |

These are starting values, not official rates for any city. Set your own on the Rates tab.
