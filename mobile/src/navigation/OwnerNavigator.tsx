import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CreateTaskScreen } from '../screens/CreateTaskScreen';
import { DevicesScreen } from '../screens/DevicesScreen';
import { IssueQrScreen } from '../screens/IssueQrScreen';
import { OwnerHomeScreen } from '../screens/OwnerHomeScreen';

export type OwnerStackParamList = {
  Home: undefined;
  CreateTask: undefined;
  IssueQr: undefined;
  Devices: undefined;
};

const Stack = createNativeStackNavigator<OwnerStackParamList>();

// Vai owner (P-1) — 3 lối tới capability của vòng 1 (xem OwnerHomeScreen).
export function OwnerNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Home" options={{ title: 'Chủ xưởng' }}>
        {({ navigation }) => (
          <OwnerHomeScreen
            onCreateTask={() => navigation.navigate('CreateTask')}
            onIssueQr={() => navigation.navigate('IssueQr')}
            onDevices={() => navigation.navigate('Devices')}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="CreateTask" options={{ title: 'Tạo việc' }}>
        {({ navigation }) => <CreateTaskScreen onDone={() => navigation.goBack()} />}
      </Stack.Screen>
      <Stack.Screen name="IssueQr" options={{ title: 'Cho người mới vào app' }} component={IssueQrScreen} />
      <Stack.Screen name="Devices" options={{ title: 'Máy của thợ' }}>
        {({ navigation }) => <DevicesScreen onIssueNew={() => navigation.navigate('IssueQr')} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
