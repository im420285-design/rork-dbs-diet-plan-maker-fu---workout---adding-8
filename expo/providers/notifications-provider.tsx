import createContextHook from '@nkzw/create-context-hook';
import { useEffect, useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { useNutritionStore } from '@/providers/nutrition-provider';

type NotificationsModule = typeof import('expo-notifications');
let Notifications: NotificationsModule | null = null;

const isAndroidExpoGo = Platform.OS === 'android' && Constants?.appOwnership === 'expo';

if (Platform.OS !== 'web' && !isAndroidExpoGo) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Notifications = require('expo-notifications') as NotificationsModule;
  Notifications?.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} else {
  console.log('Notifications disabled on Android Expo Go to avoid unsupported features');
}

export const [NotificationsProvider, useNotifications] = createContextHook(() => {
  const { currentMealPlan, mealLogs, userProfile } = useNutritionStore();

  const requestPermissions = useCallback(async () => {
    if (Platform.OS === 'web' || !Notifications) return;

    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      console.log('Notification permissions not granted');
    }
  }, []);

  const scheduleDailyReminders = useCallback(async () => {
    if (Platform.OS === 'web' || !Notifications || !currentMealPlan || !userProfile) return;

    await Notifications.cancelAllScheduledNotificationsAsync();

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const todayLogs = mealLogs.filter(log => log.date === today);

    const requiredMeals = currentMealPlan.meals.length;
    const loggedMeals = new Set(todayLogs.map(log => log.mealId)).size;

    if (loggedMeals >= requiredMeals) {
      console.log('All meals logged today, no reminders needed');
      return;
    }

    const reminderTimes = [
      { hour: 9, minute: 0, message: 'تذكير: لم تأكل وجبة الإفطار بعد!' },
      { hour: 14, minute: 0, message: 'تذكير: لم تأكل وجبة الغداء بعد!' },
      { hour: 19, minute: 0, message: 'تذكير: لم تأكل وجبة العشاء بعد!' },
    ];

    for (const reminder of reminderTimes) {
      const reminderTime = new Date();
      reminderTime.setHours(reminder.hour, reminder.minute, 0, 0);

      if (reminderTime > now) {
        const secondsUntilReminder = Math.floor((reminderTime.getTime() - now.getTime()) / 1000);
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'تذكير بالوجبات',
            body: reminder.message,
            sound: 'default',
          },
          trigger: secondsUntilReminder as unknown as import('expo-notifications').NotificationTriggerInput,
        });
        console.log(`Scheduled reminder for ${reminder.hour}:${reminder.minute}`);
      }
    }
  }, [currentMealPlan, mealLogs, userProfile]);

  const sendImmediateReminder = useCallback(async (message: string) => {
    if (Platform.OS === 'web' || !Notifications) return;

    await Notifications.presentNotificationAsync({
      title: 'تذكير بالوجبات',
      body: message,
      sound: 'default',
    });
  }, []);

  useEffect(() => {
    requestPermissions();
  }, [requestPermissions]);

  useEffect(() => {
    scheduleDailyReminders();
  }, [scheduleDailyReminders]);

  return useMemo(() => ({
    requestPermissions,
    scheduleDailyReminders,
    sendImmediateReminder,
  }), [requestPermissions, scheduleDailyReminders, sendImmediateReminder]);
});