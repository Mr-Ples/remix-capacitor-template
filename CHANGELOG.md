# Changelog

All notable changes to Pomodoro Plus will be documented in this file.

## [1.2.0] - 2026-02-11

### Added
- **Background Execution**: App now continues running in the background
  - Using community plugin: `@capawesome-team/capacitor-android-foreground-service`
  - Timer continues when app is closed or screen is off
  - Foreground service keeps app alive automatically
  
- **True Persistent Notifications**: No more flickering
  - Foreground service notifications update smoothly
  - Notification remains visible in notification tray even when app is closed
  - Works properly on Android 8+ with foreground service

### Changed
- Notification system now uses `@capawesome-team/capacitor-android-foreground-service` on Android
- Permissions automatically configured by community plugin
- Session continues running even if app is killed or screen is off
- Added Java 17 compatibility to Android build configuration

### Technical
- Installed `@capawesome-team/capacitor-android-foreground-service@^6.2.0`
- Updated `notifications.ts` to use community foreground service plugin
- Removed custom Java implementations in favor of battle-tested community plugin
- Updated `android/app/build.gradle` to use Java 17 for compilation
- Note: `keep-awake` plugin removed due to Java 21 requirement (not needed as foreground service keeps app alive)

## [1.1.0] - 2026-02-11

### Added
- **Logs View**: New feature to view all past session logs
  - Filter logs by profile
  - View notes and answers from each phase
  - See timestamps and round information
  - Clear all logs functionality
  - Accessible via "View Logs" button in main UI

### Fixed
- **Notification Updates**: Changed notification refresh rate from 10 seconds to 1 second for accurate countdown display
  - Note: Notifications will refresh more frequently, causing brief visual updates (this is a limitation of the Capacitor Local Notifications API)
  - For truly persistent notifications, a custom foreground service plugin would be needed
  
- **Emoji Removal**: Removed all emojis from the UI, replaced with plain text
  - Changed "🍅 Pomodoro Plus" to "Pomodoro Plus"
  - Removed emojis from buttons (Start, Pause, Resume, Stop)
  - Removed emojis from phase indicators
  - Removed emojis from modal titles
  - Removed emojis from notifications

- **Zero-Minute Breaks**: Break duration can now be set to 0 minutes
  - Changed minimum value from 1 to 0 in profile editor
  - Session controller now skips break phase when duration is 0
  - Automatically moves to next round after work phase completes
  - Logging modal still appears for work phases

### Changed
- "View Logs" button is now visible in the header next to the title
- "View Logs" button is disabled during active sessions
- Profile manager now allows 0 as minimum for break duration

## [1.0.0] - 2026-02-11

### Initial Release
- Session management with customizable rounds
- Work and break phase timers
- Profile system for saving different configurations
- Custom questions with multiple-choice answers
- Logging system for tracking notes and answers
- Local notifications for phase transitions
- Haptic feedback (vibration) on phase completion
- Session persistence for crash recovery
- Pause/resume functionality
- Progress tracking and display
