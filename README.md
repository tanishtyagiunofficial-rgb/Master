# Cab Fare

An Android app that works out a cab fare with separate day and night rates and keeps a log of every trip with its date, time and fare.

## What it does

- **Day and night fare.** Each has its own base fare, included distance, per-km rate and waiting charge. The app picks the right one from the clock (night is 10 PM to 6 AM by default), and you can force Day or Night for a single trip.
- **Add trip button.** One tap saves the trip with the current date, time and fare. You can also set a different date and time for a trip you forgot to log.
- **Two ways to set the fare.** Calculate it from distance, waiting time and extras such as toll or parking, or just type the amount.
- **Trip log.** Trips are grouped by day with totals for today, this week and this month. Delete a trip (with undo) or share the whole log as CSV text.
- **Your rates.** Change every rate, the night hours, the currency symbol and rounding on the Rates tab.

Everything is stored on the phone. The app needs no internet and no permissions.

## Get the APK

Every push builds the APK on GitHub Actions.

1. Open the repository's **Actions** tab and pick the latest **Build APK** run.
2. Download the **CabFare-apk** artifact and unzip it.
3. Copy `CabFare.apk` to the phone and open it. Android asks you to allow installs from that source the first time.

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
