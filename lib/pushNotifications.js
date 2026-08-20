import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// Foreground notifications still show as an alert/sound — without this,
// a push arriving while the app is open is delivered silently.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Registers this device for push and upserts the Expo push token against
// the signed-in user. Best-effort: never throws, since push is a nice-to-
// have, not something that should block getting into the game.
//
// Remote push requires a physical device and a development/production
// build — it does not work in Expo Go (Expo dropped remote push support
// there in SDK 53). It also requires this project to be linked to EAS
// (`eas init`) so a projectId exists, and — for Android — Firebase
// Cloud Messaging credentials configured in the EAS project.
export async function registerForPushNotifications(userId) {
  if (!userId) return;

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== 'granted') {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== 'granted') return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      if (__DEV__) {
        console.warn('No EAS projectId configured — run `eas init` to enable push notifications.');
      }
      return;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return;

    await supabase
      .from('push_tokens')
      .upsert({ token, user_id: userId, updated_at: new Date().toISOString() }, { onConflict: 'token' });
  } catch (e) {
    if (__DEV__) console.warn('push registration failed:', e.message);
  }
}
