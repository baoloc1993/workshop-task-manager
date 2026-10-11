import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { paperTheme } from './src/theme/paperTheme';
import { configureNotificationHandler } from './src/notifications/registerPushToken';

// phải gọi trước khi push đầu tiên tới, không phải trong component (chạy
// lại mỗi lần re-render thì vô hại nhưng thừa — set một lần lúc module load là đủ).
configureNotificationHandler();

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider
          theme={paperTheme}
          settings={{ icon: (props) => <MaterialCommunityIcons {...props} /> }}
        >
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
          <StatusBar style="dark" />
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
