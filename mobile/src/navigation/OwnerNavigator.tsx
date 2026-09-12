import { useEffect, useRef, useState } from 'react';
import { createNativeStackNavigator, type NativeStackNavigationProp } from '@react-navigation/native-stack';
import { HeaderBackButton } from './HeaderBackButton';
import { AssignBatWorkersScreen } from '../screens/AssignBatWorkersScreen';
import { BatQueueScreen } from '../screens/BatQueueScreen';
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
  BatQueue: undefined;
  AssignBatWorkers: { taskId: string };
};

const Stack = createNativeStackNavigator<OwnerStackParamList>();

// Chặn bấm 2 nút điều hướng khác nhau trong tích tắc (dogfood pha I vòng 2,
// kiểm thử): cả hai đều navigate trước khi màn đầu kịp rời đi, đẩy chồng 2 màn
// vào stack, Back phải bấm 2 lần mới đúng. Khoá ngay khi có một lượt điều hướng đang
// chạy, tự mở lại khi Home lấy lại focus (quay về từ màn con — Back hoặc "Giao việc" xong).
function HomeRoute({
  navigation,
  onCreateTask,
}: {
  navigation: NativeStackNavigationProp<OwnerStackParamList, 'Home'>;
  onCreateTask: () => void;
}) {
  const navigatingRef = useRef(false);

  useEffect(() => navigation.addListener('focus', () => {
    navigatingRef.current = false;
  }), [navigation]);

  function goOnce(fn: () => void) {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    fn();
  }

  return (
    <OwnerHomeScreen
      onCreateTask={() => goOnce(onCreateTask)}
      onVoiceCapture={() => goOnce(() => navigation.navigate('VoiceCapture'))}
      onIssueQr={() => goOnce(() => navigation.navigate('IssueQr'))}
      onDevices={() => goOnce(() => navigation.navigate('Devices'))}
      onBatQueue={() => goOnce(() => navigation.navigate('BatQueue'))}
    />
  );
}

// Vai owner (P-1) — lối tới capability đã giao (xem OwnerHomeScreen). CreateTask nhận
// prefill từ VoiceCapture qua state của navigator (không đi qua route params vì phải
// mang cả object ParsedUtterance, không chỉ chuỗi).
export function OwnerNavigator() {
  const [prefill, setPrefill] = useState<CreateTaskPrefill | undefined>(undefined);

  return (
    <Stack.Navigator
      screenOptions={{ headerLeft: ({ canGoBack }) => (canGoBack ? <HeaderBackButton /> : undefined) }}
    >
      <Stack.Screen name="Home" options={{ title: 'Chủ xưởng' }}>
        {({ navigation }) => (
          <HomeRoute
            navigation={navigation}
            onCreateTask={() => {
              setPrefill(undefined);
              navigation.navigate('CreateTask');
            }}
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
                line: result.line,
                measurements: result.measurements,
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
      <Stack.Screen name="BatQueue" options={{ title: 'Việc bạt chờ chia' }}>
        {({ navigation }) => (
          <BatQueueScreen onOpenTask={(taskId) => navigation.navigate('AssignBatWorkers', { taskId })} />
        )}
      </Stack.Screen>
      <Stack.Screen name="AssignBatWorkers" options={{ title: 'Chọn thợ để giao' }}>
        {({ navigation, route }) => (
          <AssignBatWorkersScreen taskId={route.params.taskId} onDone={() => navigation.goBack()} />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
