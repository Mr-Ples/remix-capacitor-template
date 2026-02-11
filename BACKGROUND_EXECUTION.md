# Background Execution Implementation

This document explains how Pomodoro Plus achieves true background execution on Android using community plugins.

## The Solution

We use two battle-tested community plugins:

1. **@capawesome-team/capacitor-android-foreground-service** - For persistent notifications and background execution
2. **@capacitor-community/keep-awake** - To keep the screen awake during sessions

## Why Community Plugins?

✅ **Battle-tested**: Used by thousands of apps  
✅ **Well-maintained**: Active development and updates  
✅ **Proper permissions**: Handles all Android requirements automatically  
✅ **No custom Java**: Pure TypeScript integration  
✅ **Future-proof**: Updates with new Android versions  

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     JavaScript Layer                         │
├─────────────────────────────────────────────────────────────┤
│  SessionController                                           │
│    ├── KeepAwake.keepAwake()                                │
│    └── NotificationService                                   │
│           └── ForegroundService (community plugin)           │
└────────────────────────────┬────────────────────────────────┘
                             │ Capacitor Bridge
┌────────────────────────────┴────────────────────────────────┐
│                     Native Android Layer                     │
├─────────────────────────────────────────────────────────────┤
│  @capawesome-team/capacitor-android-foreground-service      │
│    └── Android Foreground Service                           │
│           └── Persistent Notification                       │
│                                                              │
│  @capacitor-community/keep-awake                            │
│    └── WindowManager.FLAG_KEEP_SCREEN_ON                    │
└─────────────────────────────────────────────────────────────┘
```

## Plugin Integration

### 1. Foreground Service Plugin

**Installation:**
```bash
npm install @capawesome-team/capacitor-android-foreground-service@^6.2.0
npx cap sync
```

**Usage in notifications.ts:**
```typescript
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';

// Start foreground service
await ForegroundService.startForegroundService({
  body: 'Round 1/16 - 50:00 remaining',
  id: 1,
  smallIcon: 'ic_launcher',
  title: 'Work Session',
});

// Update notification (smooth, no flicker)
await ForegroundService.updateForegroundService({
  body: 'Round 1/16 - 49:59 remaining',
  id: 1,
  smallIcon: 'ic_launcher',
  title: 'Work Session',
});

// Stop service
await ForegroundService.stopForegroundService();
```

**Key Features:**
- Creates Android foreground service automatically
- Handles all permissions (FOREGROUND_SERVICE, etc.)
- Updates notification without recreating
- Service persists even when app is closed
- Configures notification channel properly

### 2. Keep Awake Plugin

**Installation:**
```bash
npm install @capacitor-community/keep-awake@^6.0.0
npx cap sync
```

**Usage in sessionController.ts:**
```typescript
import { KeepAwake } from '@capacitor-community/keep-awake';

// Keep screen on
await KeepAwake.keepAwake();

// Allow sleep when session ends
await KeepAwake.allowSleep();
```

**Key Features:**
- Prevents screen from turning off
- Uses Android's WindowManager.FLAG_KEEP_SCREEN_ON
- Automatically handles WAKE_LOCK permission
- No impact on battery when used correctly

## Permissions

Both plugins handle permissions automatically. The required permissions are:

```xml
<!-- Automatically added by @capawesome-team/capacitor-android-foreground-service -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />

<!-- Automatically added by @capacitor-community/keep-awake -->
<uses-permission android:name="android.permission.WAKE_LOCK" />

<!-- Already configured -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.VIBRATE" />
```

No manual AndroidManifest.xml configuration needed!

## How It Works: Step by Step

### Starting a Session

1. User clicks "Start Session"
2. `SessionController.startSession()` calls `KeepAwake.keepAwake()`
3. Screen stays on, preventing sleep
4. `NotificationService.showOngoingNotification()` is called
5. Detects Android platform → calls `ForegroundService.startForegroundService()`
6. Plugin creates foreground service with notification
7. Timer starts ticking

### During Session (Background)

1. Every second, timer updates
2. Calls `ForegroundService.updateForegroundService()`
3. Notification updates smoothly (no recreation)
4. Even if app is closed:
   - Foreground service keeps running
   - Notification stays visible
   - JavaScript continues in WebView (kept alive by foreground service)

### Reopening the App

1. User clicks notification or app icon
2. `SessionController.resumeSession()` checks saved state
3. Calculates elapsed time
4. UI syncs with current progress

### Ending a Session

1. Session completes or user stops
2. Calls `ForegroundService.stopForegroundService()`
3. Calls `KeepAwake.allowSleep()`
4. Notification removed
5. Screen can sleep again

## Platform Detection

```typescript
if (Capacitor.getPlatform() === 'android') {
  // Use foreground service
  await ForegroundService.startForegroundService({...});
} else {
  // Fallback for web/iOS
  await LocalNotifications.schedule({...});
}
```

## Advantages Over Custom Implementation

| Aspect | Custom Java | Community Plugin |
|--------|-------------|------------------|
| **Development Time** | Days | Minutes |
| **Maintenance** | Manual updates needed | Auto-updated |
| **Testing** | Test on all Android versions | Already tested |
| **Permissions** | Manual configuration | Auto-configured |
| **Bug Fixes** | Implement yourself | Community fixes |
| **Documentation** | Write yourself | Comprehensive docs |
| **Android Updates** | Break your code | Plugin handles it |

## Battery Impact

The implementation is battery-efficient:

- Foreground service uses IMPORTANCE_LOW
- KeepAwake only active during sessions
- Notifications update once per second (reasonable)
- Service stops immediately when session ends
- No unnecessary wake locks or alarms

## Testing Checklist

1. ✅ Start session → notification appears
2. ✅ Close app → notification persists, timer continues
3. ✅ Update every second → no flicker
4. ✅ Lock screen → timer continues
5. ✅ Reopen app → correct time displayed
6. ✅ Phase completes while closed → vibration + notification
7. ✅ Stop session → notification removed, screen can sleep

## Troubleshooting

### Service Doesn't Start

**Solution**: Ensure plugins are synced
```bash
npm run build
npx cap sync
```

### Notification Disappears

**Check**:
- Battery optimization disabled for app
- "Don't optimize" in battery settings
- Some manufacturers (Xiaomi, Huawei) require additional settings

### Timer Stops

**Check**:
- KeepAwake is called before starting timer
- Check Android logcat for errors
- Ensure foreground service notification is visible

## Plugin Documentation

- [Foreground Service Plugin](https://github.com/capawesome-team/capacitor-android-foreground-service)
- [Keep Awake Plugin](https://github.com/capacitor-community/keep-awake)

## Future Enhancements

- Add notification action buttons (pause/stop)
- Implement iOS background modes
- Add background task scheduling
- Notification customization options

## Summary

Using community plugins provides:

✅ **True background execution**  
✅ **Smooth, persistent notifications**  
✅ **Production-ready reliability**  
✅ **Minimal maintenance burden**  
✅ **Battle-tested by thousands of apps**  
✅ **Automatic permission handling**  

This is the recommended approach for any Capacitor app requiring background execution.
