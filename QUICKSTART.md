# 🚀 Quick Start Guide

Get Pomodoro Plus running in under 5 minutes!

## Prerequisites

- Node.js 18 or higher
- Android Studio (for Android)
- A physical Android device or emulator

## Installation

```bash
# 1. Install dependencies (if not already done)
npm install

# 2. Build the app
npm run build

# 3. Open in Android Studio
npx cap open android
```

## Running on Android

### Option A: Physical Device

1. Enable Developer Options on your Android device:
   - Settings > About Phone > Tap "Build Number" 7 times
2. Enable USB Debugging:
   - Settings > Developer Options > USB Debugging
3. Connect your device via USB
4. In Android Studio:
   - Wait for Gradle sync to complete
   - Click the green "Run" button (▶)
   - Select your device

### Option B: Emulator

1. In Android Studio:
   - Tools > Device Manager
   - Create a new Virtual Device
   - Choose a device (e.g., Pixel 5)
   - Select a system image (Android 10+)
   - Click Finish
2. Start the emulator
3. Click the green "Run" button (▶)

## First Time Setup

1. The app opens with a default profile
2. (Optional) Create a test profile:
   - Click "+ New Profile"
   - Name: "Quick Test"
   - Rounds: 2
   - Work: 1 minute
   - Break: 1 minute
   - Save

## Your First Session

1. Select a profile from the dropdown
2. Click "▶ Start Session"
3. Watch the timer count down
4. When phase ends:
   - Phone will vibrate
   - Notification appears
   - Logging modal opens
5. Enter notes and answer questions
6. Click "Save Log" or "Skip"
7. Continue until session completes!

## Troubleshooting

### Build Fails

```bash
# Clean build
cd android
./gradlew clean
cd ..
npm run build
npx cap sync
```

### Notifications Don't Appear

1. Check app permissions:
   - Settings > Apps > Pomodoro Plus > Permissions
   - Enable "Notifications"
2. Disable Do Not Disturb mode
3. Restart the app

### App Won't Open

1. Check Android Studio Logcat for errors
2. Try rebuilding:
   ```bash
   npm run build
   npx cap sync
   ```
3. Clean and rebuild in Android Studio

### Timer Doesn't Update

1. Make sure the app is in foreground
2. Check battery optimization settings:
   - Settings > Battery > Battery Optimization
   - Set Pomodoro Plus to "Don't optimize"

## Development Mode

For faster development iteration:

```bash
# Start dev server (web only - some features limited)
npm run dev

# Then open http://localhost:5173 in browser
```

**Note**: For full testing, always use the Android build.

## Next Steps

- Read [README.md](./README.md) for full feature documentation
- Check [TESTING.md](./TESTING.md) for testing guide
- Customize your profiles
- Start being more productive!

## Support

If you encounter issues:

1. Check the Logcat output in Android Studio
2. Verify all Capacitor plugins are synced: `npx cap sync`
3. Ensure Android permissions are granted
4. Try on a different device/emulator
5. Check that you're using Node.js 18+

---

Happy Pomodoro-ing! 🍅✨
