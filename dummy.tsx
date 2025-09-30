import React, { useEffect } from 'react';
import { View, Text, PermissionsAndroid, Platform, Alert } from 'react-native';
import SmsListener from 'react-native-android-sms-listener';

const App = () => {
  useEffect(() => {
    let subscription: { remove: () => void } | null = null;

    const requestSmsPermission = async () => {
      if (Platform.OS === 'android') {
        try {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
            {
              title: 'SMS Permission',
              message: 'This app needs access to your SMS to log incoming messages.',
              buttonNeutral: 'Ask Me Later',
              buttonNegative: 'Cancel',
              buttonPositive: 'OK',
            }
          );

          if (granted === PermissionsAndroid.RESULTS.GRANTED) {
            console.log('SMS permission granted');
            subscription = SmsListener.addListener((message) => {
              console.log('Received SMS:', message);
            });
          } else {
            Alert.alert('Permission Denied', 'Cannot listen to SMS without permission.');
          }
        } catch (err) {
          console.warn(err);
        }
      } else {
        // iOS: do nothing, SMS listener only works on Android
      }
    };

    requestSmsPermission();

    return () => {
      // cleanup listener on unmount
      if (subscription) subscription.remove();
    };
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Listening for SMS... Check console for messages.</Text>
    </View>
  );
};

export default App;
