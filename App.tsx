import { 
  StatusBar, StyleSheet, useColorScheme, View, Text, TouchableOpacity, 
  PermissionsAndroid, Platform, Alert 
} from 'react-native';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkAndRequestBatteryOptimization } from './src/services/BatteryOptimization';
import BackgroundService from 'react-native-background-actions';
import SmsListener from 'react-native-android-sms-listener';
import SendSMS from 'react-native-sms-x';

const sleep = (time) => new Promise((resolve) => setTimeout(resolve, time));

let smsSubscription = null;
const processedSms = new Set(); // Track processed SMS to avoid duplicates

const veryIntensiveTask = async (taskData) => {
  await new Promise(async () => {
    while (await BackgroundService.isRunning()) {
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const formatted = `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;

      console.log('Running in background...', formatted);

      try {
        const existingLogs = await AsyncStorage.getItem('serviceLogs');
        const logs = existingLogs ? JSON.parse(existingLogs) : [];
        logs.push(`Service running at ${formatted}`);
        if (logs.length > 10) logs.splice(0, logs.length - 10);
        await AsyncStorage.setItem('serviceLogs', JSON.stringify(logs));
      } catch (e) {
        console.log('Error saving service log', e);
      }

      await sleep(5000);
    }
  });
};

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [serviceLogs, setServiceLogs] = useState([]);
  const [smsLog, setSmsLog] = useState(''); // Only last SMS

  const options = {
    taskName: 'SMS Forwarder',
    taskTitle: 'SMS Forwarder is running',
    taskDesc: 'Forwarding your messages in the background',
    taskIcon: {
      name: 'ic_launcher',
      type: 'mipmap',
    },
    color: '#ff00ff',
    linkingURI: 'your_scheme://',
    parameters: {
      delay: 1000,
    },
  };

  // Load logs from AsyncStorage on mount
  useEffect(() => {
    const loadLogs = async () => {
      try {
        const storedServiceLogs = await AsyncStorage.getItem('serviceLogs');
        if (storedServiceLogs) setServiceLogs(JSON.parse(storedServiceLogs));

        const storedSmsLog = await AsyncStorage.getItem('smsLogs');
        if (storedSmsLog) setSmsLog(storedSmsLog);

        // Load processed SMS IDs
        const storedProcessedSms = await AsyncStorage.getItem('processedSms');
        if (storedProcessedSms) {
          const parsed = JSON.parse(storedProcessedSms);
          parsed.forEach(id => processedSms.add(id));
        }
      } catch (e) {
        console.log('Error loading logs', e);
      }
    };
    loadLogs();
  }, []);

  // Update service logs every second
  useEffect(() => {
    const interval = setInterval(async () => {
      if (await BackgroundService.isRunning()) {
        const storedLogs = await AsyncStorage.getItem('serviceLogs');
        if (storedLogs) setServiceLogs(JSON.parse(storedLogs));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Generate a unique ID for an SMS
  const getSmsId = (message) => {
    return `${message.originatingAddress}-${message.body}-${message.timestamp}`;
  };

  // Request SMS permission and start listener
  const requestSmsPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
          PermissionsAndroid.PERMISSIONS.SEND_SMS,
        ]);

        const receiveSmsGranted = granted['android.permission.RECEIVE_SMS'] === PermissionsAndroid.RESULTS.GRANTED;
        const sendSmsGranted = granted['android.permission.SEND_SMS'] === PermissionsAndroid.RESULTS.GRANTED;

        if (!receiveSmsGranted) {
          Alert.alert('Permission Denied', 'Cannot listen to SMS without permission.');
          return;
        }

        if (!sendSmsGranted) {
          Alert.alert('Permission Denied', 'Cannot send SMS without permission.');
          return;
        }

        console.log('SMS permissions granted');

        // Remove any existing listener to prevent duplicates
        if (smsSubscription) {
          smsSubscription.remove();
          smsSubscription = null;
        }

        smsSubscription = SmsListener.addListener(async (message) => {
          const smsId = getSmsId(message);

          // Check if SMS has already been processed
          if (processedSms.has(smsId)) {
            console.log('Duplicate SMS ignored:', smsId);
            return;
          }

          // Mark SMS as processed
          processedSms.add(smsId);
          try {
            await AsyncStorage.setItem('processedSms', JSON.stringify([...processedSms]));
          } catch (e) {
            console.log('Error saving processed SMS', e);
          }

          console.log('Received SMS:', message);
          const newLog = `From: ${message.originatingAddress}, Msg: ${message.body}`;

          // Update state
          setSmsLog(newLog);

          // Save in AsyncStorage
          try {
            await AsyncStorage.setItem('smsLogs', newLog);

            // Send SMS only once
            SendSMS.send(123, '023456', newLog, (msgId, msg) => {
              console.log(`Sent message ID: ${msgId}, message: ${msg}`);
            });

          } catch (e) {
            console.log('Error saving or sending SMS log', e);
          }
        });

      } catch (err) {
        console.warn(err);
      }
    }
  };

  // Start background task
  const startBackgroundTask = async () => {
    try {
      await BackgroundService.start(veryIntensiveTask, options);
      await BackgroundService.updateNotification({ taskDesc: 'New task description' });
    } catch (e) {
      console.log('Error starting background task', e);
    }
    await requestSmsPermission();
  };

  // Stop background task and clean up
  const stopBackgroundTask = async () => {
    await BackgroundService.stop();

    try {
      await AsyncStorage.setItem('serviceLogs', JSON.stringify([]));
      setServiceLogs([]);
    } catch (e) {
      console.log('Error clearing service logs', e);
    }

    if (smsSubscription) {
      smsSubscription.remove();
      smsSubscription = null;

      try {
        await AsyncStorage.setItem('smsLogs', '');
        setSmsLog('');
        // Optionally clear processed SMS
        processedSms.clear();
        await AsyncStorage.setItem('processedSms', JSON.stringify([]));
      } catch (e) {
        console.log('Error clearing SMS log', e);
      }
    }
  };

  useEffect(() => {
    const checkBatteryOptimization = async () => {
      await checkAndRequestBatteryOptimization();
    };
    checkBatteryOptimization();
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      <TouchableOpacity style={styles.button} onPress={startBackgroundTask}>
        <Text style={styles.buttonText}>Start Background Task</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, styles.stopButton]} onPress={stopBackgroundTask}>
        <Text style={styles.buttonText}>Stop Background Task</Text>
      </TouchableOpacity>

      {/* Service Logs */}
      <View style={styles.logContainer}>
        <Text style={styles.logTitle}>Service Logs (Last 10):</Text>
        {serviceLogs.map((log, index) => (
          <Text key={index} style={styles.logText}>{log}</Text>
        ))}
      </View>

      {/* SMS Log */}
      <View style={styles.logContainer}>
        <Text style={styles.logTitle}>Last Received SMS:</Text>
        <Text style={styles.logText}>{smsLog}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginTop: 106,
    padding: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  stopButton: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  logContainer: {
    flex: 1,
    marginTop: 20,
  },
  logTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  logText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 5,
  },
});

export default App;