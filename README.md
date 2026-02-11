# 🍅 Pomodoro Plus

An advanced Pomodoro timer app built with Remix and Capacitor, featuring customizable profiles, session tracking, and intelligent logging.

## Features

### Core Functionality

1. **Session Management**
   - Start/pause/stop sessions with a simple button interface
   - Configurable rounds (default: 16)
   - Customizable work duration (default: 50 minutes)
   - Customizable break duration (default: 10 minutes, min: 0 minutes for no breaks)

2. **Profile System**
   - Create multiple profiles with different settings
   - Easily switch between profiles
   - Edit existing profiles
   - Customize questions per profile
   - Delete profiles (with protection for last profile)

3. **Smart Logging**
   - Log notes after each work/break phase
   - Answer customizable multiple-choice questions
   - Questions can be set to appear during work, break, or both phases
   - All logs are saved for future reference
   - View past logs with filtering by profile

4. **Notifications & Background Execution**
   - True persistent foreground service notification:
     - Current phase (work/break)
     - Time remaining (updates smoothly without flicker)
     - Current round / total rounds
     - Remains visible even when app is closed
   - Timer continues running in background
   - Works with screen off or app closed
   - Phase completion notifications
   - Click notifications to quickly log progress

5. **Haptic Feedback**
   - Phone vibrates at the end of each work phase
   - Phone vibrates at the end of each break phase
   - Vibration pattern helps you notice phase transitions

6. **Session Persistence**
   - Sessions automatically save state
   - Resume from where you left off if app closes or crashes
   - All data stored locally on device

## Technology Stack

- **Framework**: Remix (React)
- **Mobile**: Capacitor 6
- **Capacitor Plugins**:
  - `@capacitor/local-notifications` - Phase completion notifications
  - `@capacitor/haptics` - Vibration feedback
  - `@capacitor/preferences` - Local storage
  - `@capawesome-team/capacitor-android-foreground-service` - Background execution & persistent notifications
- **Platform**: Android (iOS support included)

## Project Structure

```
app/
├── components/
│   ├── LoggingModal.tsx         # Modal for logging after phases
│   ├── LogsView.tsx             # View past session logs
│   ├── ProfileManager.tsx       # Profile CRUD interface
│   └── PomodoroTimer.tsx        # Main timer component
├── services/
│   ├── notifications.ts         # Notification & haptics logic
│   ├── sessionController.ts     # Session state management
│   └── storage.ts               # Local storage operations
├── types/
│   └── pomodoro.ts             # TypeScript types
├── styles/
│   └── global.css              # App-wide styles
└── routes/
    └── _index.tsx              # Main route
```

## How to Use

### Starting a Session

1. Select your desired profile from the dropdown
2. Review the session settings (rounds, work/break duration)
3. Click "▶ Start Session"
4. The timer will begin counting down

### During a Session

- The app shows:
  - Current round number
  - Phase type (Work/Break)
  - Time remaining
  - Progress bar
  - Total session time remaining

- You can:
  - Pause the session (Pause button)
  - Stop the session (Stop button)
  - View past logs (View Logs button, only when not in session)

### Phase Transitions

When a work or break phase ends:
1. Phone vibrates
2. Notification appears
3. Logging modal opens automatically
4. Enter notes and answer questions
5. Click "Save Log" or "Skip"

### Managing Profiles

1. Click "+ New Profile" to create a profile
2. Set:
   - Profile name
   - Number of rounds
   - Work duration (minutes, min: 1)
   - Break duration (minutes, min: 0 for no break)
   - Custom questions with multiple-choice options

3. Each question can be set to appear:
   - During work phases only
   - During break phases only
   - During both phases

### Question Configuration

When editing a profile:
- Click "+ Add Question" to add new questions
- For each question:
  - Enter the question text
  - Select when it appears (Work/Break/Both)
  - Add multiple-choice options
  - Reorder or delete options as needed

### Viewing Logs

1. Click "View Logs" button (disabled during active sessions)
2. View all past session logs with:
   - Notes from each phase
   - Answers to questions
   - Timestamps
   - Profile information
3. Filter logs by profile
4. Clear all logs if needed

## Development

### Prerequisites

- Node.js 18+
- npm
- Android Studio (for Android builds)
- Xcode (for iOS builds)

### Setup

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Sync with Capacitor
npx cap sync

# Open in Android Studio
npx cap open android

# Open in Xcode
npx cap open ios
```

### Building for Android

```bash
npm run build
npx cap sync
npx cap open android
```

Use this to run the app on your Android device:
```
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk
export PATH=$JAVA_HOME/bin:$PATH
unset ANDROID_SDK_ROOT # needed if you have multiple android sdks installed
npm run build
npx cap sync
npx cap run android
```

Then in Android Studio:
1. Wait for Gradle sync
2. Build > Build Bundle(s) / APK(s) > Build APK(s)
3. Or run on connected device/emulator

### Building for iOS

```bash
npm run build
npx cap sync
npx cap open ios
```

Then in Xcode:
1. Select your target device
2. Product > Archive (for App Store)
3. Or Product > Run (for testing)

## Permissions

The app requires the following Android permissions:
- `POST_NOTIFICATIONS` - To show notifications
- `VIBRATE` - To vibrate on phase transitions
- `SCHEDULE_EXACT_ALARM` - For precise timing
- `RECEIVE_BOOT_COMPLETED` - To handle system events

## Storage

All data is stored locally using Capacitor Preferences:
- Profiles configuration
- Active profile selection
- Session state (for crash recovery)
- Session logs
- Session summaries

No data is sent to external servers.

## Default Profile

The app comes with a default profile:
- **Name**: Default
- **Rounds**: 16
- **Work Duration**: 50 minutes
- **Break Duration**: 10 minutes
- **Questions**:
  1. "How focused were you?" (Work only)
  2. "How rested do you feel?" (Break only)
  3. "Energy level?" (Both)

## Tips for Best Use

1. **Customize Your Profile**: Adjust rounds and durations to match your workflow
2. **Add Meaningful Questions**: Questions help you track patterns over time
3. **Use Notes Wisely**: Document what you accomplished or any blockers
4. **Keep Notifications On**: They help you notice when phases end
5. **Don't Fight the Timer**: If you need to stop, stop. The session will be saved.
6. **Review Your Logs**: Use the logs view to identify productivity patterns
7. **Zero-Break Sessions**: Set break duration to 0 for continuous work sessions

## Known Limitations

- Android only: iOS may require additional background mode configuration for full background support
- On some heavily customized Android ROMs, background execution may require additional battery optimization settings
- Aggressive battery savers may still kill the service (rare on modern Android)

## Future Enhancements

Possible improvements:
- Session history and analytics
- Charts and statistics
- Export logs to CSV/JSON
- Sync across devices
- Widgets for quick access
- Apple Watch / Wear OS support
- Sound options for notifications
- Dark/light theme toggle

## License

MIT License - Feel free to use and modify as needed.

## Support

For issues or questions, please check the project documentation or create an issue on the repository.

---

Built with ❤️ using Remix and Capacitor
