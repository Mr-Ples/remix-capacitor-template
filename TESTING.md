# Testing Guide for Pomodoro Plus

This guide will help you test all the features of the Pomodoro Plus app.

## Quick Test Mode

For testing purposes, you may want to create a profile with shorter durations to avoid waiting 50 minutes per work phase:

### Create a Test Profile

1. Open the app
2. Click "+ New Profile"
3. Set:
   - Name: "Quick Test"
   - Rounds: 3
   - Work Duration: 1 minute
   - Break Duration: 1 minute
4. Add a test question or use defaults
5. Click "Save Profile"

## Feature Testing Checklist

### ✅ Profile Management

- [ ] Create a new profile
- [ ] Edit an existing profile
- [ ] Switch between profiles
- [ ] Delete a profile (except the last one)
- [ ] Add custom questions to a profile
- [ ] Remove questions from a profile
- [ ] Change question types (work/break/both)
- [ ] Add/remove question options

### ✅ Session Control

- [ ] Start a session
- [ ] Pause a session
- [ ] Resume a paused session
- [ ] Stop a session mid-way
- [ ] Complete an entire session
- [ ] Progress bar updates correctly
- [ ] Timer counts down accurately

### ✅ Notifications

- [ ] Notification appears at end of work phase
- [ ] Notification appears at end of break phase
- [ ] Ongoing notification shows in notification tray
- [ ] Ongoing notification updates (check after 10+ seconds)
- [ ] Click notification opens app
- [ ] Notification shows correct round number
- [ ] Notification shows correct time remaining

### ✅ Haptics/Vibration

- [ ] Phone vibrates at end of work phase
- [ ] Phone vibrates at end of break phase
- [ ] Vibration pattern is noticeable

### ✅ Logging

- [ ] Logging modal appears after work phase
- [ ] Logging modal appears after break phase
- [ ] Can enter notes in text area
- [ ] Can select multiple-choice answers
- [ ] "Save Log" button saves the log
- [ ] "Skip" button closes modal without saving
- [ ] Clicking outside modal closes it
- [ ] Questions shown match profile settings
- [ ] Work-only questions don't show during break
- [ ] Break-only questions don't show during work
- [ ] "Both" questions show in both phases

### ✅ Session Persistence

- [ ] Close app during session
- [ ] Reopen app - session should resume
- [ ] Force quit app during session
- [ ] Reopen app - session should resume
- [ ] Time elapsed is calculated correctly
- [ ] Correct phase resumes (work or break)
- [ ] Round number is preserved

### ✅ UI/UX

- [ ] All buttons are clickable
- [ ] Text is readable
- [ ] Colors are appropriate
- [ ] Progress bar animates smoothly
- [ ] Modal overlays work correctly
- [ ] Input fields accept text
- [ ] Number inputs accept valid ranges
- [ ] Profile selector shows all profiles
- [ ] Timer display is large and clear

## Test Scenarios

### Scenario 1: Complete Session Flow

1. Create "Quick Test" profile (1 min work, 1 min break, 2 rounds)
2. Select the profile
3. Start session
4. Wait for work phase to complete
5. Verify: vibration, notification, logging modal
6. Enter notes and answer questions
7. Save log
8. Verify break phase starts
9. Wait for break phase to complete
10. Verify: vibration, notification, logging modal
11. Save log
12. Verify round 2 starts
13. Complete round 2
14. Verify session ends
15. Verify "Session Complete" message

### Scenario 2: Pause and Resume

1. Start a session
2. Wait 30 seconds
3. Pause the session
4. Verify timer stops
5. Verify ongoing notification updates
6. Wait 10 seconds
7. Resume the session
8. Verify timer continues from where it left off

### Scenario 3: Profile Switching

1. Create 3 different profiles with different settings
2. Start a session with Profile A
3. Complete one phase
4. Stop the session
5. Switch to Profile B
6. Verify settings changed
7. Start session with Profile B
8. Verify correct work/break durations

### Scenario 4: Crash Recovery

1. Start a session
2. Wait 30 seconds into work phase
3. Force close the app (swipe away from recent apps)
4. Reopen the app
5. Verify session resumes
6. Verify time remaining is approximately correct
7. Verify phase and round are correct

### Scenario 5: Custom Questions

1. Create a profile with:
   - 1 work-only question: "Was this productive?"
   - 1 break-only question: "Are you refreshed?"
   - 1 both question: "Energy level?"
2. Start a session
3. Complete work phase
4. Verify only work and both questions appear
5. Complete break phase
6. Verify only break and both questions appear

### Scenario 6: Long Session

1. Create profile with 4 rounds, 2 min work, 1 min break
2. Start session
3. Complete entire session
4. Verify all notifications work
5. Verify all logging modals appear
6. Verify session ends correctly after last break

## Testing on Different Devices

### Android Testing

- Test on Android 10+
- Test with notification permissions granted
- Test with notification permissions denied
- Test with Do Not Disturb enabled
- Test with battery saver mode
- Test with app in background
- Test with screen off

### Device-Specific Tests

- Test on different screen sizes
- Test in portrait and landscape
- Test with different system fonts
- Test with different Android versions

## Performance Testing

- [ ] App launches quickly
- [ ] Timer updates are smooth (1 second intervals)
- [ ] UI remains responsive during session
- [ ] No memory leaks during long sessions
- [ ] Notifications don't drain battery excessively
- [ ] Storage operations are fast

## Edge Cases

### Test These Edge Cases:

1. **Profile with 1 round**: Should work correctly
2. **Profile with 100 rounds**: Should handle large numbers
3. **Very short durations** (1 minute): Should work
4. **Very long durations** (120 minutes): Should work
5. **No questions in profile**: Logging modal should still appear
6. **Question with 1 option**: Should be selectable
7. **Question with 10+ options**: Should scroll
8. **Very long profile name**: Should display properly
9. **Very long question text**: Should wrap
10. **Empty notes**: Should save log anyway
11. **Unanswered questions**: Should still save

## Known Issues to Verify

Check if these are handled correctly:

- [ ] Closing app immediately after starting session
- [ ] Multiple rapid pause/resume clicks
- [ ] Stopping session during logging modal
- [ ] Deleting active profile
- [ ] Editing profile during active session
- [ ] Phone calls during session
- [ ] Low battery warning during session
- [ ] Time zone changes during session
- [ ] System time changes during session

## Debugging

If something doesn't work:

1. Check browser console (for web testing)
2. Check Android logcat (for Android testing)
3. Verify permissions are granted
4. Clear app data and retry
5. Check storage values using browser dev tools
6. Verify Capacitor plugins are synced

## Web Testing (Development)

For quick iteration during development:

```bash
npm run dev
```

Open in browser (http://localhost:5173)

**Note**: Some features won't work in browser:
- Native notifications (will use browser notifications)
- Haptics (won't vibrate)
- Some persistence features may differ

Use Android build for complete testing.

## Automated Testing

Future enhancement - add:
- Unit tests for services
- Integration tests for components
- E2E tests with Detox or similar

## Test Reports

Document your findings:

```
Date: ___________
Device: ___________
Android Version: ___________
Issues Found:
1. ...
2. ...

Working Features:
1. ...
2. ...
```

---

Happy Testing! 🧪
