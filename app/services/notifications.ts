import { LocalNotifications } from '@capacitor/local-notifications';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';

export class NotificationService {
  private static isInitialized = false;
  private static isForegroundServiceRunning = false;

  static async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Request permission for notifications
      const permission = await LocalNotifications.requestPermissions();
      if (permission.display === 'granted') {
        console.log('Notification permission granted');
        this.isInitialized = true;
      } else {
        console.warn('Notification permission denied');
      }
    } catch (error) {
      console.error('Error initializing notifications:', error);
    }
  }

  static async schedulePhaseEndNotification(
    phaseType: 'work' | 'break',
    roundNumber: number,
    totalRounds: number
  ): Promise<void> {
    try {
      await this.initialize();

      const title = phaseType === 'work' ? 'Work Phase Complete!' : 'Break Phase Complete!';
      const body = `Round ${roundNumber}/${totalRounds} - Tap to log your progress`;

      await LocalNotifications.schedule({
        notifications: [
          {
            id: 1,
            title,
            body,
            schedule: { at: new Date(Date.now() + 100) }, // Schedule immediately
            sound: undefined,
            attachments: undefined,
            actionTypeId: 'LOG_ENTRY',
            extra: {
              phaseType,
              roundNumber,
              totalRounds,
            },
          },
        ],
      });
    } catch (error) {
      console.error('Error scheduling notification:', error);
    }
  }

  static async showOngoingNotification(
    timeRemaining: string,
    roundNumber: number,
    totalRounds: number,
    phaseType: 'work' | 'break'
  ): Promise<void> {
    try {
      await this.initialize();

      const phase = phaseType === 'work' ? 'Work Session' : 'Break Time';

      // Use foreground service on native platforms for persistent notification
      if (Capacitor.getPlatform() === 'android') {
        const body = `Round ${roundNumber}/${totalRounds} - ${timeRemaining} remaining`;
        
        try {
          if (!this.isForegroundServiceRunning) {
            console.log('Starting foreground service...');
            await ForegroundService.startForegroundService({
              body,
              id: 1,
              smallIcon: 'ic_launcher_foreground',
              title: phase,
            });
            console.log('Foreground service started successfully');
            this.isForegroundServiceRunning = true;
          } else {
            await ForegroundService.updateForegroundService({
              body,
              id: 1,
              smallIcon: 'ic_launcher_foreground',
              title: phase,
            });
          }
        } catch (error) {
          console.error('Foreground service error:', error);
          // Fallback to local notifications
          await LocalNotifications.schedule({
            notifications: [
              {
                id: 999,
                title: phase,
                body,
                schedule: { at: new Date(Date.now() + 100) },
                sound: undefined,
                attachments: undefined,
              },
            ],
          });
        }
      } else {
        // Fallback to local notifications on web
        const body = `Round ${roundNumber}/${totalRounds} - ${timeRemaining} remaining`;
        await LocalNotifications.schedule({
          notifications: [
            {
              id: 999,
              title: phase,
              body,
              schedule: { at: new Date(Date.now() + 100) },
              sound: undefined,
              attachments: undefined,
              extra: {
                ongoing: true,
              },
            },
          ],
        });
      }
    } catch (error) {
      console.error('Error showing ongoing notification:', error);
    }
  }

  static async clearOngoingNotification(): Promise<void> {
    try {
      if (Capacitor.getPlatform() === 'android') {
        await ForegroundService.stopForegroundService();
        this.isForegroundServiceRunning = false;
      } else {
        await LocalNotifications.cancel({ notifications: [{ id: 999 }] });
      }
    } catch (error) {
      console.error('Error clearing ongoing notification:', error);
    }
  }

  static async vibrate(): Promise<void> {
    try {
      await Haptics.impact({ style: ImpactStyle.Heavy });
    } catch (error) {
      console.error('Error vibrating:', error);
    }
  }

  static async vibratePattern(): Promise<void> {
    try {
      // Create a pattern by calling vibrate multiple times
      await Haptics.impact({ style: ImpactStyle.Heavy });
      await new Promise(resolve => setTimeout(resolve, 200));
      await Haptics.impact({ style: ImpactStyle.Heavy });
      await new Promise(resolve => setTimeout(resolve, 200));
      await Haptics.impact({ style: ImpactStyle.Heavy });
    } catch (error) {
      console.error('Error vibrating pattern:', error);
    }
  }

  static setupNotificationListeners(
    onNotificationClick: (data: any) => void
  ): void {
    LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
      console.log('Notification clicked:', notification);
      onNotificationClick(notification.notification.extra);
    });
  }

  static removeNotificationListeners(): void {
    LocalNotifications.removeAllListeners();
  }
}
