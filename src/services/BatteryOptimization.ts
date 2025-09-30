import { NativeModules, Platform, Alert } from 'react-native';

const { BatteryOptimizationModule } = NativeModules;

export const checkBatteryOptimization = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true; // Return true for non-Android platforms
  
  try {
    return await BatteryOptimizationModule.isIgnoringBatteryOptimizations();
  } catch (error) {
    console.error('Error checking battery optimization status:', error);
    return true; // Assume it's not optimized to avoid blocking the app
  }
};

export const requestBatteryOptimization = () => {
  if (Platform.OS !== 'android') return;
  
  Alert.alert(
    'Battery Optimization',
    'For reliable message delivery, please disable battery optimization for this app. This will prevent the system from restricting background activity.',
    [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Open Settings',
        onPress: () => {
          try {
            BatteryOptimizationModule.openBatteryOptimizationSettings();
          } catch (error) {
            console.error('Error opening battery optimization settings:', error);
          }
        },
      },
    ],
    { cancelable: false },
  );
};

export const checkAndRequestBatteryOptimization = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;
  
  const isIgnoring = await checkBatteryOptimization();
  if (!isIgnoring) {
    requestBatteryOptimization();
  }
  return isIgnoring;
};
