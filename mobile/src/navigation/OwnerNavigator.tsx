import { useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CreateTaskScreen, type CreateTaskPrefill } from '../screens/CreateTaskScreen';
import { DevicesScreen } from '../screens/DevicesScreen';
import { IssueQrScreen } from '../screens/IssueQrScreen';
import { OwnerHomeScreen } from '../screens/OwnerHomeScreen';
import { VoiceCaptureScreen } from '../screens/VoiceCaptureScreen';

export type OwnerStackParamList = {
  Home: undefined;
  VoiceCapture: undefined;
  CreateTask: undefined;
  IssueQr: undefined;
  Devices: undefined;
};

const Stack = createNativeStackNavigator<OwnerStackParamList>();

// Vai owner (P-1) — lối tới capability đã giao (xem OwnerHomeScreen). CreateTask nhận
// prefill từ VoiceCapture qua state của navigator (không đi qua route params vì phải
// mang cả object ParsedUtterance, không chỉ chuỗi).
export function OwnerNavigator() {
  const [prefill, setPrefill] = useState<CreateTaskPrefill | undefined>(undefined);

  return (
    <Stack.Navigator>
      <Stack.Screen name="Home" options={{ title: 'Chủ xưởng' }}>
        {({ navigation }) => (
          <OwnerHomeScreen
            onCreateTask={() => {
              setPrefill(undefined);
              navigation.navigate('CreateTask');
            }}
            onVoiceCapture={() => navigation.navigate('VoiceCapture')}
            onIssueQr={() => navigation.navigate('IssueQr')}
            onDevices={() => navigation.navigate('Devices')}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="VoiceCapture" options={{ title: 'Nói để giao việc' }}>
        {({ navigation }) => (
          <VoiceCaptureScreen
            onParsed={(result) => {
              setPrefill({
                content: result.content,
                dueAt: result.dueAt,
                assigneeId: result.assigneeId,
              });
              // replace, không navigate: Xong ở CreateTask phải quay thẳng về Home,
              // không lùi lại màn nghe giọng nói đã kết thúc.
              navigation.replace('CreateTask');
            }}
            onFallbackToManual={(partialHeard) => {
              setPrefill(partialHeard ? { content: partialHeard } : undefined);
              navigation.replace('CreateTask');
            }}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="CreateTask" options={{ title: 'Xem lại rồi giao' }}>
        {({ navigation }) => (
          <CreateTaskScreen
            prefill={prefill}
            onDone={() => {
              setPrefill(undefined);
              navigation.goBack();
            }}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="IssueQr" options={{ title: 'Cho người mới vào app' }} component={IssueQrScreen} />
      <Stack.Screen name="Devices" options={{ title: 'Máy của thợ' }}>
        {({ navigation }) => <DevicesScreen onIssueNew={() => navigation.navigate('IssueQr')} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
